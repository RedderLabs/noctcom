import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { db, tx } from '../db/pool.js';
import { sendVerificationEmail } from '../mail.js';
import { deleteBlob } from '../storage/s3.js';
import { deleteFromDisk } from '../storage/disk.js';
import { issueSession, hashIp, newRefreshToken } from '../session.js';

// ─────────────────────────────────────────────────────────────────
// Schemas
// ─────────────────────────────────────────────────────────────────
const bytesB64 = z.string().regex(/^[A-Za-z0-9_-]+$/, 'base64url required');

// Exact-size validators for crypto fields (base64url encoded)
const b64Exactly = (rawBytes: number) =>
  bytesB64.min(1).max(Math.ceil(rawBytes * 4 / 3) + 4);
const pubKey32 = b64Exactly(32);
const nonce24 = b64Exactly(24);
const wrappedKey = b64Exactly(32 + 16); // X25519 private: 32 key + 16 MAC
const wrappedSignKey = b64Exactly(64 + 16); // Ed25519 private: 64 key + 16 MAC
const sealedKey32 = b64Exactly(32 + 48); // crypto_box_seal de 32 bytes: +32 pk efímera +16 MAC

const signupSchema = z.object({
  username: z.string().min(3).max(64).regex(/^[a-zA-Z0-9_.-]+$/),
  email: z.string().email().max(254).optional(),
  emailHash: b64Exactly(32),
  kdfSalt: b64Exactly(16),
  kdfOpsLimit: z.number().int().min(2).max(10),
  kdfMemLimit: z.number().int().min(67108864).max(1073741824),

  opaqueRecord: b64Exactly(64),

  identityPublicKey: pubKey32,
  identityPrivateKeyWrapped: wrappedSignKey,
  identityPrivateKeyNonce: nonce24,

  exchangePublicKey: pubKey32,
  exchangePrivateKeyWrapped: wrappedKey,
  exchangePrivateKeyNonce: nonce24,

  initialVault: z.object({
    nameEncrypted: bytesB64.max(512),
    nameNonce: nonce24,
    vaultKeyWrapped: wrappedKey,
    vaultKeyNonce: nonce24,
    vaultKeySealedRecovery: sealedKey32.optional(), // Recovery v2
  }),

  recoveryPublicKey: pubKey32.optional(),
  // Recovery v2: X25519 pública derivada de la mnemónica + sk_exchange sellada a ella
  recoveryBoxPublicKey: pubKey32.optional(),
  exchangePrivateKeySealedRecovery: sealedKey32.optional(),

  deviceNameEncrypted: bytesB64.max(512),
  deviceNameNonce: nonce24,
  devicePublicKey: pubKey32,
});

const loginInitSchema = z.object({
  emailHash: bytesB64,
});

const loginFinalizeSchema = z.object({
  emailHash: bytesB64,
  // En un OPAQUE real iría el último mensaje del protocolo. Aquí mostramos un placeholder
  // simplificado: el cliente prueba conocer la MK firmando un challenge con identity_private_key.
  challenge: bytesB64,
  signature: bytesB64,
  deviceId: z.string().uuid().optional(),
});

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────
const fromB64 = (s: string) => Buffer.from(s, 'base64url');
const toB64 = (b: Buffer | Uint8Array) => Buffer.from(b).toString('base64url');
// hashIp y newRefreshToken viven en ../session.js (compartidos con issueSession).

