//! Noctcom Connector — agente local.
//!
//! M0: emparejamiento con la cuenta (código de un solo uso) + canal WS saliente
//! autenticado por challenge-response (firma Ed25519) + heartbeat. La gestión de
//! discos (listar/montar/formatear/chunks) llega en M1–M3.

mod config;
mod disk;
mod format;
mod i18n;
mod identity;
mod protocol;
mod update;
mod util;
mod volume;

use anyhow::{anyhow, Context, Result};
use clap::{Parser, Subcommand};
use config::State;
use futures_util::{SinkExt, StreamExt};
use identity::Identity;
use protocol::{ClientMsg, ServerMsg};
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::mpsc;
use tokio::time::Instant;
use tokio_tungstenite::connect_async;
use tokio_tungstenite::tungstenite::Message;

const DEFAULT_SERVER: &str = "https://api.noctcom.com";
const HEARTBEAT_SECS: u64 = 30;

#[derive(Parser)]
#[command(name = "noctcom-connector", version, about = "Agente local de Noctcom")]
struct Cli {
    #[command(subcommand)]
    cmd: Cmd,
}

#[derive(Subcommand)]
enum Cmd {
    /// Empareja este agente con tu cuenta usando el código que muestra la web.
    Pair {
        #[arg(long)]
        code: String,
        #[arg(long, default_value = DEFAULT_SERVER)]
        server: String,
    },
    /// Conecta el agente y queda a la escucha de la web.
    Run {
        #[arg(long)]
        server: Option<String>,
    },
    /// Muestra si el agente está emparejado.
    Status,
    /// Descarga e instala la última versión del agente si hay una más nueva.
    Update {
        #[arg(long)]
        server: Option<String>,
    },
}

fn main() -> Result<()> {
    let cli = Cli::parse();
    match cli.cmd {
        Cmd::Pair { code, server } => pair(&code, &server),
        Cmd::Status => status(),
        Cmd::Run { server } => tokio::runtime::Runtime::new()?.block_on(run(server)),
        Cmd::Update { server } => update_cmd(server),
    }
}

/// Resuelve el servidor (override > estado > por defecto) y lanza la actualización.
fn update_cmd(server_override: Option<String>) -> Result<()> {
    let state = State::load()?;
    let server = server_override
        .or(state.server)
        .unwrap_or_else(|| DEFAULT_SERVER.to_string());
    update::run_update(&server)
}

/// Empareja: registra la clave pública del agente en el backend con el código.
fn pair(code: &str, server: &str) -> Result<()> {
    let identity = Identity::load_or_create(&config::identity_path()?)?;
    let server = server.trim_end_matches('/').to_string();
    let url = format!("{server}/api/v1/agent/pair/complete");

    let payload = serde_json::json!({
        "code": code.trim(),
        "agentPublicKey": identity.public_key_b64(),
        "platform": util::platform(),
    });

    let resp = match ureq::post(&url).send_json(payload) {
        Ok(r) => r,
        Err(ureq::Error::Status(status, r)) => {
            let body = r.into_string().unwrap_or_default();
            anyhow::bail!("{}", i18n::pick(
                &format!("el servidor rechazó el emparejamiento (HTTP {status}): {body}"),
                &format!("the server rejected the pairing (HTTP {status}): {body}"),
            ));
        }
        Err(e) => return Err(anyhow!("{}", i18n::pick(
            &format!("error de red al emparejar: {e}"),
            &format!("network error while pairing: {e}"),
        ))),
    };

    let body: serde_json::Value = resp.into_json().context("respuesta no es JSON")?;
    let agent_id = body["agentId"]
        .as_str()
        .ok_or_else(|| anyhow!("la respuesta no incluye agentId"))?
        .to_string();

    let mut state = State::load()?;
    state.agent_id = Some(agent_id.clone());
    state.server = Some(server);
    state.save()?;

    println!("{}", i18n::pick(
        &format!("✓ Agente emparejado (id {agent_id})."),
        &format!("✓ Agent paired (id {agent_id})."),
    ));
    println!("{}", i18n::pick(
        "  Ejecuta `noctcom-connector run` para conectarlo.",
        "  Run `noctcom-connector run` to connect it.",
    ));
    Ok(())
}

fn status() -> Result<()> {
    let state = State::load()?;
    println!("Noctcom Connector v{}", update::current_version());
    match state.agent_id {
        Some(id) => {
            let server = state.server.unwrap_or_else(|| DEFAULT_SERVER.to_string());
            println!("{}", i18n::pick(
                &format!("Emparejado.\n  agentId: {id}\n  servidor: {server}"),
                &format!("Paired.\n  agentId: {id}\n  server: {server}"),
            ));
        }
        None => println!("{}", i18n::pick(
            "No emparejado. Usa `noctcom-connector pair --code <CÓDIGO>`.",
            "Not paired. Use `noctcom-connector pair --code <CODE>`.",
        )),
    }
    Ok(())
}

