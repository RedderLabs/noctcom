//! Formateo de un disco vía el agente (M2b). Operación DESTRUCTIVA, por eso
//! está fuertemente acotada:
//!   - NUNCA el disco de sistema (el que contiene Windows).
//!   - SOLO discos vacíos: si el volumen tiene datos del usuario, se rechaza.
//!   - El backend además exige re-autenticación (step-up 2FA) y confirmación
//!     escrita de la etiqueta antes de llegar hasta aquí.
//!
//! Hoy solo implementado en Windows (la máquina típica del usuario). En otros
//! sistemas devuelve un error honesto en vez de fingir soporte.

use crate::volume::{self, VolumeInfo};
use anyhow::{anyhow, bail, Result};
use std::path::Path;

/// Entradas que NO cuentan como "datos del usuario": carpetas del sistema de
/// ficheros/papelera y la propia carpeta de Noctcom. Comparación en minúsculas.
const IGNORABLE: &[&str] = &[
    "system volume information",
    "$recycle.bin",
    "recycler",
    "found.000",
    "lost+found", // ext4 la crea al formatear; no es "dato del usuario"
    "noctcom-blobs",
];

/// Normaliza la letra de unidad a una mayúscula A–Z. Acepta `"d"`, `"D"`,
/// `"D:"`, `"D:\\"`… y se queda con la primera letra.
pub fn validate_drive_letter(s: &str) -> Result<char> {
    let c = s
        .chars()
        .next()
        .ok_or_else(|| anyhow!("{}", crate::i18n::pick(
            "letra de unidad vacía",
            "empty drive letter",
        )))?;
    if !c.is_ascii_alphabetic() {
        bail!("{}", crate::i18n::pick(
            &format!("letra de unidad inválida: '{s}'"),
            &format!("invalid drive letter: '{s}'"),
        ));
    }
    Ok(c.to_ascii_uppercase())
}

/// ¿Es `letter` el disco de sistema? `system_drive` es el valor de la variable
/// de entorno `%SystemDrive%` (p.ej. `"C:"`).
pub fn is_system_drive(letter: char, system_drive: &str) -> bool {
    system_drive
        .chars()
        .next()
        .map(|c| c.to_ascii_uppercase() == letter)
        .unwrap_or(false)
}

/// Valida la etiqueta del volumen (defensa en profundidad; el backend ya la
/// valida igual). Solo alfanumérico, guion y guion bajo, 1–12 caracteres.
fn validate_label(label: &str) -> Result<()> {
    let ok = !label.is_empty()
        && label.len() <= 12
        && label.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_');
    if !ok {
        bail!("{}", crate::i18n::pick(
            "etiqueta inválida: solo alfanumérico, '-' y '_', máx. 12 caracteres",
            "invalid label: only alphanumeric, '-' and '_', max. 12 characters",
        ));
    }
    Ok(())
}

/// Devuelve el nombre de la primera entrada que cuenta como "datos del usuario"
/// (es decir, que impide formatear). `None` si el directorio está vacío salvo
/// por entradas ignorables.
pub fn first_blocking_entry(dir: &Path) -> Result<Option<String>> {
    for entry in std::fs::read_dir(dir)? {
        let entry = entry?;
        let name = entry.file_name().to_string_lossy().to_string();
        if !IGNORABLE.contains(&name.to_lowercase().as_str()) {
            return Ok(Some(name));
        }
    }
    Ok(None)
}

/// Formatea el volumen `drive_letter:` como NTFS con la etiqueta dada y lo deja
/// listo como volumen de Noctcom (crea `noctcom-blobs/`). Destructivo.
#[cfg(windows)]
pub fn format_volume(drive_letter: &str, label: &str) -> Result<VolumeInfo> {
    use std::process::Command;

    let letter = validate_drive_letter(drive_letter)?;
    validate_label(label)?;

    let system_drive = std::env::var("SystemDrive").unwrap_or_else(|_| "C:".to_string());
    if is_system_drive(letter, &system_drive) {
        bail!("{}", crate::i18n::pick(
            &format!("no se puede formatear el disco del sistema ({letter}:)"),
            &format!("cannot format the system drive ({letter}:)"),
        ));
    }

    let root = format!("{letter}:\\");
    if std::fs::metadata(&root).is_err() {
        bail!("{}", crate::i18n::pick(
            &format!("el disco {letter}: no está disponible"),
            &format!("drive {letter}: is not available"),
        ));
    }

    // Salvaguarda clave: solo discos vacíos. Si hay datos del usuario, paramos.
    if let Some(name) = first_blocking_entry(Path::new(&root))? {
        bail!("{}", crate::i18n::pick(
            &format!(
                "el disco {letter}: no está vacío (contiene '{name}'); el formateo solo \
                 está permitido en discos vacíos para no destruir datos"
            ),
            &format!(
                "drive {letter}: is not empty (contains '{name}'); formatting is only \
                 allowed on empty drives to avoid destroying data"
            ),
        ));
    }

    // Quick format NTFS. `-Force` + `-Confirm:$false` evitan prompts; corremos
    // sin perfil y sin interacción.
    let ps = format!(
        "Format-Volume -DriveLetter {letter} -FileSystem NTFS -NewFileSystemLabel '{label}' -Force -Confirm:$false"
    );
    let output = Command::new("powershell")
        .args(["-NonInteractive", "-NoProfile", "-Command", &ps])
        .output()
        .map_err(|e| anyhow!("{}", crate::i18n::pick(
            &format!("no se pudo lanzar PowerShell para formatear: {e}"),
            &format!("could not launch PowerShell to format: {e}"),
        )))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        bail!("{}", crate::i18n::pick(
            &format!("el formateo falló (¿permisos de administrador?): {}", stderr.trim()),
            &format!("formatting failed (administrator permissions?): {}", stderr.trim()),
        ));
    }

    // Deja el disco listo como volumen de Noctcom (crea noctcom-blobs/).
    volume::register(&root)
}

