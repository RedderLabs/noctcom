//! Noctcom Connector — agente local.
//!
//! M0: emparejamiento con la cuenta (código de un solo uso) + canal WS saliente
//! autenticado por challenge-response (firma Ed25519) + heartbeat. La gestión de
//! discos (listar/montar/formatear/chunks) llega en M1–M3.

mod config;
mod disk;
mod identity;
mod protocol;
mod util;
mod volume;

use anyhow::{anyhow, Context, Result};
use clap::{Parser, Subcommand};
use config::State;
use futures_util::{SinkExt, StreamExt};
use identity::Identity;
use protocol::{ClientMsg, ServerMsg};
use std::time::Duration;
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
}

fn main() -> Result<()> {
    let cli = Cli::parse();
    match cli.cmd {
        Cmd::Pair { code, server } => pair(&code, &server),
        Cmd::Status => status(),
        Cmd::Run { server } => tokio::runtime::Runtime::new()?.block_on(run(server)),
    }
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
            anyhow::bail!("el servidor rechazó el emparejamiento (HTTP {status}): {body}");
        }
        Err(e) => return Err(anyhow!("error de red al emparejar: {e}")),
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

    println!("✓ Agente emparejado (id {agent_id}).");
    println!("  Ejecuta `noctcom-connector run` para conectarlo.");
    Ok(())
}

fn status() -> Result<()> {
    let state = State::load()?;
    match state.agent_id {
        Some(id) => println!(
            "Emparejado.\n  agentId: {id}\n  servidor: {}",
            state.server.unwrap_or_else(|| DEFAULT_SERVER.to_string())
        ),
        None => println!("No emparejado. Usa `noctcom-connector pair --code <CÓDIGO>`."),
    }
    Ok(())
}

/// Conecta el canal WS, se autentica firmando el reto y mantiene el heartbeat.
async fn run(server_override: Option<String>) -> Result<()> {
    let identity = Identity::load_or_create(&config::identity_path()?)?;
    let state = State::load()?;
    let agent_id = state
        .agent_id
        .ok_or_else(|| anyhow!("este agente no está emparejado; ejecuta `pair` primero"))?;
    let server = server_override
        .or(state.server)
        .unwrap_or_else(|| DEFAULT_SERVER.to_string());

    let ws_url = to_ws_url(&server, &agent_id);
    println!("Conectando a {ws_url}…");
    let (stream, _) = connect_async(ws_url.as_str())
        .await
        .context("no se pudo abrir el WebSocket")?;
    let (mut write, mut read) = stream.split();

    let mut hb = tokio::time::interval_at(
        Instant::now() + Duration::from_secs(HEARTBEAT_SECS),
        Duration::from_secs(HEARTBEAT_SECS),
    );
    println!("Conectado. Esperando reto de autenticación…");

    loop {
        tokio::select! {
            maybe = read.next() => {
                let Some(item) = maybe else { println!("El servidor cerró la conexión."); break; };
                match item.context("error de WebSocket")? {
                    Message::Text(txt) => {
                        if let Some(reply) = handle_message(&identity, txt.as_str()).await {
                            write.send(Message::Text(reply.into())).await?;
                        }
                    }
                    Message::Ping(p) => write.send(Message::Pong(p)).await?,
                    Message::Close(_) => { println!("Conexión cerrada."); break; }
                    _ => {}
                }
            }
            _ = hb.tick() => {
                let msg = serde_json::to_string(&ClientMsg::Heartbeat)?;
                write.send(Message::Text(msg.into())).await?;
            }
            _ = tokio::signal::ctrl_c() => { println!("Cerrando…"); break; }
        }
    }
    Ok(())
}

/// Procesa un mensaje del servidor; devuelve la respuesta a enviar (si la hay).
async fn handle_message(identity: &Identity, txt: &str) -> Option<String> {
    let msg: ServerMsg = serde_json::from_str(txt).ok()?;
    match msg {
        ServerMsg::Challenge { nonce } => {
            let nonce_bytes = util::unb64(&nonce).ok()?;
            let signature = identity.sign_b64(&nonce_bytes);
            println!("Reto recibido; firmando…");
            serde_json::to_string(&ClientMsg::Auth { signature }).ok()
        }
        ServerMsg::Ready => {
            println!("✓ Autenticado. Canal operativo.");
            None
        }
        ServerMsg::HeartbeatAck { .. } => None,
        ServerMsg::Cmd { id, cmd, args } => {
            let reply = match handle_cmd(&cmd, &args).await {
                Ok(data) => ClientMsg::Res { id, ok: true, data: Some(data), error: None },
                Err(e) => {
                    println!("Comando '{cmd}' falló: {e}");
                    ClientMsg::Res { id, ok: false, data: None, error: Some(e.to_string()) }
                }
            };
            serde_json::to_string(&reply).ok()
        }
        ServerMsg::Unknown => None,
    }
}

/// Ejecuta un comando del backend.
/// M1: list-disks (solo lectura). M2: register-volume (no destructivo).
async fn handle_cmd(cmd: &str, args: &serde_json::Value) -> Result<serde_json::Value> {
    match cmd {
        "list-disks" => {
            let disks = tokio::task::spawn_blocking(disk::list)
                .await
                .context("tarea de listado de discos")??;
            Ok(serde_json::json!({ "disks": disks }))
        }
        "register-volume" => {
            let path = args
                .get("path")
                .and_then(|v| v.as_str())
                .ok_or_else(|| anyhow!("falta el argumento 'path'"))?
                .to_string();
            println!("Registrando volumen en '{path}' (no destructivo)…");
            let info = tokio::task::spawn_blocking(move || volume::register(&path))
                .await
                .context("tarea de registro de volumen")??;
            Ok(serde_json::json!(info))
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