/// Conecta el canal WS, se autentica firmando el reto y mantiene el heartbeat.
///
/// Los comandos se procesan en tareas independientes y sus respuestas se
/// encolan por un canal (`mpsc`) hacia el único escritor del socket. Así una
/// operación lenta (escribir un chunk, formatear) no bloquea ni el heartbeat ni
/// la recepción de otros comandos.
async fn run(server_override: Option<String>) -> Result<()> {
    let identity = Arc::new(Identity::load_or_create(&config::identity_path()?)?);
    let state = State::load()?;
    let agent_id = state
        .agent_id
        .ok_or_else(|| anyhow!("{}", i18n::pick(
            "este agente no está emparejado; ejecuta `pair` primero",
            "this agent is not paired; run `pair` first",
        )))?;
    let server = server_override
        .or(state.server)
        .unwrap_or_else(|| DEFAULT_SERVER.to_string());

    // Limpieza de una actualización previa + aviso si hay versión nueva. En una
    // tarea aparte para no retrasar la conexión ni bloquear el runtime.
    {
        let server = server.clone();
        tokio::task::spawn_blocking(move || {
            update::cleanup_old();
            update::check_and_notify(&server);
        });
    }

    let ws_url = to_ws_url(&server, &agent_id);
    println!("{}", i18n::pick(
        &format!("Conectando a {ws_url}…"),
        &format!("Connecting to {ws_url}…"),
    ));
    let (stream, _) = connect_async(ws_url.as_str())
        .await
        .context("no se pudo abrir el WebSocket")?;
    let (mut write, mut read) = stream.split();

    // Canal de salida: todo lo que se escribe en el socket pasa por aquí, de modo
    // que solo el bucle principal toca `write` (sin condiciones de carrera).
    let (tx, mut rx) = mpsc::unbounded_channel::<Message>();

    let mut hb = tokio::time::interval_at(
        Instant::now() + Duration::from_secs(HEARTBEAT_SECS),
        Duration::from_secs(HEARTBEAT_SECS),
    );
    println!("{}", i18n::pick(
        "Conectado. Esperando reto de autenticación…",
        "Connected. Waiting for authentication challenge…",
    ));

    loop {
        tokio::select! {
            maybe = read.next() => {
                let Some(item) = maybe else {
                    println!("{}", i18n::pick(
                        "El servidor cerró la conexión.",
                        "The server closed the connection.",
                    ));
                    break;
                };
                match item.context("error de WebSocket")? {
                    Message::Text(txt) => process_incoming(identity.clone(), txt.to_string(), &tx),
                    Message::Ping(p) => { let _ = tx.send(Message::Pong(p)); }
                    Message::Close(_) => {
                        println!("{}", i18n::pick("Conexión cerrada.", "Connection closed."));
                        break;
                    }
                    _ => {}
                }
            }
            Some(out) = rx.recv() => {
                write.send(out).await?;
            }
            _ = hb.tick() => {
                let msg = serde_json::to_string(&ClientMsg::Heartbeat)?;
                write.send(Message::Text(msg)).await?;
            }
            _ = tokio::signal::ctrl_c() => {
                println!("{}", i18n::pick("Cerrando…", "Shutting down…"));
                break;
            }
        }
    }
    Ok(())
}

/// Procesa un mensaje entrante. Lo rápido (reto/auth) se resuelve en el acto; un
/// comando se ejecuta en una tarea aparte y su respuesta se encola por `tx`.
fn process_incoming(identity: Arc<Identity>, txt: String, tx: &mpsc::UnboundedSender<Message>) {
    let msg: ServerMsg = match serde_json::from_str(&txt) {
        Ok(m) => m,
        Err(_) => return,
    };
    match msg {
        ServerMsg::Challenge { nonce } => {
            let Ok(nonce_bytes) = util::unb64(&nonce) else { return };
            let signature = identity.sign_b64(&nonce_bytes);
            println!("{}", i18n::pick(
                "Reto recibido; firmando…",
                "Challenge received; signing…",
            ));
            if let Ok(reply) = serde_json::to_string(&ClientMsg::Auth { signature }) {
                let _ = tx.send(Message::Text(reply));
            }
        }
        ServerMsg::Ready => println!("{}", i18n::pick(
            "✓ Autenticado. Canal operativo.",
            "✓ Authenticated. Channel ready.",
        )),
        ServerMsg::HeartbeatAck { .. } => {}
        ServerMsg::Cmd { id, cmd, args } => {
            let tx = tx.clone();
            tokio::spawn(async move {
                let reply = match handle_cmd(&cmd, &args).await {
                    Ok(data) => ClientMsg::Res { id, ok: true, data: Some(data), error: None },
                    Err(e) => {
                        println!("{}", i18n::pick(
                            &format!("Comando '{cmd}' falló: {e}"),
                            &format!("Command '{cmd}' failed: {e}"),
                        ));
                        ClientMsg::Res { id, ok: false, data: None, error: Some(e.to_string()) }
                    }
                };
                if let Ok(s) = serde_json::to_string(&reply) {
                    let _ = tx.send(Message::Text(s));
                }
            });
        }
        ServerMsg::Unknown => {}
    }
}

/// Lee un argumento de tipo string de los `args` de un comando.
fn arg_str(args: &serde_json::Value, key: &str) -> Result<String> {
    args.get(key)
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .ok_or_else(|| anyhow!("falta el argumento '{key}'"))
}