// ─── Linux ───────────────────────────────────────────────────────────────────
// En Linux no hay "letras de unidad": el destino es un dispositivo de bloque
// (p.ej. `/dev/sdb1`). Formateamos como ext4, montamos en `/mnt/noctcom/<label>`
// y registramos el volumen. Mismas salvaguardas que en Windows: nunca el disco
// del sistema, solo discos vacíos, y requiere root (mkfs/mount lo exigen).
//
// El montaje NO se persiste en /etc/fstab (editar fstab es arriesgado): vive
// hasta el reinicio; tras reiniciar basta con re-registrar el disco ya montado.

/// ¿Corre el agente como root? (euid 0). Sin dependencia de libc: lo leemos de
/// `/proc/self/status` (campo `Uid:` → real, **efectivo**, saved, fs).
#[cfg(target_os = "linux")]
fn is_root() -> bool {
    std::fs::read_to_string("/proc/self/status")
        .ok()
        .and_then(|s| {
            s.lines()
                .find(|l| l.starts_with("Uid:"))
                .and_then(|l| l.split_whitespace().nth(2).map(str::to_string))
        })
        .map(|euid| euid == "0")
        .unwrap_or(false)
}

/// Disco padre de una partición: `/dev/sda2`→`/dev/sda`, `/dev/nvme0n1p3`→
/// `/dev/nvme0n1`, `/dev/mmcblk0p1`→`/dev/mmcblk0`. Un disco sin partición se
/// devuelve igual. Sirve para no formatear el disco que contiene a `/`.
#[cfg(target_os = "linux")]
fn parent_disk(dev: &str) -> String {
    let name = dev.trim_end_matches('/');
    let stripped = name.trim_end_matches(|c: char| c.is_ascii_digit());
    // nvme/mmc usan sufijo `pN`: si tras quitar los dígitos queda una `p`
    // precedida de dígito, quítala también.
    if let Some(base) = stripped.strip_suffix('p') {
        if base.chars().last().map(|c| c.is_ascii_digit()).unwrap_or(false) {
            return base.to_string();
        }
    }
    stripped.to_string()
}

/// Des-escapa las secuencias octales que `/proc/mounts` usa en las rutas
/// (`\040`=espacio, `\011`=tab, `\012`=salto, `\134`=barra).
#[cfg(target_os = "linux")]
fn unescape_mount(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let b = s.as_bytes();
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'\\' && i + 3 < b.len() && b[i + 1..i + 4].iter().all(|c| (b'0'..=b'7').contains(c)) {
            let code = (b[i + 1] - b'0') * 64 + (b[i + 2] - b'0') * 8 + (b[i + 3] - b'0');
            out.push(code as char);
            i += 4;
        } else {
            out.push(b[i] as char);
            i += 1;
        }
    }
    out
}

/// Punto de montaje actual de un dispositivo, si está montado (vía /proc/mounts).
#[cfg(target_os = "linux")]
fn mounted_at(dev: &str) -> Option<String> {
    let mounts = std::fs::read_to_string("/proc/mounts").unwrap_or_default();
    for line in mounts.lines() {
        let mut f = line.split_whitespace();
        if f.next() == Some(dev) {
            if let Some(tgt) = f.next() {
                return Some(unescape_mount(tgt));
            }
        }
    }
    None
}

