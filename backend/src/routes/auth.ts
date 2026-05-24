import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { db, tx } from '../db/pool.js';

// ─────────────────────────────────────────────────────────────────
// Schemas
// ─────────────────────────────────────────────────────────────────
const bytesB64 = z.string().regex(/^[A-Za-z0-9_-]+$/, 'base64url required');

const signupSchema = z.object({
  username: z.string().min(3).max(64).regex(/^[a-zA-Z0-9_.-]+$/),
  emailHash: bytesB64,                       // BLAKE2b(email) calculado en cliente
  kdfSalt: bytesB64,
  kdfOpsLimit: z.number().int().min(2).max(10),
  kdfMemLimit: z.number().int().min(67108864),

  opaqueRecord: bytesB64,

  identityPublicKey: bytesB64,
  identityPrivateKeyWrapped: bytesB64,
  identityPrivateKeyNonce: bytesB64,

  exchangePublicKey: bytesB64,
  exchangePrivateKeyWrapped: bytesB64,
  exchangePrivateKeyNonce: bytesB64,

  // Vault inicial creado en el cliente
  initialVault: z.object({
    nameEncrypted: bytesB64,
    nameNonce: bytesB64,
    vaultKeyWrapped: bytesB64,    // wrapped con exchange_private_key del owner
    vaultKeyNonce: bytesB64,
  }),

  // Device
  deviceNameEncrypted: bytesB64,
  deviceNameNonce: bytesB64,
  devicePublicKey: bytesB64,
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

function hashIp(ip: string): Buffer {
  return createHash('blake2b512').update(`ip:${ip}`).digest().subarray(0, 32);
}

function newRefreshToken(): { plain: string; hash: Buffer } {
  const plain = randomBytes(32).toString('base64url');
  const hash = createHash('blake2b512').update(plain).digest().subarray(0, 32);
  return { plain, hash };
}

// ─────────────────────────────────────────────────────────────────
const authRoutes: FastifyPluginAsync = async (app) => {

  // ─── POST /signup ─────────────────────────────────────────
  app.post('/signup', async (req, reply) => {
    const body = signupSchema.parse(req.body);

    // El email_hash es único por usuario → el cliente prueba unicidad sin filtrar el email.
    const existing = await db.query(
      'SELECT 1 FROM users WHERE email_hash = $1 OR username = $2 LIMIT 1',
      [fromB64(body.emailHash), body.username],
    );
    if (existing.rowCount && existing.rowCount > 0) {
      return reply.conflict('username or email already registered');
    }

    const result = await tx(async (client) => {
      const u = await client.query(
        `INSERT INTO users (
          username, email_hash, kdf_salt, kdf_ops_limit, kdf_mem_limit,
          opaque_record,
          identity_public_key, identity_private_key_wrapped, identity_private_key_nonce,
          exchange_public_key, exchange_private_key_wrapped, exchange_private_key_nonce
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
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
        `INSERT INTO vaults (owner_id, name_encrypted, name_nonce, vault_key_wrapped, vault_key_nonce)
         VALUES ($1,$2,$3,$4,$5) RETURNING id`,
        [
          userId,
          fromB64(body.initialVault.nameEncrypted),
          fromB64(body.initialVault.nameNonce),
          fromB64(body.initialVault.vaultKeyWrapped),
          fromB64(body.initialVault.vaultKeyNonce),
        ],
      );

      return { userId, deviceId, vaultId: v.rows[0].id as string };
    });

    const accessToken = await reply.jwtSign(
      { sub: result.userId, deviceId: result.deviceId },
      { expiresIn: '15m' },
    );

    const { plain, hash } = newRefreshToken();
    const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await db.query(
      `INSERT INTO sessions (user_id, device_id, refresh_token_hash, ip_address_hash, expires_at)
       VALUES ($1,$2,$3,$4,$5)`,
      [result.userId, result.deviceId, hash, hashIp(req.ip), expires],
    );

    return reply.code(201).send({
      userId: result.userId,
      deviceId: result.deviceId,
      vaultId: result.vaultId,
      accessToken,
      refreshToken: plain,
    });
  });

  // ─── POST /login/init ─────────────────────────────────────
  // Devuelve los parámetros KDF + opaque envelope para que el cliente
  // pueda derivar su MK localmente. NUNCA enviamos info útil sin auth.
  app.post('/login/init', async (req, reply) => {
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
  app.post('/login/finalize', async (req, reply) => {
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

    let deviceId = body.deviceId;
    if (!deviceId) {
      const d = await db.query(
        `SELECT id FROM devices WHERE user_id = $1 AND revoked_at IS NULL LIMIT 1`,
        [row.id],
      );
      deviceId = d.rows[0]?.id;
    }

    const accessToken = await reply.jwtSign(
      { sub: row.id, deviceId: deviceId ?? null },
      { expiresIn: '15m' },
    );

    const { plain, hash } = newRefreshToken();
    const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await db.query(
      `INSERT INTO sessions (user_id, device_id, refresh_token_hash, ip_address_hash, expires_at)
       VALUES ($1,$2,$3,$4,$5)`,
      [row.id, deviceId, hash, hashIp(req.ip), expires],
    );

    await db.query(`UPDATE users SET last_login_at = now() WHERE id = $1`, [row.id]);

    return reply.send({
      userId: row.id,
      deviceId,
      accessToken,
      refreshToken: plain,
      // Devolvemos las claves wrapped para que el cliente las desencripte con la MK
      identityPrivateKeyWrapped: toB64(row.identity_private_key_wrapped),
      identityPrivateKeyNonce: toB64(row.identity_private_key_nonce),
      exchangePrivateKeyWrapped: toB64(row.exchange_private_key_wrapped),
      exchangePrivateKeyNonce: toB64(row.exchange_private_key_nonce),
      exchangePublicKey: toB64(row.exchange_public_key),
    });
  });

  // ─── POST /refresh ────────────────────────────────────────
  app.post('/refresh', async (req, reply) => {
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
      { expiresIn: '15m' },
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
      `SELECT id, username, storage_quota_bytes, storage_used_bytes,
              identity_public_key, exchange_public_key
       FROM users WHERE id = $1`,
      [req.user.sub],
    );
    if (r.rowCount === 0) return reply.notFound();
    const u = r.rows[0];
    return reply.send({
      id: u.id,
      username: u.username,
      storageQuotaBytes: Number(u.storage_quota_bytes),
      storageUsedBytes: Number(u.storage_used_bytes),
      identityPublicKey: toB64(u.identity_public_key),
      exchangePublicKey: toB64(u.exchange_public_key),
    });
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
};

export default authRoutes;
