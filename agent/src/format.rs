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

#[cfg(not(windows))]
pub fn format_volume(_drive_letter: &str, _label: &str) -> Result<VolumeInfo> {
    bail!("{}", crate::i18n::pick(
        "el formateo vía agente solo está disponible en Windows por ahora",
        "formatting via the agent is only available on Windows for now",
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
}