/// Dispositivo que monta la raíz `/` (el disco del sistema).
#[cfg(target_os = "linux")]
fn root_source() -> Option<String> {
    let mounts = std::fs::read_to_string("/proc/mounts").unwrap_or_default();
    for line in mounts.lines() {
        let mut f = line.split_whitespace();
        let src = f.next().unwrap_or("");
        if f.next() == Some("/") {
            return Some(src.to_string());
        }
    }
    None
}

/// Sistema de ficheros actual del dispositivo (vacío si está sin formatear).
#[cfg(target_os = "linux")]
fn fstype(dev: &str) -> String {
    std::process::Command::new("lsblk")
        .args(["-no", "FSTYPE", dev])
        .output()
        .ok()
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        .unwrap_or_default()
}

/// Formatea el dispositivo `device` (`/dev/sdXN`) como ext4 con la etiqueta dada,
/// lo monta en `/mnt/noctcom/<label>` y lo deja listo como volumen. Destructivo.
#[cfg(target_os = "linux")]
pub fn format_volume(device: &str, label: &str) -> Result<VolumeInfo> {
    use anyhow::Context;
    use std::os::unix::fs::FileTypeExt;
    use std::process::Command;

    validate_label(label)?;

    // mkfs/mount exigen privilegios: fallamos pronto y con un mensaje honesto.
    if !is_root() {
        bail!("{}", crate::i18n::pick(
            "el formateo requiere ejecutar el agente como root (sudo)",
            "formatting requires running the agent as root (sudo)",
        ));
    }

    // El destino debe ser un dispositivo de bloque real bajo /dev.
    if !device.starts_with("/dev/") {
        bail!("{}", crate::i18n::pick(
            &format!("dispositivo inválido: '{device}' (se esperaba /dev/…)"),
            &format!("invalid device: '{device}' (expected /dev/…)"),
        ));
    }
    let meta = std::fs::metadata(device).with_context(|| crate::i18n::pick(
        format!("el dispositivo '{device}' no existe o no es accesible"),
        format!("device '{device}' does not exist or is not accessible"),
    ))?;
    if !meta.file_type().is_block_device() {
        bail!("{}", crate::i18n::pick(
            &format!("'{device}' no es un dispositivo de bloque"),
            &format!("'{device}' is not a block device"),
        ));
    }

    // Nunca el disco del sistema (el que contiene a `/`).
    if let Some(root) = root_source() {
        if parent_disk(device) == parent_disk(&root) {
            bail!("{}", crate::i18n::pick(
                "no se puede formatear el disco del sistema (contiene la raíz /)",
                "cannot format the system disk (it holds the root filesystem /)",
            ));
        }
    }

    // Salvaguarda clave: solo discos vacíos.
    match mounted_at(device) {
        Some(mp) => {
            // Montado: comprobamos su contenido y lo desmontamos antes de mkfs.
            if let Some(name) = first_blocking_entry(Path::new(&mp))? {
                bail!("{}", crate::i18n::pick(
                    &format!("el disco no está vacío (contiene '{name}'); el formateo solo \
                              está permitido en discos vacíos para no destruir datos"),
                    &format!("the disk is not empty (contains '{name}'); formatting is only \
                              allowed on empty disks to avoid destroying data"),
                ));
            }
            let out = Command::new("umount").arg(device).output()
                .context("desmontando el dispositivo")?;
            if !out.status.success() {
                bail!("{}", crate::i18n::pick(
                    &format!("no se pudo desmontar el disco: {}", String::from_utf8_lossy(&out.stderr).trim()),
                    &format!("could not unmount the disk: {}", String::from_utf8_lossy(&out.stderr).trim()),
                ));
            }
        }
        None if !fstype(device).is_empty() => {
            // Tiene un sistema de ficheros pero no está montado: lo montamos en
            // solo-lectura a un temporal para verificar que está vacío.
            let tmp = std::env::temp_dir().join(format!("noctcom-fmtchk-{}", std::process::id()));
            std::fs::create_dir_all(&tmp).ok();
            let mounted_ok = Command::new("mount")
                .args(["-o", "ro"]).arg(device).arg(&tmp)
                .status().map(|s| s.success()).unwrap_or(false);
            if !mounted_ok {
                let _ = std::fs::remove_dir_all(&tmp);
                bail!("{}", crate::i18n::pick(
                    "no se pudo verificar que el disco esté vacío; móntalo y vacíalo, o usa un disco sin formatear",
                    "could not verify the disk is empty; mount and empty it, or use an unformatted disk",
                ));
            }
            let blocking = first_blocking_entry(&tmp)?;
            let _ = Command::new("umount").arg(&tmp).status();
            let _ = std::fs::remove_dir_all(&tmp);
            if let Some(name) = blocking {
                bail!("{}", crate::i18n::pick(
                    &format!("el disco no está vacío (contiene '{name}'); el formateo solo \
                              está permitido en discos vacíos para no destruir datos"),
                    &format!("the disk is not empty (contains '{name}'); formatting is only \
                              allowed on empty disks to avoid destroying data"),
                ));
            }
        }
        None => { /* sin sistema de ficheros → disco vacío, se puede formatear */ }
    }

    // Format rápido ext4 con la etiqueta. mkfs.ext4 se niega si está montado
    // (defensa extra), por eso ya lo hemos desmontado arriba.
    let out = Command::new("mkfs.ext4")
        .args(["-q", "-L", label, device])
        .output()
        .context("ejecutando mkfs.ext4")?;
    if !out.status.success() {
        bail!("{}", crate::i18n::pick(
            &format!("el formateo falló: {}", String::from_utf8_lossy(&out.stderr).trim()),
            &format!("formatting failed: {}", String::from_utf8_lossy(&out.stderr).trim()),
        ));
    }

    // Montar en una ruta estable y registrarlo como volumen de Noctcom.
    let mountpoint = format!("/mnt/noctcom/{label}");
    std::fs::create_dir_all(&mountpoint).with_context(|| crate::i18n::pick(
        format!("no se pudo crear el punto de montaje '{mountpoint}'"),
        format!("could not create mountpoint '{mountpoint}'"),
    ))?;
    let out = Command::new("mount").arg(device).arg(&mountpoint).output()
        .context("montando el volumen")?;
    if !out.status.success() {
        bail!("{}", crate::i18n::pick(
            &format!("el montaje falló: {}", String::from_utf8_lossy(&out.stderr).trim()),
            &format!("mounting failed: {}", String::from_utf8_lossy(&out.stderr).trim()),
        ));
    }
    // ext4 nuevo queda root:root; abrimos escritura para el resto de operaciones.
    let _ = Command::new("chmod").args(["0777", &mountpoint]).status();

    volume::register(&mountpoint)
}

