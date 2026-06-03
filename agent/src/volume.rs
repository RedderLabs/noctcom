//! Registro no destructivo de un disco como volumen de Noctcom.
//!
//! "Usar este disco" crea una subcarpeta `noctcom-blobs/` en el disco indicado y
//! verifica que se puede escribir. NO formatea ni borra nada: los datos del
//! usuario quedan intactos. El agente solo escribirá ahí blobs YA cifrados (M3),
//! nunca claves ni contenido en claro.

use anyhow::{anyhow, Context, Result};
use serde::Serialize;
use std::path::{Path, PathBuf};

/// Nombre de la carpeta donde vivirán los blobs cifrados de Noctcom.
pub const BLOBS_DIR: &str = "noctcom-blobs";

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VolumeInfo {
    /// Ruta del disco tal y como queda registrada.
    pub path: String,
    /// Ruta de la carpeta de blobs creada dentro del disco.
    pub blob_path: String,
}

/// Prepara `path` como volumen: valida que es un directorio existente, crea
/// `noctcom-blobs/` dentro y comprueba escritura real. Operación no destructiva.
pub fn register(path: &str) -> Result<VolumeInfo> {
    if path.trim().is_empty() {
        return Err(anyhow!("ruta vacía"));
    }
    let root = PathBuf::from(path);
    let meta = std::fs::metadata(&root)
        .with_context(|| format!("la ruta '{path}' no existe o no es accesible"))?;
    if !meta.is_dir() {
        return Err(anyhow!("la ruta '{path}' no es un directorio"));
    }

    let blob_dir = root.join(BLOBS_DIR);
    std::fs::create_dir_all(&blob_dir)
        .with_context(|| format!("no se pudo crear '{}'", blob_dir.display()))?;

    // Comprobación de escritura real: creamos y borramos un fichero de prueba.
    let probe = blob_dir.join(".noctcom-write-test");
    std::fs::write(&probe, b"noctcom")
        .with_context(|| format!("el disco no es escribible: '{}'", blob_dir.display()))?;
    let _ = std::fs::remove_file(&probe);

    Ok(VolumeInfo {
        path: display_path(&root),
        blob_path: display_path(&blob_dir),
    })
}

fn display_path(p: &Path) -> String {
    p.to_string_lossy().into_owned()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn register_creates_blobs_dir_and_is_idempotent() {
        let base = std::env::temp_dir().join(format!("noctcom-vol-{}", std::process::id()));
        std::fs::create_dir_all(&base).unwrap();
        let path = base.to_string_lossy().into_owned();

        let info = register(&path).expect("register debe funcionar en un dir escribible");
        assert!(info.blob_path.ends_with(BLOBS_DIR));
        assert!(base.join(BLOBS_DIR).is_dir(), "debe crear noctcom-blobs");
        // El fichero de prueba no debe quedar.
        assert!(!base.join(BLOBS_DIR).join(".noctcom-write-test").exists());

        // Volver a llamar no falla (carpeta ya existe).
        register(&path).expect("register debe ser idempotente");

        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn register_rejects_missing_path() {
        let missing = std::env::temp_dir().join("noctcom-does-not-exist-xyz-123");
        let _ = std::fs::remove_dir_all(&missing);
        assert!(register(&missing.to_string_lossy()).is_err());
    }
}
