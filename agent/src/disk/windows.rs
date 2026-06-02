//! Descubrimiento de discos en Windows vía `Win32_LogicalDisk` (PowerShell/CIM).
//!
//! `DeviceID` viene como "C:" (string fiable), a diferencia del `[char]` de
//! Get-Volume que ConvertTo-Json serializa de forma ambigua.

use anyhow::{Context, Result};
use serde_json::Value;

use super::{needs_format, num, DiskInfo};

const SCRIPT: &str = "Get-CimInstance Win32_LogicalDisk | \
     Select-Object DeviceID,VolumeName,FileSystem,Size,FreeSpace,DriveType | \
     ConvertTo-Json -Compress";

pub fn list() -> Result<Vec<DiskInfo>> {
    let out = std::process::Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-Command", SCRIPT])
        .output()
        .context("ejecutando powershell (Win32_LogicalDisk)")?;
    if !out.status.success() {
        anyhow::bail!(
            "Win32_LogicalDisk falló: {}",
            String::from_utf8_lossy(&out.stderr)
        );
    }
    let text = String::from_utf8_lossy(&out.stdout);
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return Ok(Vec::new());
    }
    let v: Value = serde_json::from_str(trimmed).context("parseando JSON de Win32_LogicalDisk")?;

    // ConvertTo-Json devuelve objeto si hay 1 resultado, array si hay varios.
    let items: Vec<Value> = match v {
        Value::Array(a) => a,
        other => vec![other],
    };

    let mut disks = Vec::new();
    for it in &items {
        let device_id = it["DeviceID"].as_str().unwrap_or("").to_string(); // "C:"
        if device_id.is_empty() {
            continue;
        }
        let label = it["VolumeName"].as_str().unwrap_or("").to_string();
        let fs = it["FileSystem"].as_str().unwrap_or("").to_string();
        let total = num(&it["Size"]);
        let free = num(&it["FreeSpace"]);
        let drive_type = it["DriveType"].as_u64().unwrap_or(0); // 2=removable, 3=fixed
        let removable = drive_type == 2;

        disks.push(DiskInfo {
            id: device_id.clone(),
            device: device_id.clone(),
            path: format!("{device_id}\\"),
            label: if label.is_empty() { device_id.clone() } else { label },
            total_bytes: total,
            free_bytes: free,
            used_bytes: total.saturating_sub(free),
            filesystem: fs.clone(),
            removable,
            active: false,
            mounted: true,
            needs_format: needs_format(&fs),
        });
    }
    Ok(disks)
}
