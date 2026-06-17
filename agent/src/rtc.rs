//! Vía directa (WebRTC) del desbloqueo "Tus discos".
//!
//! Negocia un DataChannel P2P con el navegador para que los blobs YA cifrados
//! viajen DIRECTOS, sin relayar por el backend (que solo hace de señalización:
//! nos pasa la oferta SDP y devuelve nuestra answer). Eso elimina el coste de
//! egress recurrente y sostiene el "pago único de por vida".
//!
//! Seguridad: el cifrado (AES-256-GCM) ocurre en el navegador; aquí solo se
//! mueve ciphertext, además sobre DTLS. El canal solo se abre tras la
//! señalización autenticada del backend (que verifica que el agente es del
//! usuario). El `path` lo aporta el navegador (lo recibió de /uploads/init, que
//! es de confianza); `volume::*` valida el `key` contra path traversal.
//!
//! Compilado solo con `--features webrtc` (la dependencia es pesada).

use std::sync::{Arc, Mutex, OnceLock};

use anyhow::{Context, Result};
use serde::Deserialize;
use webrtc::api::interceptor_registry::register_default_interceptors;
use webrtc::api::media_engine::MediaEngine;
use webrtc::api::APIBuilder;
use webrtc::data_channel::data_channel_message::DataChannelMessage;
use webrtc::data_channel::RTCDataChannel;
use webrtc::ice_transport::ice_server::RTCIceServer;
use webrtc::interceptor::registry::Registry;
use webrtc::peer_connection::configuration::RTCConfiguration;
use webrtc::peer_connection::peer_connection_state::RTCPeerConnectionState;
use webrtc::peer_connection::sdp::session_description::RTCSessionDescription;
use webrtc::peer_connection::RTCPeerConnection;

use crate::{util, volume};

/// Frame entrante por el DataChannel (una operación de chunk).
#[derive(Deserialize)]
struct Frame {
    id: String,
    op: String,
    path: String,
    key: String,
    #[serde(rename = "dataB64", default)]
    data_b64: Option<String>,
}

/// PeerConnections vivas: hay que mantener el Arc vivo tras negociar (si no, se
/// dropea y el canal muere). Se limpian al cerrarse/fallar la conexión.
fn active() -> &'static Mutex<Vec<Arc<RTCPeerConnection>>> {
    static ACTIVE: OnceLock<Mutex<Vec<Arc<RTCPeerConnection>>>> = OnceLock::new();
    ACTIVE.get_or_init(|| Mutex::new(Vec::new()))
}

fn remember(pc: &Arc<RTCPeerConnection>) {
    if let Ok(mut v) = active().lock() {
        v.push(pc.clone());
    }
}

fn forget(pc: &Arc<RTCPeerConnection>) {
    if let Ok(mut v) = active().lock() {
        v.retain(|p| !Arc::ptr_eq(p, pc));
    }
}

/// Procesa la oferta SDP del navegador y devuelve la answer SDP (con los
/// candidatos ICE ya reunidos: sin trickle, una sola ida y vuelta).
pub async fn negotiate(offer_sdp: String) -> Result<String> {
    let mut media = MediaEngine::default();
    let mut registry = Registry::new();
    registry = register_default_interceptors(registry, &mut media)
        .context("registrando interceptores webrtc")?;
    let api = APIBuilder::new()
        .with_media_engine(media)
        .with_interceptor_registry(registry)
        .build();

    let config = RTCConfiguration {
        ice_servers: vec![RTCIceServer {
            urls: vec!["stun:stun.l.google.com:19302".to_owned()],
            ..Default::default()
        }],
        ..Default::default()
    };

    let pc = Arc::new(api.new_peer_connection(config).await.context("creando peer connection")?);

    // Limpieza al cerrarse/fallar (Weak para no crear ciclo pc→handler→pc).
    let pc_weak = Arc::downgrade(&pc);
    pc.on_peer_connection_state_change(Box::new(move |state: RTCPeerConnectionState| {
        let pc_weak = pc_weak.clone();
        Box::pin(async move {
            if matches!(
                state,
                RTCPeerConnectionState::Failed
                    | RTCPeerConnectionState::Closed
                    | RTCPeerConnectionState::Disconnected
            ) {
                if let Some(strong) = pc_weak.upgrade() {
                    forget(&strong);
                }
            }
        })
    }));

    // Cada DataChannel que abra el navegador atiende ops de chunk.
    pc.on_data_channel(Box::new(move |dc: Arc<RTCDataChannel>| {
        Box::pin(async move {
            let dc_for_msg = dc.clone();
            dc.on_message(Box::new(move |msg: DataChannelMessage| {
                let dc = dc_for_msg.clone();
                Box::pin(async move {
                    let reply = handle_frame(&msg.data).await;
                    let _ = dc.send_text(reply).await;
                })
            }));
        })
    }));

    let offer = RTCSessionDescription::offer(offer_sdp).context("parseando oferta SDP")?;
    pc.set_remote_description(offer).await.context("set_remote_description")?;

    let answer = pc.create_answer(None).await.context("create_answer")?;
    // Promise que se resuelve cuando ICE termina de reunir candidatos.
    let mut gather_complete = pc.gathering_complete_promise().await;
    pc.set_local_description(answer).await.context("set_local_description")?;
    let _ = gather_complete.recv().await;

    let local = pc
        .local_description()
        .await
        .context("sin local description tras gathering")?;

    remember(&pc);
    Ok(local.sdp)
}

