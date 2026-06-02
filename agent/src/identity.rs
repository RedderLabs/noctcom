//! Identidad criptográfica del agente: un par de claves Ed25519 generado en el
//! primer arranque y guardado localmente. La clave PRIVADA es el único secreto
//! del agente y nunca sale de esta máquina; el backend solo conoce la pública.

use anyhow::{Context, Result};
use ed25519_dalek::{Signer, SigningKey};
use rand::rngs::OsRng;
use std::path::Path;

use crate::util::b64;

pub struct Identity {
    signing: SigningKey,
}

impl Identity {
    /// Carga la clave del disco o, si no existe, genera una nueva y la guarda
    /// con permisos restrictivos.
    pub fn load_or_create(path: &Path) -> Result<Self> {
        if path.exists() {
            let bytes = std::fs::read(path).context("leyendo la clave de identidad")?;
            let seed: [u8; 32] = bytes
                .as_slice()
                .try_into()
                .context("la clave de identidad está corrupta (tamaño != 32)")?;
            Ok(Self { signing: SigningKey::from_bytes(&seed) })
        } else {
            let signing = SigningKey::generate(&mut OsRng);
            if let Some(dir) = path.parent() {
                std::fs::create_dir_all(dir).context("creando el directorio de configuración")?;
            }
            std::fs::write(path, signing.to_bytes()).context("guardando la clave de identidad")?;
            restrict_perms(path)?;
            Ok(Self { signing })
        }
    }

    /// Clave pública en base64url (lo que se registra en el backend al emparejar).
    pub fn public_key_b64(&self) -> String {
        b64(self.signing.verifying_key().to_bytes())
    }

    /// Firma un mensaje (p.ej. el nonce del reto) y devuelve la firma en base64url.
    pub fn sign_b64(&self, msg: &[u8]) -> String {
        b64(self.signing.sign(msg).to_bytes())
    }
}

#[cfg(unix)]
fn restrict_perms(path: &Path) -> Result<()> {
    use std::os::unix::fs::PermissionsExt;
    let mut perms = std::fs::metadata(path)?.permissions();
    perms.set_mode(0o600); // solo el dueño puede leer/escribir
    std::fs::set_permissions(path, perms).context("ajustando permisos 0600")?;
    Ok(())
}

#[cfg(not(unix))]
fn restrict_perms(_path: &Path) -> Result<()> {
    // En Windows la clave queda bajo el perfil del usuario (ACLs por defecto).
    // TODO (M4): endurecer con DPAPI (CryptProtectData) ligada al usuario.
    Ok(())
}
