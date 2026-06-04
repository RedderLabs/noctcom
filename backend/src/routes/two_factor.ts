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
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import sodium from 'libsodium-wrappers-sumo';
import {
  verifyRegistrationResponse,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import { db, tx } from '../db/pool.js';
import { env } from '../config.js';
import { issueSession } from '../session.js';
import { sendLoginCodeEmail } from '../mail.js';
import { hashEmail } from '../crypto/index.js';

const bytesB64 = z.string().regex(/^[A-Za-z0-9_-]+$/);
const fromB64 = (s: string) => Buffer.from(s, 'base64url');
const toB64 = (b: Buffer | Uint8Array) => Buffer.from(b).toString('base64url');

// ─── Config de Relying Party ────────────────────────────────────
// rpID = dominio registrable (apex) del FRONTEND, NO el hostname tal cual. Una
// passkey con rpID=apex (noctcom.com) vale tanto en el apex como en cualquier
// subdominio (www.noctcom.com), así evitamos OriginRpMismatch según por dónde
// entre el usuario. Lo derivamos también si FRONTEND_URL no estuviera definido
// (cae a PUBLIC_URL=api.noctcom.com → su apex sigue siendo noctcom.com).
function registrableDomain(hostname: string): string {
  // localhost / IPv4 / IPv6 no tienen dominio registrable: se usan tal cual.
  if (hostname === 'localhost' || /^\d+(\.\d+){3}$/.test(hostname) || hostname.includes(':')) {
    return hostname;
  }
  const parts = hostname.split('.');
  if (parts.length <= 2) return hostname;
  // Heurística eTLD+1: las dos últimas etiquetas. Cubre TLDs simples (.com/.org…).
  // No cubre TLDs compuestos (.co.uk); un rpID demasiado amplio lo rechaza el
  // navegador → falla seguro, no es un agujero. Si se usaran, haría falta una PSL.
  return parts.slice(-2).join('.');
}

function rpConfig(): { rpName: string; rpID: string; origins: string[] } {
  const frontend = new URL(env.FRONTEND_URL ?? env.PUBLIC_URL);
  const rpID = registrableDomain(frontend.hostname);

  // Orígenes aceptados en la verificación (register/authenticate finish). Deben
  // coincidir EXACTO con lo que envía el navegador. Aceptamos apex y www del
  // dominio del frontend, su origin literal, y el del API (dev / dominio común).
  const origins = new Set<string>([frontend.origin]);
  if (rpID === frontend.hostname.replace(/^www\./, '')) {
    origins.add(`${frontend.protocol}//${rpID}`);
    origins.add(`${frontend.protocol}//www.${rpID}`);
  }
  origins.add(new URL(env.PUBLIC_URL).origin);
  return { rpName: 'Noctcom', rpID, origins: [...origins] };
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

// Verifica una aserción de passkey contra la public key almacenada, consume el
// challenge y actualiza el counter. Devuelve el userId dueño de la credencial o
// null si la credencial no existe / no hay challenge / la firma no verifica.
// Puede lanzar si @simplewebauthn rechaza el formato → el caller lo captura.
async function verifyAssertion(response: any): Promise<{ userId: string } | null> {
  const credIdBytes = Buffer.from(response.id, 'base64url');
  const c = await db.query(
    `SELECT id, user_id, public_key, counter, transports
       FROM webauthn_credentials
      WHERE credential_id = $1 AND revoked_at IS NULL`,
    [credIdBytes],
  );
  if (c.rowCount === 0) return null;
  const cred = c.rows[0];

  const challenge = await consumeChallenge(cred.user_id, 'authentication');
  if (!challenge) return null;

  const { rpID, origins } = rpConfig();
  const verification = await verifyAuthenticationResponse({
    response,
    expectedChallenge: toB64(challenge),
    expectedOrigin: origins,
    expectedRPID: rpID,
    requireUserVerification: false,
    credential: {
      id: response.id,
      publicKey: new Uint8Array(cred.public_key),
      counter: Number(cred.counter),
      transports: (cred.transports ?? undefined) as any,
    },
  });
  if (!verification.verified) return null;

  // Counter actualizado → detecta clonación de authenticators.
  await db.query(
    `UPDATE webauthn_credentials SET counter = $1, last_used_at = now() WHERE id = $2`,
    [verification.authenticationInfo.newCounter, cred.id],
  );
  return { userId: cred.user_id };
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

    let result;
    try {
      result = await verifyAssertion(body.response);
    } catch (err: any) {
      req.log.warn({ err: err?.message }, 'webauthn auth verify failed');
      return reply.unauthorized('verificación de passkey fallida');
    }
    if (!result) return reply.unauthorized('passkey inválida o challenge expirado');

    return reply.send({ ok: true, verified: true, userId: result.userId });
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
  // Completar login con 2FA
  // El cliente llega aquí con un pending2faToken (emitido por
  // /auth/login/finalize tras verificar la contraseña). Al superar el 2º
  // factor, se canjea por una sesión completa vía issueSession.
  // ═══════════════════════════════════════════════════════════

  // Verifica el pending token y devuelve {userId, deviceId} o null.
  function verifyPending(token: unknown): { userId: string; deviceId: string | null } | null {
    if (typeof token !== 'string') return null;
    try {
      const d = app.jwt.verify(token) as { sub: string; deviceId?: string | null; scope?: string };
      if (d.scope !== 'pending-2fa' || !d.sub) return null;
      return { userId: d.sub, deviceId: d.deviceId ?? null };
    } catch {
      return null;
    }
  }

  // ─── POST /login/passkey/finish ───────────────────────────
  app.post('/login/passkey/finish', async (req, reply) => {
    const body = req.body as { pending2faToken?: unknown; response?: any };
    const pending = verifyPending(body.pending2faToken);
    if (!pending) return reply.unauthorized('sesión de 2FA expirada, vuelve a iniciar sesión');
    if (!body?.response?.id) return reply.badRequest('falta response de autenticación');

    let result;
    try {
      result = await verifyAssertion(body.response);
    } catch (err: any) {
      req.log.warn({ err: err?.message }, 'webauthn login verify failed');
      return reply.unauthorized('verificación de passkey fallida');
    }
    // La passkey debe pertenecer al MISMO usuario que pasó la contraseña.
    if (!result || result.userId !== pending.userId) {
      return reply.unauthorized('passkey inválida');
    }

    const payload = await issueSession(req, reply, pending.userId, pending.deviceId);
    return reply.send(payload);
  });

  // ─── POST /login/email/send ───────────────────────────────
  // El servidor no guarda el email en claro: el cliente lo reenvía aquí y
  // verificamos que su hash coincide con el de la cuenta antes de enviar.
  app.post('/login/email/send', async (req, reply) => {
    const schema = z.object({ pending2faToken: z.string(), email: z.string().email().max(254) });
    const body = schema.parse(req.body);
    const pending = verifyPending(body.pending2faToken);
    if (!pending) return reply.unauthorized('sesión de 2FA expirada, vuelve a iniciar sesión');

    const u = await db.query(
      `SELECT email_hash, two_factor_email_enabled FROM users WHERE id = $1`,
      [pending.userId],
    );
    if (u.rowCount === 0 || !u.rows[0].two_factor_email_enabled) {
      return reply.badRequest('2FA por email no está activado');
    }
    const emailHash = Buffer.from(hashEmail(body.email)); // BLAKE2b keyed (noctcom.email.v1)
    if (!timingSafeEqual(emailHash, u.rows[0].email_hash)) {
      return reply.badRequest('el email no coincide con la cuenta');
    }

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const codeHash = createHash('blake2b512').update(code).digest().subarray(0, 32);
    const expires = new Date(Date.now() + 10 * 60 * 1000);
    await db.query(
      `UPDATE users SET login_otp_hash = $1, login_otp_expires = $2, login_otp_attempts = 0
       WHERE id = $3`,
      [codeHash, expires, pending.userId],
    );
    sendLoginCodeEmail(body.email, code).catch((err) =>
      req.log.warn({ err }, 'failed to send login code email'),
    );
    return reply.send({ ok: true });
  });

  // ─── POST /login/email/verify ─────────────────────────────
  app.post('/login/email/verify', async (req, reply) => {
    const schema = z.object({ pending2faToken: z.string(), code: z.string().length(6) });
    const body = schema.parse(req.body);
    const pending = verifyPending(body.pending2faToken);
    if (!pending) return reply.unauthorized('sesión de 2FA expirada, vuelve a iniciar sesión');

    const u = await db.query(
      `SELECT login_otp_hash, login_otp_expires, login_otp_attempts FROM users WHERE id = $1`,
      [pending.userId],
    );
    if (u.rowCount === 0 || !u.rows[0].login_otp_hash) {
      return reply.badRequest('no hay código pendiente');
    }
    const row = u.rows[0];
    if (row.login_otp_attempts >= 5) {
      await db.query(`UPDATE users SET login_otp_hash = NULL WHERE id = $1`, [pending.userId]);
      return reply.unauthorized('demasiados intentos, pide un código nuevo');
    }
    if (new Date(row.login_otp_expires) < new Date()) {
      return reply.unauthorized('código expirado');
    }

    const codeHash = createHash('blake2b512').update(body.code).digest().subarray(0, 32);
    if (!timingSafeEqual(codeHash, row.login_otp_hash)) {
      await db.query(
        `UPDATE users SET login_otp_attempts = login_otp_attempts + 1 WHERE id = $1`,
        [pending.userId],
      );
      return reply.unauthorized('código incorrecto');
    }

    await db.query(
      `UPDATE users SET login_otp_hash = NULL, login_otp_expires = NULL, login_otp_attempts = 0
       WHERE id = $1`,
      [pending.userId],
    );
    const payload = await issueSession(req, reply, pending.userId, pending.deviceId);
    return reply.send(payload);
  });

  // ═══════════════════════════════════════════════════════════
  // Gestión de 2FA por email (activar / desactivar / estado)
  // ═══════════════════════════════════════════════════════════

  // ─── GET /email/status ────────────────────────────────────
  app.get('/email/status', { onRequest: [app.authenticate] }, async (req, reply) => {
    const r = await db.query(
      `SELECT u.email_verified, u.two_factor_email_enabled,
              EXISTS(
                SELECT 1 FROM webauthn_credentials w
                 WHERE w.user_id = u.id AND w.revoked_at IS NULL
              ) AS has_passkey
       FROM users u WHERE u.id = $1`,
      [req.user.sub],
    );
    if (r.rowCount === 0) return reply.notFound();
    const u = r.rows[0];
    return reply.send({
      emailVerified: u.email_verified,
      emailOtpEnabled: u.two_factor_email_enabled,
      hasPasskey: u.has_passkey,
    });
  });

  // ─── POST /email/enable ───────────────────────────────────
  app.post('/email/enable', { onRequest: [app.authenticate] }, async (req, reply) => {
    const r = await db.query(`SELECT email_verified FROM users WHERE id = $1`, [req.user.sub]);
    if (r.rowCount === 0) return reply.notFound();
    if (!r.rows[0].email_verified) {
      return reply.badRequest('verifica tu email antes de activar el 2FA por email');
    }
    await db.query(`UPDATE users SET two_factor_email_enabled = TRUE WHERE id = $1`, [req.user.sub]);
    return reply.send({ ok: true });
  });

  // ─── POST /email/disable ──────────────────────────────────
  app.post('/email/disable', { onRequest: [app.authenticate] }, async (req, reply) => {
    await db.query(
      `UPDATE users SET two_factor_email_enabled = FALSE, login_otp_hash = NULL WHERE id = $1`,
      [req.user.sub],
    );
    return reply.send({ ok: true });
  });

  // ═══════════════════════════════════════════════════════════
  // Step-up para operaciones sensibles (formatear/borrar discos)
  // Re-autenticación: el cliente firma un challenge con su identity key
  // (que solo posee si tiene la MK). Prueba presencia + posesión reciente,
  // y protege contra una sesión secuestrada haciendo daño irreversible.
  // ═══════════════════════════════════════════════════════════

  // ─── POST /step-up/begin ──────────────────────────────────
  app.post('/step-up/begin', { onRequest: [app.authenticate] }, async (req, reply) => {
    const challenge = randomBytes(32);
    const expires = new Date(Date.now() + 5 * 60 * 1000);
    await db.query(
      `INSERT INTO webauthn_challenges (user_id, challenge, purpose, expires_at)
       VALUES ($1,$2,'step-up',$3)`,
      [req.user.sub, challenge, expires],
    );
    return reply.send({ challenge: toB64(challenge) });
  });

  // ─── POST /step-up/finish ─────────────────────────────────
  app.post('/step-up/finish', { onRequest: [app.authenticate] }, async (req, reply) => {
    const schema = z.object({ challenge: bytesB64, signature: bytesB64 });
    const body = schema.parse(req.body);

    // Consume el challenge exacto (un solo uso, anti-replay).
    const ch = await db.query(
      `DELETE FROM webauthn_challenges
        WHERE user_id = $1 AND purpose = 'step-up' AND challenge = $2 AND expires_at > now()
        RETURNING id`,
      [req.user.sub, fromB64(body.challenge)],
    );
    if (ch.rowCount === 0) return reply.unauthorized('challenge de step-up inválido o expirado');

    const u = await db.query('SELECT identity_public_key FROM users WHERE id = $1', [req.user.sub]);
    if (u.rowCount === 0) return reply.notFound();

    const ok = sodium.crypto_sign_verify_detached(
      fromB64(body.signature),
      fromB64(body.challenge),
      u.rows[0].identity_public_key,
    );
    if (!ok) return reply.unauthorized('firma de step-up inválida');

    const stepUpToken = await reply.jwtSign(
      { sub: req.user.sub, deviceId: req.user.deviceId ?? null, scope: 'step-up' },
      { expiresIn: '5m' },
    );
    return reply.send({ stepUpToken });
  });

  // ═══════════════════════════════════════════════════════════
  // Recuperación con frase mnemónica (Recovery v2)
  //
  // De la mnemónica se derivan DOS pares:
  //   · Ed25519 (sign): firma el challenge → prueba la identidad.
  //   · X25519 (box):   su pública vive en users.recovery_box_public_key;
  //     el cliente sella con ella las vault keys y sk_exchange en cualquier
  //     momento (crypto_box_seal no necesita la privada para sellar).
  //
  // Flujo: init (challenge) → unlock (firma → devuelve seals) → el cliente
  // abre los seals con la privada derivada de la mnemónica, re-wrappea con
  // la nueva MK → finalize (nuevas claves + vault keys re-wrapped).
  // Cuentas pre-v2 (sin box key): finalize sin vaults — la cuenta vuelve
  // pero los archivos quedan con la MK vieja (el frontend lo avisa).
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

  // Verifica firma de recovery + token vigente. Compartido por unlock y
  // finalize (la misma firma vale para ambos; el token solo se consume
  // en finalize). Devuelve la fila del usuario y el id del token, o null
  // si algo no cuadra (la respuesta ya se habrá enviado).
  async function verifyRecoveryProof(
    reply: any,
    emailHash: string,
    challenge: string,
    signature: string,
  ): Promise<{ user: any; tokenId: string } | null> {
    const u = await db.query(
      `SELECT id, recovery_public_key, recovery_enabled, recovery_box_public_key,
              exchange_public_key, exchange_private_key_sealed_recovery
       FROM users WHERE email_hash = $1`,
      [fromB64(emailHash)],
    );
    if (u.rowCount === 0) { reply.unauthorized(); return null; }
    if (!u.rows[0].recovery_enabled || !u.rows[0].recovery_public_key) {
      reply.unauthorized('recovery not enabled'); return null;
    }

    const ok = sodium.crypto_sign_verify_detached(
      fromB64(signature), fromB64(challenge), u.rows[0].recovery_public_key,
    );
    if (!ok) { reply.unauthorized('invalid recovery signature'); return null; }

    const tokenHash = createHash('blake2b512').update(fromB64(challenge)).digest().subarray(0, 32);
    const t = await db.query(
      `SELECT id FROM password_reset_tokens
       WHERE user_id = $1 AND token_hash = $2 AND used_at IS NULL AND expires_at > now()`,
      [u.rows[0].id, tokenHash],
    );
    if (t.rowCount === 0) { reply.unauthorized('expired or used recovery token'); return null; }

    return { user: u.rows[0], tokenId: t.rows[0].id };
  }

  // POST /recovery/unlock: tras probar la mnemónica (firma del challenge),
  // devuelve el material sellado a la recovery box key. Todo es ciphertext
  // que solo la privada derivada de la mnemónica puede abrir — no filtra
  // nada a quien solo tenga el challenge. No consume el token (lo hace
  // finalize), así el cliente puede abrir, re-wrappear y finalizar en
  // una sola pasada de UI.
  app.post('/recovery/unlock', async (req, reply) => {
    const schema = z.object({ emailHash: bytesB64, challenge: bytesB64, signature: bytesB64 });
    const body = schema.parse(req.body);

    const proof = await verifyRecoveryProof(reply, body.emailHash, body.challenge, body.signature);
    if (!proof) return;
    const row = proof.user;

    const vaults = await db.query(
      `SELECT id, vault_key_sealed_recovery FROM vaults
       WHERE owner_id = $1 AND vault_key_sealed_recovery IS NOT NULL`,
      [row.id],
    );

    return reply.send({
      recoveryBoxPublicKey: row.recovery_box_public_key ? toB64(row.recovery_box_public_key) : null,
      exchangePublicKey: toB64(row.exchange_public_key),
      exchangePrivateKeySealedRecovery: row.exchange_private_key_sealed_recovery
        ? toB64(row.exchange_private_key_sealed_recovery) : null,
      vaults: vaults.rows.map((v) => ({
        id: v.id,
        vaultKeySealedRecovery: toB64(v.vault_key_sealed_recovery),
      })),
    });
  });

  // POST /recovery/finalize: el cliente prueba la frase mnemónica firmando
  // con la recovery key. Luego envía nuevas keys wrapped con nueva MK.
  // Recovery v2: además re-wrappea cada vault_key (abierta del seal en
  // /unlock) con la nueva MK, y puede conservar el par exchange enviando
  // la MISMA pública con la privada re-wrapped (preserva shares recibidos).
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
      // Recovery v2: vault keys re-wrapped con la nueva MK (mismo vault_key,
      // nuevo wrap). Los seals de recuperación NO cambian: la mnemónica es la misma.
      vaults: z.array(z.object({
        id: z.string().uuid(),
        vaultKeyWrapped: bytesB64,
        vaultKeyNonce: bytesB64,
      })).max(200).optional(),
    });
    const body = schema.parse(req.body);

    const proof = await verifyRecoveryProof(reply, body.emailHash, body.challenge, body.signature);
    if (!proof) return;

    try {
      await tx(async (client) => {
        await client.query(
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
            proof.user.id,
          ],
        );

        for (const v of body.vaults ?? []) {
          const r = await client.query(
            `UPDATE vaults SET vault_key_wrapped = $1, vault_key_nonce = $2
             WHERE id = $3 AND owner_id = $4`,
            [fromB64(v.vaultKeyWrapped), fromB64(v.vaultKeyNonce), v.id, proof.user.id],
          );
          if (r.rowCount === 0) throw new Error('vault-not-owned');
        }
      });
    } catch (e: any) {
      if (e?.message === 'vault-not-owned') return reply.badRequest('vault does not belong to user');
      throw e;
    }

    await db.query(`UPDATE password_reset_tokens SET used_at = now() WHERE id = $1`, [proof.tokenId]);
    await db.query(`UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`, [proof.user.id]);

    return reply.send({ ok: true });
  });

  // ─── GET /recovery/status ─────────────────────────────────────
  // Estado del kit de recuperación del usuario autenticado. El frontend
  // lo usa en Ajustes (mostrar si falta el upgrade a v2) y al crear o
  // importar vaults (obtener la box key para sellar la nueva vault key).
  app.get('/recovery/status', { onRequest: [app.authenticate] }, async (req, reply) => {
    const u = await db.query(
      `SELECT recovery_enabled, recovery_public_key, recovery_box_public_key,
              exchange_private_key_sealed_recovery
       FROM users WHERE id = $1`,
      [req.user.sub],
    );
    if (u.rowCount === 0) return reply.notFound();
    const row = u.rows[0];

    const v = await db.query(
      `SELECT count(*)::int AS total, count(vault_key_sealed_recovery)::int AS sealed
       FROM vaults WHERE owner_id = $1`,
      [req.user.sub],
    );

    return reply.send({
      recoveryEnabled: row.recovery_enabled,
      recoveryPublicKey: row.recovery_public_key ? toB64(row.recovery_public_key) : null,
      recoveryBoxPublicKey: row.recovery_box_public_key ? toB64(row.recovery_box_public_key) : null,
      exchangeSealed: !!row.exchange_private_key_sealed_recovery,
      vaultsTotal: v.rows[0].total,
      vaultsSealed: v.rows[0].sealed,
    });
  });

  // ─── POST /recovery/upgrade ───────────────────────────────────
  // Sube (o regenera) el kit de recuperación v2 de una cuenta existente:
  // la box pública + sk_exchange sellada + vault keys selladas. Con
  // recoveryPublicKey además rota la frase (mnemónica nueva). Exige
  // step-up: cambiar el kit de recuperación equivale a poder tomar la
  // cuenta más adelante — una sesión secuestrada no debe poder hacerlo.
  app.post('/recovery/upgrade', { onRequest: [app.authenticate] }, async (req, reply) => {
    const stepUp = req.headers['x-step-up-token'];
    if (typeof stepUp !== 'string') {
      return reply.code(401).send({ error: 'step-up-required', message: 'se requiere re-autenticación' });
    }
    try {
      const d = app.jwt.verify(stepUp) as { sub: string; scope?: string };
      if (d.scope !== 'step-up' || d.sub !== req.user.sub) {
        return reply.code(401).send({ error: 'step-up-required', message: 'token de step-up inválido' });
      }
    } catch {
      return reply.code(401).send({ error: 'step-up-required', message: 'token de step-up expirado' });
    }

    const schema = z.object({
      recoveryPublicKey: bytesB64.optional(), // solo al regenerar la mnemónica
      recoveryBoxPublicKey: bytesB64,
      exchangePrivateKeySealedRecovery: bytesB64,
      vaults: z.array(z.object({
        id: z.string().uuid(),
        vaultKeySealedRecovery: bytesB64,
      })).max(200),
    });
    const body = schema.parse(req.body);

    try {
      await tx(async (client) => {
        await client.query(
          `UPDATE users SET
             recovery_public_key = COALESCE($1, recovery_public_key),
             recovery_enabled = TRUE,
             recovery_box_public_key = $2,
             exchange_private_key_sealed_recovery = $3
           WHERE id = $4`,
          [
            body.recoveryPublicKey ? fromB64(body.recoveryPublicKey) : null,
            fromB64(body.recoveryBoxPublicKey),
            fromB64(body.exchangePrivateKeySealedRecovery),
            req.user.sub,
          ],
        );

        for (const v of body.vaults) {
          const r = await client.query(
            `UPDATE vaults SET vault_key_sealed_recovery = $1
             WHERE id = $2 AND owner_id = $3`,
            [fromB64(v.vaultKeySealedRecovery), v.id, req.user.sub],
          );
          if (r.rowCount === 0) throw new Error('vault-not-owned');
        }
      });
    } catch (e: any) {
      if (e?.message === 'vault-not-owned') return reply.badRequest('vault does not belong to user');
      throw e;
    }

    return reply.send({ ok: true });
  });
};

export default twoFactorRoutes;
