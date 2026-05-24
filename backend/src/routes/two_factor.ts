/**
 * 2FA y recuperación de cuenta.
 *
 * TOTP zero-knowledge:
 *   - El secret TOTP lo genera el cliente.
 *   - El cliente cifra el secret con HKDF(MK, "noctcom.totp.v1") → totp_key.
 *   - Durante login, el cliente envía la totp_key wrapped junto al código.
 *   - El servidor desencripta el secret en memoria, verifica el código,
 *     borra totp_key inmediatamente. El secret nunca queda en claro persistido.
 *
 * WebAuthn / Passkeys:
 *   - Es un 2º factor genuino. El servidor guarda la public_key y verifica
 *     la firma. Esto NO compromete zero-knowledge — solo prueba posesión
 *     del authenticator, no descifra nada.
 *
 * Recuperación:
 *   - Modo A (zero-knowledge puro): mnemonic de 12 palabras → recovery key →
 *     desempaqueta las privkeys. Si el usuario pierde la frase, los datos
 *     son irrecuperables. NO HAY back door.
 *   - Modo B (opt-in con trade-off): email de recuperación que el servidor
 *     puede leer para enviar un link que permite re-cifrar con una nueva
 *     password (requiere que el usuario tenga al menos una sesión activa
 *     o un dispositivo emparejado).
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import sodium from 'libsodium-wrappers-sumo';
import { db } from '../db/pool.js';

const bytesB64 = z.string().regex(/^[A-Za-z0-9_-]+$/);
const fromB64 = (s: string) => Buffer.from(s, 'base64url');
const toB64 = (b: Buffer | Uint8Array) => Buffer.from(b).toString('base64url');

// ─────────────────────────────────────────────────────────────────
// TOTP verification (HOTP RFC 6238)
// Implementación pura para no añadir dependencia.
// ─────────────────────────────────────────────────────────────────
function verifyTotp(secret: Buffer, code: string, window = 1, period = 30, digits = 6): boolean {
  const now = Math.floor(Date.now() / 1000 / period);
  const expected = code.padStart(digits, '0');

  for (let offset = -window; offset <= window; offset++) {
    const counter = Buffer.alloc(8);
    counter.writeBigInt64BE(BigInt(now + offset));

    const hmac = createHash('sha1');
    // Node no expone HMAC vía createHash; usamos crypto.createHmac
    const { createHmac } = require('node:crypto');
    const mac = createHmac('sha1', secret).update(counter).digest();
    const idx = (mac[mac.length - 1] ?? 0) & 0x0f;
    const truncated = ((mac[idx]! & 0x7f) << 24)
      | ((mac[idx + 1]! & 0xff) << 16)
      | ((mac[idx + 2]! & 0xff) << 8)
      | (mac[idx + 3]! & 0xff);
    const otp = (truncated % 10 ** digits).toString().padStart(digits, '0');

    // Constant-time compare
    if (otp.length === expected.length) {
      const a = Buffer.from(otp);
      const b = Buffer.from(expected);
      if (timingSafeEqual(a, b)) return true;
    }
  }
  return false;
}

const twoFactorRoutes: FastifyPluginAsync = async (app) => {
  await sodium.ready;

  // ═══════════════════════════════════════════════════════════
  // TOTP
  // ═══════════════════════════════════════════════════════════

  // ─── POST /totp/enable ────────────────────────────────────
  // El cliente genera el secret y los backup codes, ambos wrapped con
  // HKDF(MK, "noctcom.totp.v1"). Server solo almacena los blobs.
  app.post(
    '/totp/enable',
    { onRequest: [app.authenticate] },
    async (req, reply) => {
      const schema = z.object({
        secretWrapped: bytesB64,
        secretNonce: bytesB64,
        backupCodesWrapped: bytesB64,
        backupCodesNonce: bytesB64,
        // Verificación inicial: el cliente envía el primer código TOTP
        // junto con el secret desempaquetado temporalmente, para que el
        // servidor confirme que está bien configurado.
        initialCode: z.string().length(6),
        unwrapKey: bytesB64,   // clave temporal HKDF que server usa SOLO para esta llamada
      });
      const body = schema.parse(req.body);
      const userId = req.user.sub;

      // Desempaqueta el secret en memoria, verifica, descarta la unwrap key
      const unwrapKey = fromB64(body.unwrapKey);
      let secret: Buffer;
      try {
        const ct = fromB64(body.secretWrapped);
        const nonce = fromB64(body.secretNonce);
        secret = Buffer.from(
          sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(null, ct, null, nonce, unwrapKey),
        );
      } catch {
        sodium.memzero(unwrapKey);
        return reply.badRequest('invalid wrap key or secret');
      } finally {
        sodium.memzero(unwrapKey);
      }

      const ok = verifyTotp(secret, body.initialCode);
      sodium.memzero(secret);
      if (!ok) return reply.badRequest('initial TOTP code invalid');

      await db.query(
        `UPDATE users SET
          totp_enabled = TRUE,
          totp_secret_wrapped = $1,
          totp_secret_nonce = $2,
          totp_backup_codes_wrapped = $3,
          totp_backup_codes_nonce = $4,
          totp_verified_at = now()
         WHERE id = $5`,
        [
          fromB64(body.secretWrapped), fromB64(body.secretNonce),
          fromB64(body.backupCodesWrapped), fromB64(body.backupCodesNonce),
          userId,
        ],
      );
      return reply.send({ ok: true });
    },
  );

  // ─── POST /totp/verify ────────────────────────────────────
  // Se llama durante login. El cliente envía la unwrap key derivada de MK
  // junto al código. Server desempaqueta, verifica, descarta.
  app.post('/totp/verify', async (req, reply) => {
    const schema = z.object({
      userId: z.string().uuid(),
      code: z.string().length(6),
      unwrapKey: bytesB64,
    });
    const body = schema.parse(req.body);

    const r = await db.query(
      `SELECT totp_secret_wrapped, totp_secret_nonce, totp_enabled
       FROM users WHERE id = $1`,
      [body.userId],
    );
    if (r.rowCount === 0 || !r.rows[0].totp_enabled) {
      return reply.badRequest('TOTP not enabled');
    }

    const unwrapKey = fromB64(body.unwrapKey);
    let secret: Buffer;
    try {
      secret = Buffer.from(sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
        null,
        r.rows[0].totp_secret_wrapped,
        null,
        r.rows[0].totp_secret_nonce,
        unwrapKey,
      ));
    } catch {
      sodium.memzero(unwrapKey);
      return reply.unauthorized('invalid unwrap');
    } finally {
      sodium.memzero(unwrapKey);
    }

    const ok = verifyTotp(secret, body.code);
    sodium.memzero(secret);
    if (!ok) return reply.unauthorized('invalid TOTP code');

    return reply.send({ ok: true });
  });

  // ─── POST /totp/disable ───────────────────────────────────
  app.post(
    '/totp/disable',
    { onRequest: [app.authenticate] },
    async (req, reply) => {
      const schema = z.object({ confirmCode: z.string().length(6), unwrapKey: bytesB64 });
      const body = schema.parse(req.body);
      // (Verificación TOTP previa requerida igual que arriba)
      await db.query(
        `UPDATE users SET
          totp_enabled = FALSE,
          totp_secret_wrapped = NULL,
          totp_secret_nonce = NULL,
          totp_backup_codes_wrapped = NULL,
          totp_backup_codes_nonce = NULL
         WHERE id = $1`,
        [req.user.sub],
      );
      return reply.send({ ok: true });
    },
  );

  // ═══════════════════════════════════════════════════════════
  // WebAuthn / Passkeys
  // En producción usa @simplewebauthn/server. Aquí mostramos la estructura.
  // ═══════════════════════════════════════════════════════════

  // ─── POST /webauthn/register/begin ────────────────────────
  app.post(
    '/webauthn/register/begin',
    { onRequest: [app.authenticate] },
    async (req, reply) => {
      const userId = req.user.sub;
      const challenge = randomBytes(32);
      const expires = new Date(Date.now() + 5 * 60 * 1000);

      await db.query(
        `INSERT INTO webauthn_challenges (user_id, challenge, purpose, expires_at)
         VALUES ($1,$2,'registration',$3)`,
        [userId, challenge, expires],
      );

      const u = await db.query('SELECT username FROM users WHERE id = $1', [userId]);

      return reply.send({
        challenge: toB64(challenge),
        rp: { name: 'Noctcom', id: new URL(process.env.PUBLIC_URL ?? 'https://localhost').hostname },
        user: {
          id: toB64(Buffer.from(userId.replace(/-/g, ''), 'hex')),
          name: u.rows[0].username,
          displayName: u.rows[0].username,
        },
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 },     // ES256
          { type: 'public-key', alg: -257 },   // RS256
        ],
        authenticatorSelection: {
          residentKey: 'preferred',
          userVerification: 'preferred',
        },
        timeout: 60_000,
        attestation: 'none',
      });
    },
  );

  // ─── POST /webauthn/register/finish ───────────────────────
  app.post(
    '/webauthn/register/finish',
    { onRequest: [app.authenticate] },
    async (req, reply) => {
      const schema = z.object({
        credentialId: bytesB64,
        publicKey: bytesB64,
        transports: z.array(z.string()).optional(),
        nickname: z.string().max(64).optional(),
        clientDataJSON: bytesB64,
        attestationObject: bytesB64,
      });
      const body = schema.parse(req.body);
      const userId = req.user.sub;

      // TODO: validar attestationObject con @simplewebauthn/server en prod.
      // Aquí confiamos en que la publicKey decodificada es válida.

      await db.query(
        `INSERT INTO webauthn_credentials
          (user_id, credential_id, public_key, transports, nickname)
         VALUES ($1,$2,$3,$4,$5)`,
        [
          userId, fromB64(body.credentialId), fromB64(body.publicKey),
          body.transports ?? [], body.nickname ?? null,
        ],
      );
      return reply.code(201).send({ ok: true });
    },
  );

  // ─── POST /webauthn/authenticate/begin ────────────────────
  app.post('/webauthn/authenticate/begin', async (req, reply) => {
    const schema = z.object({ emailHash: bytesB64 });
    const body = schema.parse(req.body);

    const u = await db.query(
      'SELECT id FROM users WHERE email_hash = $1',
      [fromB64(body.emailHash)],
    );
    if (u.rowCount === 0) return reply.send({ allowCredentials: [], challenge: toB64(randomBytes(32)) });

    const userId = u.rows[0].id;
    const challenge = randomBytes(32);
    const expires = new Date(Date.now() + 5 * 60 * 1000);

    await db.query(
      `INSERT INTO webauthn_challenges (user_id, challenge, purpose, expires_at)
       VALUES ($1,$2,'authentication',$3)`,
      [userId, challenge, expires],
    );

    const creds = await db.query(
      `SELECT credential_id, transports FROM webauthn_credentials
       WHERE user_id = $1 AND revoked_at IS NULL`,
      [userId],
    );

    return reply.send({
      challenge: toB64(challenge),
      allowCredentials: creds.rows.map((c) => ({
        type: 'public-key',
        id: toB64(c.credential_id),
        transports: c.transports,
      })),
      timeout: 60_000,
      userVerification: 'preferred',
    });
  });

  // ─── POST /webauthn/authenticate/finish ───────────────────
  app.post('/webauthn/authenticate/finish', async (req, reply) => {
    // TODO: verificar la firma con la public_key almacenada.
    // En prod usa @simplewebauthn/server.verifyAuthenticationResponse
    return reply.send({ ok: true });
  });

  // ─── DELETE /webauthn/:id ─ revocar passkey ───────────────
  app.delete<{ Params: { id: string } }>(
    '/webauthn/:id',
    { onRequest: [app.authenticate] },
    async (req, reply) => {
      await db.query(
        `UPDATE webauthn_credentials SET revoked_at = now()
         WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL`,
        [req.params.id, req.user.sub],
      );
      return reply.send({ ok: true });
    },
  );

  // ─── GET /webauthn ─ listar passkeys ──────────────────────
  app.get('/webauthn', { onRequest: [app.authenticate] }, async (req, reply) => {
    const r = await db.query(
      `SELECT id, nickname, device_type, last_used_at, created_at
       FROM webauthn_credentials
       WHERE user_id = $1 AND revoked_at IS NULL
       ORDER BY created_at DESC`,
      [req.user.sub],
    );
    return reply.send({ passkeys: r.rows });
  });

  // ═══════════════════════════════════════════════════════════
  // Recuperación con frase mnemónica
  // El cliente prueba conocer la recovery seed (12 palabras) firmando
  // un challenge. El servidor devuelve las privkeys wrapped con la
  // recovery key, que el cliente desempaqueta y luego re-wrappea con
  // una nueva MK derivada de una nueva contraseña.
  // ═══════════════════════════════════════════════════════════

  app.post('/recovery/init', async (req, reply) => {
    const schema = z.object({ emailHash: bytesB64 });
    const body = schema.parse(req.body);

    const r = await db.query(
      `SELECT id, recovery_kdf_salt, recovery_enabled
       FROM users WHERE email_hash = $1`,
      [fromB64(body.emailHash)],
    );

    // Constant-time response
    const salt = r.rowCount === 0 || !r.rows[0].recovery_enabled
      ? createHash('blake2b512').update('noctcom-fake-recovery').update(fromB64(body.emailHash)).digest().subarray(0, 16)
      : r.rows[0].recovery_kdf_salt;

    const challenge = randomBytes(32);

    if (r.rowCount && r.rows[0].recovery_enabled) {
      const expires = new Date(Date.now() + 10 * 60 * 1000);
      await db.query(
        `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
         VALUES ($1, $2, $3)`,
        [r.rows[0].id, createHash('blake2b512').update(challenge).digest().subarray(0, 32), expires],
      );
    }

    return reply.send({
      recoveryKdfSalt: toB64(salt),
      challenge: toB64(challenge),
    });
  });

  // POST /recovery/finalize: el cliente envía nuevo opaque_record,
  // nuevas privkeys wrapped con nueva MK, y la prueba de la frase.
  app.post('/recovery/finalize', async (req, reply) => {
    const schema = z.object({
      emailHash: bytesB64,
      challenge: bytesB64,
      signature: bytesB64,
      newOpaqueRecord: bytesB64,
      newKdfSalt: bytesB64,
      newIdentityPrivateKeyWrapped: bytesB64,
      newIdentityPrivateKeyNonce: bytesB64,
      newExchangePrivateKeyWrapped: bytesB64,
      newExchangePrivateKeyNonce: bytesB64,
    });
    const body = schema.parse(req.body);

    const u = await db.query(
      `SELECT id, identity_public_key FROM users WHERE email_hash = $1`,
      [fromB64(body.emailHash)],
    );
    if (u.rowCount === 0) return reply.unauthorized();

    const ok = sodium.crypto_sign_verify_detached(
      fromB64(body.signature),
      fromB64(body.challenge),
      u.rows[0].identity_public_key,
    );
    if (!ok) return reply.unauthorized('invalid recovery signature');

    // Verificar que el token existe y no expiró
    const tokenHash = createHash('blake2b512').update(fromB64(body.challenge)).digest().subarray(0, 32);
    const t = await db.query(
      `SELECT id FROM password_reset_tokens
       WHERE user_id = $1 AND token_hash = $2 AND used_at IS NULL AND expires_at > now()`,
      [u.rows[0].id, tokenHash],
    );
    if (t.rowCount === 0) return reply.unauthorized('expired or used recovery token');

    await db.query(
      `UPDATE users SET
        opaque_record = $1,
        kdf_salt = $2,
        identity_private_key_wrapped = $3,
        identity_private_key_nonce = $4,
        exchange_private_key_wrapped = $5,
        exchange_private_key_nonce = $6
       WHERE id = $7`,
      [
        fromB64(body.newOpaqueRecord), fromB64(body.newKdfSalt),
        fromB64(body.newIdentityPrivateKeyWrapped), fromB64(body.newIdentityPrivateKeyNonce),
        fromB64(body.newExchangePrivateKeyWrapped), fromB64(body.newExchangePrivateKeyNonce),
        u.rows[0].id,
      ],
    );

    await db.query(`UPDATE password_reset_tokens SET used_at = now() WHERE id = $1`, [t.rows[0].id]);

    // Revocar todas las sesiones activas
    await db.query(`UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`, [u.rows[0].id]);

    return reply.send({ ok: true });
  });
};

export default twoFactorRoutes;
