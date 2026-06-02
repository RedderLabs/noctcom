//! Descubrimiento de discos en Linux vía `lsblk -J`.

use anyhow::{Context, Result};
use serde_json::Value;

use super::{needs_format, num, DiskInfo};

pub fn list() -> Result<Vec<DiskInfo>> {
    let out = std::process::Command::new("lsblk")
        .args([
            "-J",
            "-b", // bytes
            "-o",
            "NAME,PATH,SIZE,FSAVAIL,FSUSED,FSTYPE,MOUNTPOINT,RM,TYPE,LABEL",
        ])
        .output()
        .context("ejecutando lsblk")?;
    if !out.status.success() {
        anyhow::bail!("lsblk falló: {}", String::from_utf8_lossy(&out.stderr));
    }
    let v: Value = serde_json::from_slice(&out.stdout).context("parseando JSON de lsblk")?;

    let mut disks = Vec::new();
    if let Some(arr) = v["blockdevices"].as_array() {
        for d in arr {
            collect(d, &mut disks);
        }
    }
    Ok(disks)
}

/// Recorre el árbol de lsblk (devices → children) recogiendo discos y particiones.
fn collect(d: &Value, out: &mut Vec<DiskInfo>) {
    let kind = d["type"].as_str().unwrap_or("");
    if kind == "disk" || kind == "part" || kind == "lvm" {
        let path = d["path"].as_str().unwrap_or("").to_string();
        let name = d["name"].as_str().unwrap_or("").to_string();
        let fs = d["fstype"].as_str().unwrap_or("").to_string();
        let mount = d["mountpoint"].as_str().unwrap_or("").to_string();
        let total = num(&d["size"]);
        let avail = num(&d["fsavail"]);
        let used_raw = num(&d["fsused"]);
        let used = if used_raw > 0 {
            used_raw
        } else if !mount.is_empty() && total >= avail {
            total - avail
        } else {
            0
        };
        let removable = d["rm"].as_bool() == Some(true)
            || d["rm"].as_str() == Some("1")
            || d["rm"].as_i64() == Some(1);
        let id = if path.is_empty() { format!("/dev/{name}") } else { path.clone() };
        let label = match d["label"].as_str() {
            Some(l) if !l.is_empty() => l.to_string(),
            _ => name.clone(),
        };

        out.push(DiskInfo {
            id,
            device: if path.is_empty() { format!("/dev/{name}") } else { path },
            path: mount.clone(),
            label,
            total_bytes: total,
            free_bytes: avail,
            used_bytes: used,
            filesystem: fs.clone(),
            removable,
            active: false,
            mounted: !mount.is_empty(),
            needs_format: needs_format(&fs),
        });
    }

    if let Some(children) = d["children"].as_array() {
        for c in children {
            collect(c, out);
        }
    }
}
