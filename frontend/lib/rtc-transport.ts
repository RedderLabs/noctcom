'use client';

/**
 * Transporte DIRECTO navegador↔agente (vía A del desbloqueo "Tus discos").
 *
 * Abre un DataChannel WebRTC P2P con el Noctcom Connector para que los blobs YA
 * cifrados viajen directos, SIN relayar por el backend (que solo hace de
 * señalización). Eso elimina el coste de egress recurrente y es lo que hace
 * sostenible el "pago único de por vida".
 *
 * Seguridad: el cifrado (AES-256-GCM) ocurre en el navegador ANTES de entrar
 * aquí; este canal solo mueve ciphertext. El propio DataChannel va además sobre
 * DTLS. Zero-knowledge intacto.
 *
 * Degradación: si el agente no negocia (versión antigua → 409 'rtc-unsupported',
 * o error de red/NAT), `connectDirectTransport` devuelve null y el llamador debe
 * usar el relay HTTP de siempre (PUT/GET /uploads/chunk). NUNCA lanza por no
 * poder conectar: la vía directa es una optimización, no un requisito.
 *
 * Estado: cliente de señalización + canal listos y verificados (typecheck). El
 * data-plane del agente (crate `webrtc`) está pendiente: mientras el agente
 * responda supported:false, esto devuelve null y todo funciona por relay. Ver
 * SPEC_UNLOCK_LIFETIME_INTERNAL.md §"Vía A".
 */

import { apiFetch } from './api';

// STUN público para descubrir candidatos a través de NAT. Para NAT simétrico
// haría falta un TURN (que reintroduce relay para esa minoría); se añadiría
// aquí cuando se despliegue. Sin red externa, solo funcionará la LAN/host-local.
const ICE_SERVERS: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];

// Operaciones que viajan por el DataChannel. Cada mensaje es un frame JSON con
// un id correlado; los datos binarios van en base64url dentro del JSON para no
// mezclar frames de texto y binarios en el mismo canal.
type RtcOp =
  | { id: string; op: 'write'; key: string; dataB64: string }
  | { id: string; op: 'read'; key: string }
  | { id: string; op: 'delete'; key: string };

interface Pending {
  resolve: (data: { ok?: boolean; dataB64?: string }) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export interface DirectTransport {
  writeChunk(key: string, data: Uint8Array): Promise<void>;
  readChunk(key: string): Promise<Uint8Array>;
  deleteChunk(key: string): Promise<void>;
  close(): void;
}

const toB64 = (b: Uint8Array): string =>
  btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64 = (s: string): Uint8Array => {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
  return out;
};

const CHANNEL_TIMEOUT_MS = 60_000;
const CONNECT_TIMEOUT_MS = 15_000;

/**
 * Intenta abrir el transporte directo con el agente. Devuelve el transporte si
 * el DataChannel queda abierto, o `null` si hay que caer al relay.
 */
export async function connectDirectTransport(agentId: string): Promise<DirectTransport | null> {
  let pc: RTCPeerConnection | null = null;
  try {
    pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    const channel = pc.createDataChannel('noctcom-blobs', { ordered: true });
    channel.binaryType = 'arraybuffer';

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    // Sin trickle: esperamos a reunir candidatos ICE para mandar la SDP completa.
    await waitForIceGathering(pc, CONNECT_TIMEOUT_MS);

    const localSdp = pc.localDescription?.sdp;
    if (!localSdp) { pc.close(); return null; }

    let answer: string;
    try {
      const res = await apiFetch<{ answer: string }>('/api/v1/storage/agent-rtc/offer', {
        method: 'POST',
        body: JSON.stringify({ agentId, offer: localSdp }),
      });
      answer = res.answer;
    } catch {
      // 409 (no soportado), 502 (no negoció) u otro → fallback al relay.
      pc.close();
      return null;
    }

    await pc.setRemoteDescription({ type: 'answer', sdp: answer });
    const opened = await waitForChannelOpen(channel, CONNECT_TIMEOUT_MS);
    if (!opened) { pc.close(); return null; }

    return makeTransport(pc, channel);
  } catch {
    try { pc?.close(); } catch { /* */ }
    return null;
  }
}

function waitForIceGathering(pc: RTCPeerConnection, timeoutMs: number): Promise<void> {
  if (pc.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => { clearTimeout(timer); pc.removeEventListener('icegatheringstatechange', check); resolve(); };
    const check = () => { if (pc.iceGatheringState === 'complete') done(); };
    const timer = setTimeout(done, timeoutMs); // seguimos con lo reunido hasta ahora
    pc.addEventListener('icegatheringstatechange', check);
  });
}

function waitForChannelOpen(channel: RTCDataChannel, timeoutMs: number): Promise<boolean> {
  if (channel.readyState === 'open') return Promise.resolve(true);
  return new Promise((resolve) => {
    const timer = setTimeout(() => { cleanup(); resolve(false); }, timeoutMs);
    const onOpen = () => { cleanup(); resolve(true); };
    const onErr = () => { cleanup(); resolve(false); };
    const cleanup = () => {
      clearTimeout(timer);
      channel.removeEventListener('open', onOpen);
      channel.removeEventListener('error', onErr);
    };
    channel.addEventListener('open', onOpen);
    channel.addEventListener('error', onErr);
  });
}

function makeTransport(pc: RTCPeerConnection, channel: RTCDataChannel): DirectTransport {
  const pending = new Map<string, Pending>();
  let seq = 0;

  channel.addEventListener('message', (ev: MessageEvent) => {
    let msg: { id?: string; ok?: boolean; dataB64?: string; error?: string };
    try {
      msg = JSON.parse(typeof ev.data === 'string' ? ev.data : new TextDecoder().decode(ev.data));
    } catch { return; }
    if (!msg.id) return;
    const p = pending.get(msg.id);
    if (!p) return;
    clearTimeout(p.timer);
    pending.delete(msg.id);
    if (msg.error) p.reject(new Error(msg.error));
    else p.resolve({ ok: msg.ok, dataB64: msg.dataB64 });
  });

  function send(op: 'write' | 'read' | 'delete', key: string, dataB64?: string): Promise<{ ok?: boolean; dataB64?: string }> {
    if (channel.readyState !== 'open') return Promise.reject(new Error('rtc-channel-closed'));
    const id = `r${++seq}`;
    const frame: RtcOp = op === 'write'
      ? { id, op: 'write', key, dataB64: dataB64 ?? '' }
      : { id, op, key };
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { pending.delete(id); reject(new Error('rtc-timeout')); }, CHANNEL_TIMEOUT_MS);
      pending.set(id, { resolve, reject, timer });
      try {
        channel.send(JSON.stringify(frame));
      } catch (err) {
        clearTimeout(timer);
        pending.delete(id);
        reject(err as Error);
      }
    });
  }

  return {
    async writeChunk(key, data) { await send('write', key, toB64(data)); },
    async readChunk(key) {
      const res = await send('read', key);
      if (!res.dataB64) throw new Error('rtc-no-data');
      return fromB64(res.dataB64);
    },
    async deleteChunk(key) { await send('delete', key); },
    close() {
      for (const p of pending.values()) { clearTimeout(p.timer); p.reject(new Error('rtc-closed')); }
      pending.clear();
      try { channel.close(); } catch { /* */ }
      try { pc.close(); } catch { /* */ }
    },
  };
}