// ─────────────────────────────────────────────────────────────────
const authRoutes: FastifyPluginAsync = async (app) => {

  // ─── POST /signup ─────────────────────────────────────────
  app.post('/signup', {
    config: {
      rateLimit: { max: 5, timeWindow: '1 minute' },
    },
  }, async (req, reply) => {
    const body = signupSchema.parse(req.body);

    const existing = await db.query(
      'SELECT 1 FROM users WHERE email_hash = $1 OR username = $2 LIMIT 1',
      [fromB64(body.emailHash), body.username],
    );
    // Artificial delay to prevent timing-based user enumeration
    await new Promise((r) => setTimeout(r, 80 + Math.random() * 120));
    if (existing.rowCount && existing.rowCount > 0) {
      return reply.conflict('username or email already registered');
    }

    const result = await tx(async (client) => {
      const countResult = await client.query('SELECT count(*)::int AS n FROM users');
      const isFirstUser = countResult.rows[0].n === 0;

      const u = await client.query(
        `INSERT INTO users (
          username, email_hash, kdf_salt, kdf_ops_limit, kdf_mem_limit,
          opaque_record,
          identity_public_key, identity_private_key_wrapped, identity_private_key_nonce,
          exchange_public_key, exchange_private_key_wrapped, exchange_private_key_nonce,
          recovery_public_key, recovery_enabled, is_admin,
          recovery_box_public_key, exchange_private_key_sealed_recovery
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
         RETURNING id`,
        [
          body.username,
          fromB64(body.emailHash),
          fromB64(body.kdfSalt),
          body.kdfOpsLimit,
          body.kdfMemLimit,
          fromB64(body.opaqueRecord),
          fromB64(body.identityPublicKey),
          fromB64(body.identityPrivateKeyWrapped),
          fromB64(body.identityPrivateKeyNonce),
          fromB64(body.exchangePublicKey),
          fromB64(body.exchangePrivateKeyWrapped),
          fromB64(body.exchangePrivateKeyNonce),
          body.recoveryPublicKey ? fromB64(body.recoveryPublicKey) : null,
          !!body.recoveryPublicKey,
          isFirstUser,
          body.recoveryBoxPublicKey ? fromB64(body.recoveryBoxPublicKey) : null,
          body.exchangePrivateKeySealedRecovery ? fromB64(body.exchangePrivateKeySealedRecovery) : null,
        ],
      );
      const userId = u.rows[0].id as string;

      const d = await client.query(
        `INSERT INTO devices (user_id, device_name_encrypted, device_name_nonce, device_public_key)
         VALUES ($1,$2,$3,$4) RETURNING id`,
        [
          userId,
          fromB64(body.deviceNameEncrypted),
          fromB64(body.deviceNameNonce),
          fromB64(body.devicePublicKey),
        ],
      );
      const deviceId = d.rows[0].id as string;

      const v = await client.query(
        `INSERT INTO vaults (owner_id, name_encrypted, name_nonce, vault_key_wrapped, vault_key_nonce,
                             vault_key_sealed_recovery)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
        [
          userId,
          fromB64(body.initialVault.nameEncrypted),
          fromB64(body.initialVault.nameNonce),
          fromB64(body.initialVault.vaultKeyWrapped),
          fromB64(body.initialVault.vaultKeyNonce),
          body.initialVault.vaultKeySealedRecovery
            ? fromB64(body.initialVault.vaultKeySealedRecovery) : null,
        ],
      );

      return { userId, deviceId, vaultId: v.rows[0].id as string };
    });

    const accessToken = await reply.jwtSign(
      { sub: result.userId, deviceId: result.deviceId },
      { expiresIn: '7d' },
    );

    const { plain, hash } = newRefreshToken();
    const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await db.query(
      `INSERT INTO sessions (user_id, device_id, refresh_token_hash, ip_address_hash, expires_at)
       VALUES ($1,$2,$3,$4,$5)`,
      [result.userId, result.deviceId, hash, hashIp(req.ip), expires],
    );

    // Send verification email (fire-and-forget, don't block signup)
    if (body.email) {
      const code = String(Math.floor(100000 + Math.random() * 900000));
      const codeHash = createHash('blake2b512').update(code).digest().subarray(0, 32);
      const expires = new Date(Date.now() + 30 * 60 * 1000);
      await db.query(
        `UPDATE users SET verification_code_hash = $1, verification_code_expires = $2 WHERE id = $3`,
        [codeHash, expires, result.userId],
      );
      sendVerificationEmail(body.email, code).catch((err) => {
        app.log.warn({ err }, 'failed to send verification email');
      });
    }

    return reply.code(201).send({
      userId: result.userId,
      deviceId: result.deviceId,
      vaultId: result.vaultId,
      accessToken,
      refreshToken: plain,
    });
  });

  // ─── POST /login/init ─────────────────────────────────────
  app.post('/login/init', {
    config: {
      rateLimit: { max: 10, timeWindow: '1 minute' },
    },
  }, async (req, reply) => {
    const body = loginInitSchema.parse(req.body);

    const r = await db.query(
      `SELECT id, kdf_salt, kdf_ops_limit, kdf_mem_limit, kdf_algorithm,
              opaque_record, exchange_public_key
       FROM users WHERE email_hash = $1`,
      [fromB64(body.emailHash)],
    );

    // Constant-time response shape: respondemos lo mismo aunque no exista,
    // con valores deterministas derivados del email_hash para evitar enumeración.
    if (r.rowCount === 0) {
      const fakeSalt = createHash('blake2b512')
        .update('cryptvault-fake-salt')
        .update(fromB64(body.emailHash))
        .digest()
        .subarray(0, 16);
      return reply.send({
        kdfSalt: toB64(fakeSalt),
        kdfOpsLimit: 3,
        kdfMemLimit: 67108864,
        kdfAlgorithm: 'argon2id',
        challenge: toB64(randomBytes(32)),
        // No enviamos opaqueRecord ni pubkey en caso fake — el login simplemente falla en finalize
      });
    }

    const row = r.rows[0];
    const challenge = randomBytes(32);

    // Guarda el challenge en Redis con TTL corto (60s)
    // (omitido: ver redis.ts; producción debe vincularlo a IP/user)

    return reply.send({
      kdfSalt: toB64(row.kdf_salt),
      kdfOpsLimit: row.kdf_ops_limit,
      kdfMemLimit: row.kdf_mem_limit,
      kdfAlgorithm: row.kdf_algorithm,
      challenge: toB64(challenge),
      // El opaque envelope contiene info que SOLO sirve con la contraseña real
      opaqueRecord: toB64(row.opaque_record),
    });
  });

  // ─── POST /login/finalize ─────────────────────────────────
  app.post('/login/finalize', {
    config: {
      rateLimit: { max: 10, timeWindow: '1 minute' },
    },
  }, async (req, reply) => {
    const body = loginFinalizeSchema.parse(req.body);

    const r = await db.query(
      `SELECT u.id, u.identity_public_key,
              u.identity_private_key_wrapped, u.identity_private_key_nonce,
              u.exchange_private_key_wrapped, u.exchange_private_key_nonce,
              u.exchange_public_key
       FROM users u WHERE u.email_hash = $1`,
      [fromB64(body.emailHash)],
    );
    if (r.rowCount === 0) return reply.unauthorized('invalid credentials');

    const row = r.rows[0];

    // Verifica la firma del challenge con la identity_public_key.
    // Para producción real, usa OPAQUE completo (libsodium-opaque, opaque-ts).
    // Aquí mostramos la primitiva equivalente.
    const sodium = await import('libsodium-wrappers-sumo').then(m => m.default);
    await sodium.ready;
    const ok = sodium.crypto_sign_verify_detached(
      fromB64(body.signature),
      fromB64(body.challenge),
      row.identity_public_key,
    );
    if (!ok) return reply.unauthorized('invalid credentials');

    // ─── Gating de 2FA ──────────────────────────────────────
    // La contraseña ya se verificó. Si el usuario tiene un segundo factor
    // (passkey registrada o email-OTP activado) NO emitimos sesión todavía:
    // devolvemos un pending2faToken que prueba "el paso de contraseña pasó" y
    // que el cliente canjea al completar el 2º factor. Esto no rompe ZK: las
    // claves wrapped solo se entregan junto con la sesión, tras el 2FA.
    const tfa = await db.query(
      `SELECT u.two_factor_email_enabled,
              EXISTS(
                SELECT 1 FROM webauthn_credentials w
                 WHERE w.user_id = u.id AND w.revoked_at IS NULL
              ) AS has_passkey
       FROM users u WHERE u.id = $1`,
      [row.id],
    );
    const methods: string[] = [];
    if (tfa.rows[0]?.has_passkey) methods.push('passkey');
    if (tfa.rows[0]?.two_factor_email_enabled) methods.push('email');

    if (methods.length > 0) {
      const pending2faToken = await reply.jwtSign(
        { sub: row.id, deviceId: body.deviceId ?? null, scope: 'pending-2fa' },
        { expiresIn: '5m' },
      );
      return reply.send({ requires2FA: true, methods, pending2faToken });
    }

    const payload = await issueSession(req, reply, row.id, body.deviceId ?? null);
    return reply.send(payload);
  });

  // ─── POST /refresh ────────────────────────────────────────
  app.post('/refresh', {
    config: {
      rateLimit: { max: 20, timeWindow: '1 minute' },
    },
  }, async (req, reply) => {
    const schema = z.object({ refreshToken: z.string() });
    const { refreshToken } = schema.parse(req.body);

    const tokenHash = createHash('blake2b512').update(refreshToken).digest().subarray(0, 32);
    const r = await db.query(
      `SELECT user_id, device_id, expires_at, revoked_at
       FROM sessions WHERE refresh_token_hash = $1`,
      [tokenHash],
    );
    if (r.rowCount === 0) return reply.unauthorized('invalid refresh token');
    const s = r.rows[0];
    if (s.revoked_at || new Date(s.expires_at) < new Date()) {
      return reply.unauthorized('refresh token expired or revoked');
    }

    const accessToken = await reply.jwtSign(
      { sub: s.user_id, deviceId: s.device_id },
      { expiresIn: '7d' },
    );
    return reply.send({ accessToken });
  });

  // ─── POST /logout ─────────────────────────────────────────
  app.post('/logout', { onRequest: [app.authenticate] }, async (req, reply) => {
    await db.query(
      `UPDATE sessions SET revoked_at = now()
       WHERE user_id = $1 AND device_id = $2 AND revoked_at IS NULL`,
      [req.user.sub, req.user.deviceId],
    );
    return reply.send({ ok: true });
  });

  // ─── GET /me ──────────────────────────────────────────────
  app.get('/me', { onRequest: [app.authenticate] }, async (req, reply) => {
    const r = await db.query(
      `SELECT u.id, u.username, u.storage_quota_bytes, u.storage_used_bytes,
              u.identity_public_key, u.exchange_public_key, u.is_admin,
              COALESCE((
                SELECT SUM(total_bytes) FROM storage_volumes
                 WHERE active = true AND (user_id = u.id OR user_id IS NULL)
              ), 0) AS disk_bytes
       FROM users u WHERE u.id = $1`,
      [req.user.sub],
    );
    if (r.rowCount === 0) return reply.notFound();
    const u = r.rows[0];
    // La cuota efectiva = cuota base + capacidad de los discos en uso del usuario
    // (suya o self-host). Así el "Almacenamiento" refleja el espacio real total.
    const quota = Number(u.storage_quota_bytes) + Number(u.disk_bytes);
    return reply.send({
      id: u.id,
      username: u.username,
      isAdmin: u.is_admin,
      storageQuotaBytes: quota,
      storageUsedBytes: Number(u.storage_used_bytes),
      identityPublicKey: toB64(u.identity_public_key),
      exchangePublicKey: toB64(u.exchange_public_key),
    });
  });

  // ─── POST /verify ─ verificar email con código ────────────
  app.post('/verify', { onRequest: [app.authenticate] }, async (req, reply) => {
    const schema = z.object({ code: z.string().length(6) });
    const { code } = schema.parse(req.body);
    const userId = req.user.sub;

    const r = await db.query(
      `SELECT verification_code_hash, verification_code_expires, email_verified
       FROM users WHERE id = $1`,
      [userId],
    );
    if (r.rowCount === 0) return reply.notFound();
    const row = r.rows[0];

    if (row.email_verified) return reply.send({ ok: true, alreadyVerified: true });
    if (!row.verification_code_hash) return reply.badRequest('no verification pending');
    if (new Date(row.verification_code_expires) < new Date()) {
      return reply.badRequest('verification code expired');
    }

    const codeHash = createHash('blake2b512').update(code).digest().subarray(0, 32);
    if (!timingSafeEqual(codeHash, row.verification_code_hash)) {
      return reply.unauthorized('invalid code');
    }

    await db.query(
      `UPDATE users SET email_verified = TRUE, verification_code_hash = NULL, verification_code_expires = NULL WHERE id = $1`,
      [userId],
    );

    return reply.send({ ok: true });
  });

  // ─── POST /resend-verification ─ reenviar código ──────────
  app.post('/resend-verification', { onRequest: [app.authenticate] }, async (req, reply) => {
    const schema = z.object({ email: z.string().email() });
    const { email } = schema.parse(req.body);
    const userId = req.user.sub;

    const r = await db.query(
      `SELECT email_verified FROM users WHERE id = $1`,
      [userId],
    );
    if (r.rowCount === 0) return reply.notFound();
    if (r.rows[0].email_verified) return reply.send({ ok: true, alreadyVerified: true });

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const codeHash = createHash('blake2b512').update(code).digest().subarray(0, 32);
    const expires = new Date(Date.now() + 30 * 60 * 1000);
    await db.query(
      `UPDATE users SET verification_code_hash = $1, verification_code_expires = $2 WHERE id = $3`,
      [codeHash, expires, userId],
    );
    await sendVerificationEmail(email, code);
    return reply.send({ ok: true });
  });

  // ─── GET /users/lookup/:username ─ búsqueda para compartir ─
  app.get<{ Params: { username: string } }>(
    '/users/lookup/:username',
    { onRequest: [app.authenticate] },
    async (req, reply) => {
      const r = await db.query(
        `SELECT id, username, exchange_public_key, identity_public_key
         FROM users WHERE username = $1`,
        [req.params.username],
      );
      if (r.rowCount === 0) return reply.notFound();
      const u = r.rows[0];
      return reply.send({
        id: u.id,
        username: u.username,
        exchangePublicKey: toB64(u.exchange_public_key),
        identityPublicKey: toB64(u.identity_public_key),
      });
    },
  );

  // ─── DELETE /me ─ eliminar la cuenta y todo su contenido ──────────
  // Borra los blobs del almacenamiento; el resto (vaults, nodes, versions,
  // chunks, devices, sessions, shares…) cae en cascada al borrar el usuario.
  app.delete('/me', { onRequest: [app.authenticate] }, async (req, reply) => {
    const userId = req.user.sub;

    const chunks = await db.query(
      `SELECT c.s3_key, c.storage_type, c.volume_id
       FROM chunks c
       JOIN file_versions fv ON fv.id = c.version_id
       JOIN nodes n ON n.id = fv.node_id
       JOIN vaults v ON v.id = n.vault_id
       WHERE v.owner_id = $1`,
      [userId],
    );
    for (const c of chunks.rows) {
      try {
        if (c.storage_type === 'disk' && c.volume_id) {
          const vol = await db.query(`SELECT path FROM storage_volumes WHERE id = $1`, [c.volume_id]);
          if (vol.rows[0]) await deleteFromDisk(vol.rows[0].path, c.s3_key);
        } else {
          await deleteBlob(c.s3_key);
        }
      } catch { /* ignore cleanup errors */ }
    }

    await db.query(`DELETE FROM users WHERE id = $1`, [userId]);
    return reply.send({ ok: true });
  });
};

export default authRoutes;