/// Resuelve una op de chunk y devuelve el JSON de respuesta (siempre String, con
/// `error` si algo falla — nunca propaga para no tumbar el canal).
async fn handle_frame(raw: &[u8]) -> String {
    let frame: Frame = match serde_json::from_slice(raw) {
        Ok(f) => f,
        Err(e) => return err_json("?", &format!("frame inválido: {e}")),
    };

    match frame.op.as_str() {
        "write" => {
            let data = match frame.data_b64.as_deref().map(util::unb64) {
                Some(Ok(d)) => d,
                Some(Err(e)) => return err_json(&frame.id, &format!("base64 inválido: {e}")),
                None => return err_json(&frame.id, "falta dataB64"),
            };
            let (path, key) = (frame.path.clone(), frame.key.clone());
            match tokio::task::spawn_blocking(move || volume::write_chunk(&path, &key, &data)).await {
                Ok(Ok(())) => ok_json(&frame.id),
                Ok(Err(e)) => err_json(&frame.id, &e.to_string()),
                Err(e) => err_json(&frame.id, &e.to_string()),
            }
        }
        "read" => {
            let (path, key) = (frame.path.clone(), frame.key.clone());
            match tokio::task::spawn_blocking(move || volume::read_chunk(&path, &key)).await {
                Ok(Ok(data)) => data_json(&frame.id, &util::b64(&data)),
                Ok(Err(e)) => err_json(&frame.id, &e.to_string()),
                Err(e) => err_json(&frame.id, &e.to_string()),
            }
        }
        "delete" => {
            let (path, key) = (frame.path.clone(), frame.key.clone());
            match tokio::task::spawn_blocking(move || volume::delete_chunk(&path, &key)).await {
                Ok(Ok(())) => ok_json(&frame.id),
                Ok(Err(e)) => err_json(&frame.id, &e.to_string()),
                Err(e) => err_json(&frame.id, &e.to_string()),
            }
        }
        other => err_json(&frame.id, &format!("op no soportada: {other}")),
    }
}

fn ok_json(id: &str) -> String {
    serde_json::json!({ "id": id, "ok": true }).to_string()
}
fn data_json(id: &str, data_b64: &str) -> String {
    serde_json::json!({ "id": id, "dataB64": data_b64 }).to_string()
}
fn err_json(id: &str, error: &str) -> String {
    serde_json::json!({ "id": id, "error": error }).to_string()
}

#[cfg(test)]
mod tests {
    //! Verificación E2E del data-plane: levanta un peer WebRTC "cliente" (el
    //! mismo stack ICE+DTLS+SCTP que usa el navegador), negocia con el código
    //! REAL del agente (`negotiate`), abre un DataChannel y hace round-trip de
    //! write/read/delete sobre un volumen temporal real. Cubre exactamente lo que
    //! ocurriría navegador↔agente, sin navegador. Solo con `--features webrtc`.

    use super::*;
    use std::sync::Mutex as StdMutex;
    use std::time::Duration;
    use webrtc::api::media_engine::MediaEngine;
    use webrtc::api::APIBuilder;
    use webrtc::data_channel::data_channel_message::DataChannelMessage;
    use webrtc::peer_connection::configuration::RTCConfiguration;

