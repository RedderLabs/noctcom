//! Capa de abstracción de SO para descubrir discos.
//!
//! `list()` devuelve discos/volúmenes en el mismo shape (camelCase) que ya
//! consume el frontend (`storage.ts: interface DiskInfo`), para que el backend
//! pueda reenviar la respuesta del agente tal cual.

use anyhow::Result;
use serde::Serialize;

#[cfg(target_os = "linux")]
mod linux;
#[cfg(target_os = "windows")]
mod windows;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiskInfo {
    pub id: String,
    pub device: String,
    pub path: String,
    pub label: String,
    pub total_bytes: u64,
    pub free_bytes: u64,
    pub used_bytes: u64,
    pub filesystem: String,
    pub removable: bool,
    /// Si el volumen es uno registrado/activo en Noctcom. Lo decide el backend;
    /// el agente lo deja en false (en M1 aún no hay volúmenes vía agente).
    pub active: bool,
    pub mounted: bool,
    pub needs_format: bool,
}

/// Sistemas de ficheros que Noctcom puede usar tal cual (sin formatear).
const USABLE_FS: &[&str] = &["ext4", "xfs", "btrfs", "ntfs", "exfat", "fat32", "vfat", "fuseblk"];

pub(crate) fn needs_format(fs: &str) -> bool {
    let fs = fs.trim().to_lowercase();
    fs.is_empty() || !USABLE_FS.contains(&fs.as_str())
}

/// Lee un u64 de un valor JSON que puede venir como número o como string
/// (lsblk/PowerShell varían según versión).
pub(crate) fn num(v: &serde_json::Value) -> u64 {
    if let Some(n) = v.as_u64() {
        n
    } else if let Some(s) = v.as_str() {
        s.trim().parse().unwrap_or(0)
    } else {
        0
    }
}

pub fn list() -> Result<Vec<DiskInfo>> {
    #[cfg(target_os = "linux")]
    {
        linux::list()
    }
    #[cfg(target_os = "windows")]
    {
        windows::list()
    }
    #[cfg(not(any(target_os = "linux", target_os = "windows")))]
    {
        Ok(Vec::new())
    }
}
