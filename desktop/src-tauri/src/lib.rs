//! Noctcom escritorio — launcher + selector de instancia + Connector embebido.
//!
//! v1: la app no empaqueta el frontend Next (incompatible con export estático).
//! Trae un launcher estático propio y, al conectar, carga la web de la instancia
//! elegida (cloud o self-host) en una ventana webview remota separada.
//!
//! Fase 2: el Connector (agent/) viaja como *sidecar*. La app puede emparejarlo,
//! arrancarlo y pararlo, dando acceso nativo a discos sin instalación aparte.

use std::sync::Mutex;
use std::time::Duration;

use serde::Serialize;
use tauri::{AppHandle, Manager, State, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_shell::process::CommandChild;
use tauri_plugin_shell::ShellExt;

#[derive(Serialize)]
struct PingResult {
    reachable: bool,
    status: u16,
}

#[derive(Serialize)]
struct CmdResult {
    ok: bool,
    output: String,
}

/// Proceso `connector run` en marcha (si lo hay). Único: el Connector se empareja
/// con UNA instancia a la vez (su estado guarda un solo servidor/identidad).
#[derive(Default)]
struct ConnectorState(Mutex<Option<CommandChild>>);

/// Comprueba si una instancia responde. Hecho en Rust a propósito: evita el CORS
/// y el mixed-content del navegador, y acepta el cert autofirmado del self-host
/// en LAN (HTTPS por IP) — un fallo de validación TLS no debe marcarla "caída".
#[tauri::command]
async fn ping_instance(url: String) -> PingResult {
    let client = match reqwest::Client::builder()
        .danger_accept_invalid_certs(true)
        .timeout(Duration::from_secs(6))
        .build()
    {
        Ok(c) => c,
        Err(_) => return PingResult { reachable: false, status: 0 },
    };

    match client.get(&url).send().await {
        Ok(resp) => PingResult {
            reachable: true,
            status: resp.status().as_u16(),
        },
        Err(_) => PingResult {
            reachable: false,
            status: 0,
        },
    }
}

/// Abre (o reusa) la ventana "instance" cargando la web de la instancia elegida.
/// Esa ventana es un webview remoto SIN ninguna capability → no puede invocar
/// comandos Tauri (scoping en capabilities/default.json, solo "launcher").
#[tauri::command]
async fn open_instance(app: AppHandle, url: String, name: String) -> Result<(), String> {
    let parsed: tauri::Url = url.parse().map_err(|_| "URL inválida".to_string())?;

    if let Some(win) = app.get_webview_window("instance") {
        win.navigate(parsed).map_err(|e| e.to_string())?;
        let _ = win.set_focus();
        return Ok(());
    }

    WebviewWindowBuilder::new(&app, "instance", WebviewUrl::External(parsed))
        .title(format!("Noctcom — {name}"))
        .inner_size(1200.0, 800.0)
        .center()
        .build()
        .map_err(|e| e.to_string())?;

    Ok(())
}

/// Ejecuta el sidecar del Connector con `args` y espera a que termine (para
/// `pair` y `status`, que son cortos).
async fn connector_run_once(app: &AppHandle, args: Vec<String>) -> Result<CmdResult, String> {
    let sidecar = app
        .shell()
        .sidecar("noctcom-connector")
        .map_err(|e| e.to_string())?;
    let out = sidecar
        .args(args)
        .output()
        .await
        .map_err(|e| e.to_string())?;
    let mut text = String::from_utf8_lossy(&out.stdout).to_string();
    let err = String::from_utf8_lossy(&out.stderr);
    if !err.trim().is_empty() {
        if !text.is_empty() {
            text.push('\n');
        }
        text.push_str(&err);
    }
    Ok(CmdResult {
        ok: out.status.success(),
        output: text.trim().to_string(),
    })
}

/// Estado del Connector (texto de `connector status`).
#[tauri::command]
async fn connector_status(app: AppHandle) -> Result<CmdResult, String> {
    connector_run_once(&app, vec!["status".into()]).await
}

/// Empareja el Connector con una instancia usando el código de un solo uso que
/// muestra la web de esa instancia (Ajustes → Connector).
#[tauri::command]
async fn connector_pair(app: AppHandle, server: String, code: String) -> Result<CmdResult, String> {
    connector_run_once(
        &app,
        vec![
            "pair".into(),
            "--code".into(),
            code,
            "--server".into(),
            server,
        ],
    )
    .await
}

/// Arranca `connector run` en segundo plano y guarda el handle del proceso.
#[tauri::command]
async fn connector_start(
    app: AppHandle,
    state: State<'_, ConnectorState>,
    server: String,
) -> Result<(), String> {
    {
        let guard = state.0.lock().map_err(|_| "estado bloqueado".to_string())?;
        if guard.is_some() {
            return Ok(());
        }
    }
    let sidecar = app
        .shell()
        .sidecar("noctcom-connector")
        .map_err(|e| e.to_string())?;
    let (mut rx, child) = sidecar
        .args(["run".to_string(), "--server".to_string(), server])
        .spawn()
        .map_err(|e| e.to_string())?;

    {
        let mut guard = state.0.lock().map_err(|_| "estado bloqueado".to_string())?;
        *guard = Some(child);
    }

    // Drenar los eventos del proceso para que su buffer no se llene (si no se lee
    // el stdout, el hijo puede bloquearse). No reenviamos logs en v1.
    tauri::async_runtime::spawn(async move { while rx.recv().await.is_some() {} });

    Ok(())
}

/// Para el proceso del Connector si está en marcha.
#[tauri::command]
async fn connector_stop(state: State<'_, ConnectorState>) -> Result<(), String> {
    let child = {
        let mut guard = state.0.lock().map_err(|_| "estado bloqueado".to_string())?;
        guard.take()
    };
    if let Some(child) = child {
        child.kill().map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// ¿Hay un `connector run` en marcha lanzado por esta app?
#[tauri::command]
fn connector_running(state: State<'_, ConnectorState>) -> bool {
    state
        .0
        .lock()
        .map(|g| g.is_some())
        .unwrap_or(false)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(ConnectorState::default())
        .invoke_handler(tauri::generate_handler![
            ping_instance,
            open_instance,
            connector_status,
            connector_pair,
            connector_start,
            connector_stop,
            connector_running,
        ])
        .run(tauri::generate_context!())
        .expect("error al arrancar Noctcom escritorio");
}