// ─── Otros sistemas (p.ej. macOS) ───────────────────────────────────────────
#[cfg(not(any(windows, target_os = "linux")))]
pub fn format_volume(_device: &str, _label: &str) -> Result<VolumeInfo> {
    bail!("{}", crate::i18n::pick(
        "el formateo vía agente solo está disponible en Windows y Linux por ahora",
        "formatting via the agent is only available on Windows and Linux for now",
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validate_drive_letter_normalizes() {
        assert_eq!(validate_drive_letter("d").unwrap(), 'D');
        assert_eq!(validate_drive_letter("D:").unwrap(), 'D');
        assert_eq!(validate_drive_letter("e:\\").unwrap(), 'E');
        assert!(validate_drive_letter("").is_err());
        assert!(validate_drive_letter("1").is_err());
    }

    #[test]
    fn detects_system_drive() {
        assert!(is_system_drive('C', "C:"));
        assert!(!is_system_drive('c', "C:")); // letter ya viene normalizada
        assert!(!is_system_drive('D', "C:"));
    }

    #[test]
    fn label_validation() {
        assert!(validate_label("mi-disco_1").is_ok());
        assert!(validate_label("").is_err());
        assert!(validate_label("demasiado-largo-123").is_err());
        assert!(validate_label("con espacio").is_err());
    }

    #[test]
    fn empty_dir_has_no_blocking_entry() {
        let base = std::env::temp_dir().join(format!("noctcom-fmt-empty-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&base);
        std::fs::create_dir_all(&base).unwrap();
        // Entradas ignorables no bloquean.
        std::fs::create_dir_all(base.join("System Volume Information")).unwrap();
        std::fs::create_dir_all(base.join("noctcom-blobs")).unwrap();
        assert_eq!(first_blocking_entry(&base).unwrap(), None);
        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn user_data_blocks_format() {
        let base = std::env::temp_dir().join(format!("noctcom-fmt-data-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&base);
        std::fs::create_dir_all(&base).unwrap();
        std::fs::write(base.join("mis-fotos.zip"), b"x").unwrap();
        assert_eq!(
            first_blocking_entry(&base).unwrap().as_deref(),
            Some("mis-fotos.zip")
        );
        let _ = std::fs::remove_dir_all(&base);
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn parent_disk_strips_partition() {
        assert_eq!(parent_disk("/dev/sda2"), "/dev/sda");
        assert_eq!(parent_disk("/dev/sdb"), "/dev/sdb"); // disco sin partición
        assert_eq!(parent_disk("/dev/nvme0n1p3"), "/dev/nvme0n1");
        assert_eq!(parent_disk("/dev/mmcblk0p1"), "/dev/mmcblk0");
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn unescape_mount_decodes_spaces() {
        assert_eq!(unescape_mount("/mnt/my\\040disk"), "/mnt/my disk");
        assert_eq!(unescape_mount("/mnt/plain"), "/mnt/plain");
    }
}