/// Ejecuta un comando del backend.
/// M1: list-disks (solo lectura). M2a: register-volume. M2b: format-volume
/// (destructivo). M3: write/read/delete-chunk (blobs YA cifrados).
async fn handle_cmd(cmd: &str, args: &serde_json::Value) -> Result<serde_json::Value> {
    match cmd {
        "list-disks" => {
            let disks = tokio::task::spawn_blocking(disk::list)
                .await
                .context("tarea de listado de discos")??;
            Ok(serde_json::json!({ "disks": disks }))
        }
        "register-volume" => {
            let path = arg_str(args, "path")?;
            println!("{}", i18n::pick(
                &format!("Registrando volumen en '{path}' (no destructivo)…"),
                &format!("Registering volume at '{path}' (non-destructive)…"),
            ));
            let info = tokio::task::spawn_blocking(move || volume::register(&path))
                .await
                .context("tarea de registro de volumen")??;
            Ok(serde_json::json!(info))
        }
        "format-volume" => {
            let drive_letter = arg_str(args, "driveLetter")?;
            let label = arg_str(args, "label")?;
            println!("{}", i18n::pick(
                &format!("Formateando volumen '{drive_letter}:' (DESTRUCTIVO)…"),
                &format!("Formatting volume '{drive_letter}:' (DESTRUCTIVE)…"),
            ));
            let info = tokio::task::spawn_blocking(move || format::format_volume(&drive_letter, &label))
                .await
                .context("tarea de formateo")??;
            Ok(serde_json::json!(info))
        }
        "write-chunk" => {
            let path = arg_str(args, "path")?;
            let key = arg_str(args, "key")?;
            let data = util::unb64(&arg_str(args, "dataB64")?)?;
            tokio::task::spawn_blocking(move || volume::write_chunk(&path, &key, &data))
                .await
                .context("tarea de escritura de chunk")??;
            Ok(serde_json::json!({ "ok": true }))
        }
        "read-chunk" => {
            let path = arg_str(args, "path")?;
            let key = arg_str(args, "key")?;
            let data = tokio::task::spawn_blocking(move || volume::read_chunk(&path, &key))
                .await
                .context("tarea de lectura de chunk")??;
            Ok(serde_json::json!({ "dataB64": util::b64(&data) }))
        }
        "delete-chunk" => {
            let path = arg_str(args, "path")?;
            let key = arg_str(args, "key")?;
            tokio::task::spawn_blocking(move || volume::delete_chunk(&path, &key))
                .await
                .context("tarea de borrado de chunk")??;
            Ok(serde_json::json!({ "ok": true }))
        }
        other => anyhow::bail!("comando no soportado: {other}"),
    }
}

/// Deriva la URL del WebSocket del agente a partir de la del servidor.
fn to_ws_url(server: &str, agent_id: &str) -> String {
    let base = server.trim_end_matches('/');
    let ws = if let Some(rest) = base.strip_prefix("https://") {
        format!("wss://{rest}")
    } else if let Some(rest) = base.strip_prefix("http://") {
        format!("ws://{rest}")
    } else {
        base.to_string()
    };
    format!("{ws}/api/v1/agent/ws?agentId={agent_id}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ws_url_https_to_wss() {
        assert_eq!(
            to_ws_url("https://api.noctcom.com", "abc"),
            "wss://api.noctcom.com/api/v1/agent/ws?agentId=abc"
        );
        assert_eq!(
            to_ws_url("http://localhost:3000/", "x1"),
            "ws://localhost:3000/api/v1/agent/ws?agentId=x1"
        );
    }

    #[test]
    fn list_disks_runs_on_this_platform() {
        // Ejerce el camino real del SO (PowerShell en Windows, lsblk en Linux).
        // En cualquier máquina real hay al menos un volumen montado.
        let disks = disk::list().expect("disk::list debe devolver Ok");
        assert!(!disks.is_empty(), "se esperaba al menos un disco/volumen");
        for d in &disks {
            assert!(!d.id.is_empty(), "cada disco debe tener id");
        }
    }

    #[test]
    fn sign_roundtrips_with_dalek_verify() {
        use ed25519_dalek::{Signature, Verifier, VerifyingKey};
        let dir = std::env::temp_dir().join(format!("noctcom-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let key_path = dir.join("identity.key");
        let _ = std::fs::remove_file(&key_path);
        let id = Identity::load_or_create(&key_path).unwrap();

        let nonce = b"0123456789abcdef0123456789abcdef";
        let sig_b64 = id.sign_b64(nonce);
        let pub_b64 = id.public_key_b64();

        let pub_bytes: [u8; 32] = util::unb64(&pub_b64).unwrap().try_into().unwrap();
        let sig_bytes: [u8; 64] = util::unb64(&sig_b64).unwrap().try_into().unwrap();
        let vk = VerifyingKey::from_bytes(&pub_bytes).unwrap();
        assert!(vk.verify(nonce, &Signature::from_bytes(&sig_bytes)).is_ok());
        let _ = std::fs::remove_file(&key_path);
    }
}
