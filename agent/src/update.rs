//! Auto-actualización del agente (M4).
//!
//! El agente consulta al backend la última versión publicada
//! (`GET /api/v1/agent/version`). Al arrancar avisa si hay una más nueva, y el
//! subcomando `update` la descarga y reemplaza el binario en caliente (renombrar
//! el .exe en uso es válido en Windows). No hay instalación como servicio: el
//! usuario relanza `run` tras actualizar.

use anyhow::{anyhow, Context, Result};
use serde::Deserialize;
use std::path::Path;

const CURRENT_VERSION: &str = env!("CARGO_PKG_VERSION");

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct VersionResp {
    version: String,
    #[serde(default)]
    available: bool,
    #[serde(default)]
    download_url: Option<String>,
}

pub fn current_version() -> &'static str {
    CURRENT_VERSION
}

/// Compara dos versiones "x.y.z" componente a componente (numérico, no léxico).
/// Devuelve true si `latest` es estrictamente mayor que `current`.
pub fn is_newer(latest: &str, current: &str) -> bool {
    let parse = |s: &str| -> Vec<u64> {
        s.split('.').map(|p| p.trim().parse().unwrap_or(0)).collect()
    };
    let a = parse(latest);
    let b = parse(current);
    for i in 0..a.len().max(b.len()) {
        let x = a.get(i).copied().unwrap_or(0);
        let y = b.get(i).copied().unwrap_or(0);
        if x != y {
            return x > y;
        }
    }
    false
}

fn platform() -> Result<&'static str> {
    crate::util::platform().ok_or_else(|| anyhow!("plataforma no soportada para auto-update"))
}

fn fetch_latest(server: &str) -> Result<VersionResp> {
    let url = format!(
        "{}/api/v1/agent/version?platform={}",
        server.trim_end_matches('/'),
        platform()?
    );
    let resp = ureq::get(&url).call().context("consultando la última versión")?;
    resp.into_json().context("la respuesta de versión no es JSON")
}

/// Best-effort: avisa por consola si hay una versión más nueva. Nunca falla
/// (un fallo de red no debe impedir que el agente funcione).
pub fn check_and_notify(server: &str) {
    if let Ok(v) = fetch_latest(server) {
        if is_newer(&v.version, CURRENT_VERSION) {
            println!(
                "⚠ Hay una versión nueva del agente: {} (tienes {}).",
                v.version, CURRENT_VERSION
            );
            println!("  Actualiza con:  noctcom-connector update");
        }
    }
}

/// Limpia el binario `.old` que dejó una actualización anterior (best-effort).
pub fn cleanup_old() {
    if let Ok(exe) = std::env::current_exe() {
        let _ = std::fs::remove_file(exe.with_extension("old"));
    }
}

/// Descarga e instala la última versión si es más nueva. Reemplaza el binario en
/// caliente y pide reiniciar el agente.
pub fn run_update(server: &str) -> Result<()> {
    let info = fetch_latest(server)?;
    if !is_newer(&info.version, CURRENT_VERSION) {
        println!("Ya estás en la última versión ({CURRENT_VERSION}).");
        return Ok(());
    }
    if !info.available {
        bail_no_binary()?;
    }

    let url = info
        .download_url
        .as_deref()
        .map(|u| absolutize(server, u))
        .unwrap_or_else(|| {
            format!(
                "{}/api/v1/agent/download?platform={}",
                server.trim_end_matches('/'),
                platform().unwrap_or("windows")
            )
        });

    println!("Descargando la versión {}…", info.version);
    let resp = ureq::get(&url).call().context("descargando el binario nuevo")?;
    let mut reader = resp.into_reader();

    let exe = std::env::current_exe().context("no se pudo localizar el ejecutable actual")?;
    let new_path = exe.with_extension("new");
    let old_path = exe.with_extension("old");

    // Escribe el binario nuevo junto al actual y márcalo ejecutable (en Unix).
    {
        let mut f = std::fs::File::create(&new_path)
            .with_context(|| format!("no se pudo crear '{}'", new_path.display()))?;
        std::io::copy(&mut reader, &mut f).context("escribiendo el binario nuevo")?;
        f.sync_all().ok();
    }
    set_executable(&new_path)?;

    // Swap atómico-en-lo-posible: aparta el actual y mueve el nuevo a su sitio.
    // Si el segundo rename falla, restauramos el original.
    let _ = std::fs::remove_file(&old_path);
    std::fs::rename(&exe, &old_path)
        .with_context(|| format!("no se pudo apartar el binario actual '{}'", exe.display()))?;
    if let Err(e) = std::fs::rename(&new_path, &exe) {
        let _ = std::fs::rename(&old_path, &exe);
        return Err(anyhow!("no se pudo instalar el binario nuevo: {e}"));
    }

    println!(
        "✓ Actualizado a la versión {}. Reinicia el agente (`noctcom-connector run`) para aplicarla.",
        info.version
    );
    Ok(())
}

fn bail_no_binary() -> Result<()> {
    Err(anyhow!("no hay binario publicado para tu plataforma todavía"))
}

fn absolutize(server: &str, url: &str) -> String {
    if url.starts_with("http://") || url.starts_with("https://") {
        url.to_string()
    } else {
        format!("{}{}", server.trim_end_matches('/'), url)
    }
}

#[cfg(unix)]
fn set_executable(path: &Path) -> Result<()> {
    use std::os::unix::fs::PermissionsExt;
    let mut perms = std::fs::metadata(path)?.permissions();
    perms.set_mode(0o755);
    std::fs::set_permissions(path, perms).context("marcando el binario como ejecutable")?;
    Ok(())
}

#[cfg(not(unix))]
fn set_executable(_path: &Path) -> Result<()> {
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn version_comparison_is_numeric() {
        assert!(is_newer("0.2.0", "0.1.0"));
        assert!(is_newer("1.0.0", "0.9.9"));
        assert!(is_newer("0.1.10", "0.1.2")); // 10 > 2, no comparación léxica
        assert!(!is_newer("0.1.0", "0.1"));    // 0.1.0 == 0.1 → no es mayor
        assert!(!is_newer("0.1.0", "0.1.0"));
        assert!(!is_newer("0.1.0", "0.2.0"));
        assert!(!is_newer("0.1", "0.1.0"));
    }
}
