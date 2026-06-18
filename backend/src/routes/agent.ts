/**
 * Agente local "Noctcom Connector".
 *
 * Permite a un usuario gestionar los discos de SU máquina desde la web cloud.
 * El agente es un demonio que el usuario instala; se empareja con la cuenta y
 * abre una conexión WS saliente (sin puertos entrantes). Aquí vive:
 *   - el emparejamiento (código de un solo uso),
 *   - el canal WS autenticado por challenge-response (firma Ed25519),
 *   - el alta/listado/revocado de agentes.
 *
 * Seguridad: solo guardamos la clave PÚBLICA del agente; la privada nunca sale
 * de su máquina. El backend trata todo lo que llega del agente como no fiable y
 * acotado a su usuario. El nombre del agente va cifrado con la MK (ZK).
 */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { createHash, randomBytes } from 'node:crypto';
import sodium from 'libsodium-wrappers-sumo';
import { db } from '../db/pool.js';
import { publishChange } from '../db/redis.js';
import { presignDownload } from '../storage/s3.js';
import * as registry from '../agents/registry.js';
import { env } from '../config.js';

// Binarios del agente disponibles para descarga (subidos a B2 con
// scripts/upload-agent-release.ts). Solo se ofrecen los que existen de verdad.
const DOWNLOADS: Record<string, string> = {
  windows: 'downloads/noctcom-connector-windows.exe',
  linux: 'downloads/noctcom-connector-linux',
};

// SHA256 (hex) del binario servido por plataforma, para transparencia de descarga.
function sha256For(platform: string): string | null {
  if (platform === 'windows') return env.AGENT_WINDOWS_SHA256 || null;
  if (platform === 'linux') return env.AGENT_LINUX_SHA256 || null;
  return null;
}

// ¿Está el binario realmente publicado en B2 y se puede ofrecer? Windows ya está
// publicado desde siempre; Linux solo cuando se ha subido y se ha configurado su
// SHA (AGENT_LINUX_SHA256 actúa de interruptor). Así nunca ofrecemos un enlace
// roto: en cuanto subes el binario Linux y pones su hash, la descarga aparece.
function isPublished(platform: string): boolean {
  if (!Object.prototype.hasOwnProperty.call(DOWNLOADS, platform)) return false;
  if (platform === 'linux') return Boolean(env.AGENT_LINUX_SHA256);
  return true;
}

const bytesB64 = z.string().regex(/^[A-Za-z0-9_-]+$/, 'base64url required');
const fromB64 = (s: string) => Buffer.from(s, 'base64url');
const toB64 = (b: Buffer | Uint8Array) => Buffer.from(b).toString('base64url');

// Alfabeto sin caracteres ambiguos (sin I, O, 0, 1) para que el código sea
// fácil de teclear. 8 chars sobre 32 símbolos ≈ 40 bits; con TTL de 10 min,
// un solo uso y rate-limit en /pair/complete, es de sobra.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function generatePairingCode(): string {
  const bytes = randomBytes(8);
  let out = '';
  for (let i = 0; i < 8; i++) out += CODE_ALPHABET[bytes[i]! % CODE_ALPHABET.length];
  return out;
}
function hashCode(code: string): Buffer {
  return createHash('blake2b512')
    .update('noctcom.agent.pair.v1')
    .update(code.trim().toUpperCase())
    .digest()
    .subarray(0, 32);
}

const pairBeginSchema = z.object({
  nameEncrypted: bytesB64.max(512),
  nameNonce: bytesB64.max(64),
});
const pairCompleteSchema = z.object({
  code: z.string().min(6).max(16),
  agentPublicKey: bytesB64.max(64), // Ed25519, 32 bytes
  platform: z.enum(['windows', 'linux', 'macos']).optional(),
});

