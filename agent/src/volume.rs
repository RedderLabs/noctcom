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

/// Resuelve la ruta absoluta de un blob dentro de `noctcom-blobs/`, rechazando
/// cualquier intento de salirse de esa carpeta (path traversal). La `key` solo
/// puede contener componentes normales (p.ej. `a1/deadbeef…`), nunca `..` ni
/// rutas absolutas.
fn blob_file(path: &str, key: &str) -> Result<PathBuf> {
    let base = PathBuf::from(path).join(BLOBS_DIR);
    let mut full = base.clone();
    for comp in Path::new(key).components() {
        match comp {
            std::path::Component::Normal(c) => full.push(c),
            _ => return Err(anyhow!("clave de chunk inválida: '{key}'")),
        }
    }
    if !full.starts_with(&base) {
        return Err(anyhow!("clave de chunk fuera del volumen"));
    }
    Ok(full)
}

/// Escribe un blob YA cifrado en el volumen (M3). El agente nunca ve plaintext.
pub fn write_chunk(path: &str, key: &str, data: &[u8]) -> Result<()> {
    let target = blob_file(path, key)?;
    if let Some(parent) = target.parent() {
        std::fs::create_dir_all(parent)
            .with_context(|| format!("no se pudo crear '{}'", parent.display()))?;
    }
    std::fs::write(&target, data)
        .with_context(|| format!("no se pudo escribir el chunk '{}'", target.display()))?;
    Ok(())
}

/// Lee un blob cifrado del volumen (M3) y devuelve sus bytes tal cual.
pub fn read_chunk(path: &str, key: &str) -> Result<Vec<u8>> {
    let target = blob_file(path, key)?;
    std::fs::read(&target)
        .with_context(|| format!("no se pudo leer el chunk '{}'", target.display()))
}

/// Borra un blob del volumen (M3). Es idempotente: si ya no existe, no falla.
pub fn delete_chunk(path: &str, key: &str) -> Result<()> {
    let target = blob_file(path, key)?;
    match std::fs::remove_file(&target) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(e).with_context(|| format!("no se pudo borrar '{}'", target.display())),
    }
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

    #[test]
    fn chunk_write_read_delete_roundtrip() {
        let base = std::env::temp_dir().join(format!("noctcom-chunk-{}", std::process::id()));
        std::fs::create_dir_all(&base).unwrap();
        let path = base.to_string_lossy().into_owned();
        register(&path).unwrap();

        let key = "a1/deadbeefcafebabe";
        let data = b"ciphertext-blob-bytes";
        write_chunk(&path, key, data).expect("write");
        // El blob vive bajo noctcom-blobs/, con sus subcarpetas.
        assert!(base.join(BLOBS_DIR).join("a1").join("deadbeefcafebabe").is_file());

        let got = read_chunk(&path, key).expect("read");
        assert_eq!(got, data);

        delete_chunk(&path, key).expect("delete");
        assert!(read_chunk(&path, key).is_err(), "el chunk ya no debe existir");
        // Borrar de nuevo es idempotente.
        delete_chunk(&path, key).expect("delete idempotente");

        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn chunk_rejects_path_traversal() {
        let base = std::env::temp_dir().join(format!("noctcom-trav-{}", std::process::id()));
        std::fs::create_dir_all(&base).unwrap();
        let path = base.to_string_lossy().into_owned();

        assert!(write_chunk(&path, "../escape", b"x").is_err());
        assert!(read_chunk(&path, "../../etc/passwd").is_err());
        assert!(delete_chunk(&path, "..\\..\\windows").is_err());

        let _ = std::fs::remove_dir_all(&base);
    }
}
