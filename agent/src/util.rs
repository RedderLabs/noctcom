//! Codificación base64url SIN padding, para que coincida exactamente con el
//! backend (`Buffer.from(s, 'base64url')` / `.toString('base64url')`).

use anyhow::{Context, Result};
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;

pub fn b64(bytes: impl AsRef<[u8]>) -> String {
    URL_SAFE_NO_PAD.encode(bytes)
}

pub fn unb64(s: &str) -> Result<Vec<u8>> {
    URL_SAFE_NO_PAD.decode(s).context("base64url inválido")
}

/// Plataforma normalizada al enum que acepta el backend ('windows'|'linux'|'macos').
pub fn platform() -> Option<&'static str> {
    match std::env::consts::OS {
        "windows" => Some("windows"),
        "linux" => Some("linux"),
        "macos" => Some("macos"),
        _ => None,
    }
}