const agentRoutes: FastifyPluginAsync = async (app) => {
  await sodium.ready;

  // ─── POST /pair/begin (auth) ─ código de un solo uso ──────
  // La web aporta el nombre del agente ya cifrado con la MK (zero-knowledge).
  app.post('/pair/begin', {
    onRequest: [app.authenticate],
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
  }, async (req, reply) => {
    // En el cloud gestionado, el Connector es de los planes de pago (cualquiera
    // desde 1€): es lo que el trial promete desbloquear. Admin exento (pruebas).
    // En self-host (sin Stripe) no hay gate: siempre disponible.
    if (env.STRIPE_SECRET_KEY) {
      const g = await db.query('SELECT plan, is_admin, agent_unlock FROM users WHERE id = $1', [req.user.sub]);
      const gu = g.rows[0];
      // El Connector se desbloquea con cualquier plan de pago O con el desbloqueo
      // "Tus discos" de por vida (agent_unlock). Admin exento (pruebas).
      if (gu && gu.plan === 'free' && !gu.is_admin && !gu.agent_unlock) {
        return reply.code(403).send({ error: 'plan-required' });
      }
    }
    const body = pairBeginSchema.parse(req.body);
    const code = generatePairingCode();
    const expires = new Date(Date.now() + 10 * 60 * 1000);
    await db.query(
      `INSERT INTO agent_pairing_tokens (user_id, code_hash, name_encrypted, name_nonce, expires_at)
       VALUES ($1,$2,$3,$4,$5)`,
      [req.user.sub, hashCode(code), fromB64(body.nameEncrypted), fromB64(body.nameNonce), expires],
    );
    return reply.send({ code, expiresAt: expires.toISOString() });
  });

  // ─── POST /pair/complete (sin auth, con el código) ────────
  app.post(
    '/pair/complete',
    { config: { rateLimit: { max: 10, timeWindow: 60_000 } } },
    async (req, reply) => {
      const body = pairCompleteSchema.parse(req.body);
      const pubkey = fromB64(body.agentPublicKey);
      if (pubkey.length !== 32) return reply.badRequest('clave pública inválida');

      const t = await db.query(
        `SELECT id, user_id, name_encrypted, name_nonce
           FROM agent_pairing_tokens
          WHERE code_hash = $1 AND used_at IS NULL AND expires_at > now()
          ORDER BY created_at DESC LIMIT 1`,
        [hashCode(body.code)],
      );
      if (t.rowCount === 0) {
        return reply.unauthorized('código de emparejamiento inválido o expirado');
      }
      const tok = t.rows[0];

      const a = await db.query(
        `INSERT INTO agents (user_id, agent_public_key, name_encrypted, name_nonce, platform, last_seen_at)
         VALUES ($1,$2,$3,$4,$5, now()) RETURNING id`,
        [tok.user_id, pubkey, tok.name_encrypted, tok.name_nonce, body.platform ?? null],
      );
      await db.query(`UPDATE agent_pairing_tokens SET used_at = now() WHERE id = $1`, [tok.id]);

      publishChange(tok.user_id, { resource: 'agents', action: 'new' });
      return reply.code(201).send({ agentId: a.rows[0].id });
    },
  );

  // ─── GET /version ─ última versión publicada del agente ───
  // Público: el agente instalado la consulta al arrancar y en `update` para
  // saber si hay una versión nueva. No expone nada sensible (solo un semver).
  app.get<{ Querystring: { platform?: string } }>('/version', async (req, reply) => {
    const platform = (req.query.platform ?? '').toLowerCase();
    const available = isPublished(platform);
    // Transparencia de descarga: SHA256 del binario y enlace a VirusTotal, por
    // plataforma y solo si hay hash configurado (nunca un hash inventado).
    const sha256 = available ? sha256For(platform) : null;
    return reply.send({
      version: env.AGENT_LATEST_VERSION,
      platform: platform || null,
      available,
      downloadUrl: available ? `/api/v1/agent/download?platform=${platform}` : null,
      sha256,
      virusTotalUrl: sha256 ? `https://www.virustotal.com/gui/file/${sha256}` : null,
    });
  });

  // ─── GET /download ─ descarga del binario del agente ──────
  // Público (es un instalador): redirige a una URL firmada de B2.
  app.get<{ Querystring: { platform?: string } }>('/download', async (req, reply) => {
    const platform = (req.query.platform ?? '').toLowerCase();
    if (!isPublished(platform)) return reply.notFound('no hay binario para esa plataforma todavía');
    const url = await presignDownload(DOWNLOADS[platform]!, 300);
    return reply.redirect(url, 302);
  });

  // ─── GET / (auth) ─ listar agentes del usuario ────────────
  app.get('/', { onRequest: [app.authenticate] }, async (req, reply) => {
    const r = await db.query(
      `SELECT id, name_encrypted, name_nonce, platform, last_seen_at, created_at
         FROM agents WHERE user_id = $1 AND revoked_at IS NULL
        ORDER BY created_at ASC`,
      [req.user.sub],
    );
    const online = registry.onlineAgentIds(req.user.sub);
    return reply.send(
      r.rows.map((a) => ({
        id: a.id,
        nameEncrypted: toB64(a.name_encrypted),
        nameNonce: toB64(a.name_nonce),
        platform: a.platform,
        online: online.has(a.id),
        lastSeenAt: a.last_seen_at?.toISOString() ?? null,
        createdAt: a.created_at.toISOString(),
      })),
    );
  });

  // ─── DELETE /:id (auth) ─ revocar agente ──────────────────
  app.delete<{ Params: { id: string } }>(
    '/:id',
    { onRequest: [app.authenticate] },
    async (req, reply) => {
      const r = await db.query(
        `UPDATE agents SET revoked_at = now()
          WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL RETURNING id`,
        [req.params.id, req.user.sub],
      );
      if (r.rowCount === 0) return reply.notFound('agente no encontrado');
      registry.disconnect(req.params.id, 'revoked');
      publishChange(req.user.sub, { resource: 'agents', action: 'revoked' });
      return reply.send({ ok: true });
    },
  );

  // ─── GET /ws ─ canal del agente (challenge-auth en el socket) ──
  // El agente conecta con ?agentId=…; firmamos un reto que debe firmar con su
  // clave Ed25519. Sin bearer persistente: la privada local es el único secreto.
  app.get('/ws', { websocket: true }, async (socket, req) => {
    const url = new URL(req.url, 'http://localhost');
    const agentId = url.searchParams.get('agentId');
    if (!agentId) { socket.close(4001, 'missing agentId'); return; }

    const a = await db.query(
      `SELECT user_id, agent_public_key FROM agents WHERE id = $1 AND revoked_at IS NULL`,
      [agentId],
    );
    if (a.rowCount === 0) { socket.close(4003, 'unknown agent'); return; }
    const userId = a.rows[0].user_id as string;
    const pubkey = new Uint8Array(a.rows[0].agent_public_key);

    const nonce = randomBytes(32);
    let authed = false;
    socket.send(JSON.stringify({ type: 'challenge', nonce: toB64(nonce) }));
    const authTimer = setTimeout(() => { if (!authed) socket.close(4008, 'auth timeout'); }, 10_000);

    socket.on('message', async (raw: unknown) => {
      let msg: any;
      try { msg = JSON.parse(String(raw)); } catch { return; }

      if (!authed) {
        if (msg?.type !== 'auth' || typeof msg.signature !== 'string') return;
        let ok = false;
        try { ok = sodium.crypto_sign_verify_detached(fromB64(msg.signature), nonce, pubkey); }
        catch { ok = false; }
        if (!ok) { socket.close(4003, 'bad signature'); return; }
        authed = true;
        clearTimeout(authTimer);
        registry.addConnection(agentId, userId, socket);
        await db.query(`UPDATE agents SET last_seen_at = now() WHERE id = $1`, [agentId]);
        socket.send(JSON.stringify({ type: 'ready' }));
        publishChange(userId, { resource: 'agents', action: 'online' });
        return;
      }

      if (msg?.type === 'heartbeat') {
        await db.query(`UPDATE agents SET last_seen_at = now() WHERE id = $1`, [agentId]);
        socket.send(JSON.stringify({ type: 'heartbeat-ack', ts: Date.now() }));
      } else if (msg?.type === 'res' && typeof msg.id === 'string') {
        registry.resolveResponse(agentId, msg.id, !!msg.ok, msg.data, msg.error);
      }
    });

    socket.on('close', () => {
      clearTimeout(authTimer);
      registry.removeConnection(agentId, socket);
      if (authed) publishChange(userId, { resource: 'agents', action: 'offline' });
    });
  });
};

export default agentRoutes;
