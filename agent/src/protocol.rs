//! Mensajes del canal WS backend ↔ agente (etiquetados por `type`, kebab-case
//! para coincidir con el backend TypeScript).

use serde::{Deserialize, Serialize};

/// Mensajes que el backend envía al agente.
// `ts`/`args` se rellenan ya en el protocolo aunque M0 aún no los consuma (M1+).
#[allow(dead_code)]
#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "kebab-case")]
pub enum ServerMsg {
    /// Reto de autenticación: el agente debe firmar `nonce` (base64url).
    Challenge { nonce: String },
    /// Autenticación aceptada; el canal queda operativo.
    Ready,
    /// Respuesta a un heartbeat.
    HeartbeatAck {
        #[serde(default)]
        ts: i64,
    },
    /// Comando a ejecutar (M1+: list-disks, mount, write-chunk…).
    Cmd {
        id: String,
        cmd: String,
        #[serde(default)]
        args: serde_json::Value,
    },
    /// Cualquier otro tipo no reconocido se ignora.
    #[serde(other)]
    Unknown,
}

/// Mensajes que el agente envía al backend.
#[derive(Debug, Serialize)]
#[serde(tag = "type", rename_all = "kebab-case")]
pub enum ClientMsg {
    /// Respuesta al reto: firma Ed25519 del nonce, en base64url.
    Auth { signature: String },
    /// Latido periódico para mantener viva la conexión y `last_seen_at`.
    Heartbeat,
    /// Respuesta correlacionada a un `Cmd` (M1+).
    Res {
        id: String,
        ok: bool,
        #[serde(skip_serializing_if = "Option::is_none")]
        data: Option<serde_json::Value>,
        #[serde(skip_serializing_if = "Option::is_none")]
        error: Option<String>,
    },
}
