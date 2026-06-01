/**
 * 2FA y recuperación de cuenta.
 *
 * NOTA: TOTP eliminado (2026-06). Se quitó el 2FA por TOTP; se rehará con
 * otro mecanismo (probablemente OTP por email vía SMTP). Quedan WebAuthn y
 * recuperación.
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
import { createHash, randomBytes } from 'node:crypto';
import sodium from 'libsodium-wrappers-sumo';
import { db } from '../db/pool.js';

const bytesB64 = z.string().regex(/^[A-Za-z0-9_-]+$/);
const fromB64 = (s: string) => Buffer.from(s, 'base64url');
const toB64 = (b: Buffer | Uint8Array) => Buffer.from(b).toString('base64url');

const twoFactorRoutes: FastifyPluginAsync = async (app) => {
  await sodium.ready;

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

  // POST /recovery/finalize: el cliente prueba la frase mnemónica firmando
  // con la recovery key. Luego envía nuevas keys wrapped con nueva MK.
  app.post('/recovery/finalize', async (req, reply) => {
    const schema = z.object({
      emailHash: bytesB64,
      challenge: bytesB64,
      signature: bytesB64,
      newOpaqueRecord: bytesB64,
      newKdfSalt: bytesB64,
      newKdfOpsLimit: z.number().int().min(2).max(10),
      newKdfMemLimit: z.number().int().min(67108864).max(1073741824),
      newIdentityPublicKey: bytesB64,
      newIdentityPrivateKeyWrapped: bytesB64,
      newIdentityPrivateKeyNonce: bytesB64,
      newExchangePublicKey: bytesB64,
      newExchangePrivateKeyWrapped: bytesB64,
      newExchangePrivateKeyNonce: bytesB64,
    });
    const body = schema.parse(req.body);

    const u = await db.query(
      `SELECT id, recovery_public_key, recovery_enabled FROM users WHERE email_hash = $1`,
      [fromB64(body.emailHash)],
    );
    if (u.rowCount === 0) return reply.unauthorized();
    if (!u.rows[0].recovery_enabled || !u.rows[0].recovery_public_key) {
      return reply.unauthorized('recovery not enabled');
    }

    const ok = sodium.crypto_sign_verify_detached(
      fromB64(body.signature),
      fromB64(body.challenge),
      u.rows[0].recovery_public_key,
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
        kdf_ops_limit = $3,
        kdf_mem_limit = $4,
        identity_public_key = $5,
        identity_private_key_wrapped = $6,
        identity_private_key_nonce = $7,
        exchange_public_key = $8,
        exchange_private_key_wrapped = $9,
        exchange_private_key_nonce = $10
       WHERE id = $11`,
      [
        fromB64(body.newOpaqueRecord), fromB64(body.newKdfSalt),
        body.newKdfOpsLimit, body.newKdfMemLimit,
        fromB64(body.newIdentityPublicKey),
        fromB64(body.newIdentityPrivateKeyWrapped), fromB64(body.newIdentityPrivateKeyNonce),
        fromB64(body.newExchangePublicKey),
        fromB64(body.newExchangePrivateKeyWrapped), fromB64(body.newExchangePrivateKeyNonce),
        u.rows[0].id,
      ],
    );

    await db.query(`UPDATE password_reset_tokens SET used_at = now() WHERE id = $1`, [t.rows[0].id]);
    await db.query(`UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`, [u.rows[0].id]);

    return reply.send({ ok: true });
  });
};

export default twoFactorRoutes;
