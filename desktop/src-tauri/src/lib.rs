//! Noctcom escritorio — launcher + selector de instancia.
//!
//! v1: la app no empaqueta el frontend Next (incompatible con export estático).
//! Trae un launcher estático propio y, al conectar, carga la web de la instancia
//! elegida (cloud o self-host) en una ventana webview remota separada. El
//! acceso nativo a discos (Connector) llega en una fase posterior.

use std::time::Duration;

use serde::Serialize;
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

#[derive(Serialize)]
struct PingResult {
    reachable: bool,
    status: u16,
}

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![ping_instance, open_instance])
        .run(tauri::generate_context!())
        .expect("error al arrancar Noctcom escritorio");
}
