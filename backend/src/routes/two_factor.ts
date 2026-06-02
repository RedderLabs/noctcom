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
import {
  verifyRegistrationResponse,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import { db } from '../db/pool.js';
import { env } from '../config.js';

const bytesB64 = z.string().regex(/^[A-Za-z0-9_-]+$/);
const fromB64 = (s: string) => Buffer.from(s, 'base64url');
const toB64 = (b: Buffer | Uint8Array) => Buffer.from(b).toString('base64url');

// ─── Config de Relying Party ────────────────────────────────────
// rpID = hostname del FRONTEND (donde corre la passkey, no el API). El origin
// debe coincidir exacto con lo que envía el navegador; aceptamos frontend + API
// por si comparten dominio o estamos en dev.
function rpConfig(): { rpName: string; rpID: string; origins: string[] } {
  const frontend = env.FRONTEND_URL ?? env.PUBLIC_URL;
  const url = new URL(frontend);
  const origins = new Set<string>([url.origin]);
  origins.add(new URL(env.PUBLIC_URL).origin);
  return { rpName: 'Noctcom', rpID: url.hostname, origins: [...origins] };
}

// Consume (borra) el challenge válido más reciente para un propósito dado.
// Garantiza un solo uso y limpia la fila para que no pueda reutilizarse.
async function consumeChallenge(userId: string, purpose: string): Promise<Buffer | null> {
  const r = await db.query(
    `DELETE FROM webauthn_challenges
      WHERE id = (
        SELECT id FROM webauthn_challenges
         WHERE user_id = $1 AND purpose = $2 AND expires_at > now()
         ORDER BY created_at DESC LIMIT 1)
      RETURNING challenge`,
    [userId, purpose],
  );
  return r.rowCount ? r.rows[0].challenge : null;
}

const twoFactorRoutes: FastifyPluginAsync = async (app) => {
  await sodium.ready;

  // ═══════════════════════════════════════════════════════════
  // WebAuthn / Passkeys — verificación real con @simplewebauthn/server
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
      const { rpName, rpID } = rpConfig();

      return reply.send({
        challenge: toB64(challenge),
        rp: { name: rpName, id: rpID },
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
      const userId = req.user.sub;
      const body = req.body as { response?: any; nickname?: string };
      if (!body?.response?.id) return reply.badRequest('falta response de registro');

      const challenge = await consumeChallenge(userId, 'registration');
      if (!challenge) return reply.unauthorized('challenge de registro expirado o inexistente');

      const { rpID, origins } = rpConfig();
      let verification;
      try {
        verification = await verifyRegistrationResponse({
          response: body.response,
          expectedChallenge: toB64(challenge),
          expectedOrigin: origins,
          expectedRPID: rpID,
          requireUserVerification: false,
        });
      } catch (err: any) {
        req.log.warn({ err: err?.message }, 'webauthn register verify failed');
        return reply.badRequest('attestation inválida');
      }

      if (!verification.verified || !verification.registrationInfo) {
        return reply.badRequest('registro de passkey no verificado');
      }

      const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;
      const nickname = typeof body.nickname === 'string' ? body.nickname.slice(0, 64) : null;

      // ON CONFLICT: re-registrar la misma passkey no es un error, es idempotente.
      await db.query(
        `INSERT INTO webauthn_credentials
          (user_id, credential_id, public_key, counter, transports, device_type, backed_up, nickname)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (credential_id) DO NOTHING`,
        [
          userId,
          Buffer.from(credential.id, 'base64url'),
          Buffer.from(credential.publicKey),
          credential.counter,
          credential.transports ?? [],
          credentialDeviceType,
          credentialBackedUp,
          nickname,
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
      rpId: rpConfig().rpID,
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
  // Verifica la firma de la passkey contra la public key almacenada. Esto
  // cierra el agujero anterior (antes devolvía {ok:true} sin comprobar nada).
  app.post('/webauthn/authenticate/finish', async (req, reply) => {
    const body = req.body as { response?: any };
    if (!body?.response?.id) return reply.badRequest('falta response de autenticación');

    const credIdBytes = Buffer.from(body.response.id, 'base64url');
    const c = await db.query(
      `SELECT id, user_id, public_key, counter, transports
         FROM webauthn_credentials
        WHERE credential_id = $1 AND revoked_at IS NULL`,
      [credIdBytes],
    );
    if (c.rowCount === 0) return reply.unauthorized('credential desconocida');
    const cred = c.rows[0];

    const challenge = await consumeChallenge(cred.user_id, 'authentication');
    if (!challenge) return reply.unauthorized('challenge de autenticación expirado o inexistente');

    const { rpID, origins } = rpConfig();
    let verification;
    try {
      verification = await verifyAuthenticationResponse({
        response: body.response,
        expectedChallenge: toB64(challenge),
        expectedOrigin: origins,
        expectedRPID: rpID,
        requireUserVerification: false,
        credential: {
          id: body.response.id,
          publicKey: new Uint8Array(cred.public_key),
          counter: Number(cred.counter),
          transports: (cred.transports ?? undefined) as any,
        },
      });
    } catch (err: any) {
      req.log.warn({ err: err?.message }, 'webauthn auth verify failed');
      return reply.unauthorized('verificación de passkey fallida');
    }

    if (!verification.verified) return reply.unauthorized('passkey inválida');

    // Actualiza el contador para detectar clonación de authenticators (un
    // contador que no avanza o retrocede indica una credencial duplicada).
    await db.query(
      `UPDATE webauthn_credentials SET counter = $1, last_used_at = now() WHERE id = $2`,
      [verification.authenticationInfo.newCounter, cred.id],
    );

    return reply.send({ ok: true, verified: true, userId: cred.user_id });
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