    async fn recv_one(rx: &mut tokio::sync::mpsc::UnboundedReceiver<String>) -> Result<String> {
        tokio::time::timeout(Duration::from_secs(10), rx.recv())
            .await
            .context("timeout esperando respuesta")?
            .context("canal cerrado")
    }

    #[tokio::test]
    async fn direct_roundtrip_write_read_delete() -> Result<()> {
        // Volumen temporal real (crea noctcom-blobs/ y valida escritura).
        let dir = std::env::temp_dir().join(format!("noctcom-rtc-test-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir)?;
        let path = dir.to_string_lossy().to_string();
        volume::register(&path)?;

        // Peer "cliente" (rol navegador) con un DataChannel.
        let mut media = MediaEngine::default();
        let mut reg = Registry::new();
        reg = register_default_interceptors(reg, &mut media)?;
        let api = APIBuilder::new()
            .with_media_engine(media)
            .with_interceptor_registry(reg)
            .build();
        let client = Arc::new(api.new_peer_connection(RTCConfiguration::default()).await?);
        let dc = client.create_data_channel("noctcom-blobs", None).await?;

        // Señal de "canal abierto".
        let (open_tx, open_rx) = tokio::sync::oneshot::channel::<()>();
        let open_tx = Arc::new(StdMutex::new(Some(open_tx)));
        dc.on_open(Box::new(move || {
            let open_tx = open_tx.clone();
            Box::pin(async move {
                if let Some(tx) = open_tx.lock().unwrap().take() {
                    let _ = tx.send(());
                }
            })
        }));

        // Cola de respuestas que llegan del agente por el canal.
        let (msg_tx, mut msg_rx) = tokio::sync::mpsc::unbounded_channel::<String>();
        dc.on_message(Box::new(move |msg: DataChannelMessage| {
            let msg_tx = msg_tx.clone();
            Box::pin(async move {
                let _ = msg_tx.send(String::from_utf8_lossy(&msg.data).to_string());
            })
        }));

        // Oferta del cliente (ICE no-trickle: esperamos a reunir candidatos).
        let offer = client.create_offer(None).await?;
        let mut gather = client.gathering_complete_promise().await;
        client.set_local_description(offer).await?;
        let _ = gather.recv().await;
        let offer_sdp = client.local_description().await.context("sin offer local")?.sdp;

        // El AGENTE negocia (código real) y devolvemos su answer al cliente.
        let answer_sdp = negotiate(offer_sdp).await?;
        client
            .set_remote_description(RTCSessionDescription::answer(answer_sdp)?)
            .await?;

        // El DataChannel debe abrirse (handshake ICE+DTLS+SCTP real).
        tokio::time::timeout(Duration::from_secs(20), open_rx)
            .await
            .context("timeout abriendo el DataChannel")??;

        let key = "ab/test-chunk";
        let payload: &[u8] = b"hello-ciphertext-blob";

        // WRITE
        dc.send_text(
            serde_json::json!({ "id": "1", "op": "write", "path": path, "key": key, "dataB64": util::b64(payload) })
                .to_string(),
        )
        .await?;
        let r1: serde_json::Value = serde_json::from_str(&recv_one(&mut msg_rx).await?)?;
        assert_eq!(r1["id"], "1");
        assert_eq!(r1["ok"], true, "write debe responder ok: {r1}");
        // El blob existe de verdad en el disco.
        assert!(dir.join("noctcom-blobs").join("ab").join("test-chunk").exists());

        // READ → mismos bytes.
        dc.send_text(
            serde_json::json!({ "id": "2", "op": "read", "path": path, "key": key }).to_string(),
        )
        .await?;
        let r2: serde_json::Value = serde_json::from_str(&recv_one(&mut msg_rx).await?)?;
        assert_eq!(r2["id"], "2");
        let got = util::unb64(r2["dataB64"].as_str().context("sin dataB64")?)?;
        assert_eq!(got, payload, "read debe devolver el ciphertext íntegro");

        // DELETE → el blob desaparece.
        dc.send_text(
            serde_json::json!({ "id": "3", "op": "delete", "path": path, "key": key }).to_string(),
        )
        .await?;
        let r3: serde_json::Value = serde_json::from_str(&recv_one(&mut msg_rx).await?)?;
        assert_eq!(r3["ok"], true);
        assert!(!dir.join("noctcom-blobs").join("ab").join("test-chunk").exists());

        let _ = client.close().await;
        let _ = std::fs::remove_dir_all(&dir);
        Ok(())
    }
}
