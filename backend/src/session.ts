import type { FastifyReply, FastifyRequest } from 'fastify';
import { createHash, randomBytes } from 'node:crypto';
import { db } from './db/pool.js';

const toB64 = (b: Buffer | Uint8Array) => Buffer.from(b).toString('base64url');

export function hashIp(ip: string): Buffer {
  return createHash('blake2b512').update(`ip:${ip}`).digest().subarray(0, 32);
}

export function newRefreshToken(): { plain: string; hash: Buffer } {
  const plain = randomBytes(32).toString('base64url');
  const hash = createHash('blake2b512').update(plain).digest().subarray(0, 32);
  return { plain, hash };
}

export interface SessionPayload {
  userId: string;
  deviceId: string | null;
  accessToken: string;
  refreshToken: string;
  identityPrivateKeyWrapped: string;
  identityPrivateKeyNonce: string;
  exchangePrivateKeyWrapped: string;
  exchangePrivateKeyNonce: string;
  exchangePublicKey: string;
}

// Emite una sesión completa: valida el dispositivo, firma el access token,
// crea el refresh token, hace bootstrap de admin y devuelve las claves wrapped
// para que el cliente las descifre con la MK. Compartido por /login/finalize
// (cuando no hay 2FA) y por las finalizaciones de 2FA (passkey / email OTP).
export async function issueSession(
  req: FastifyRequest,
  reply: FastifyReply,
  userId: string,
  deviceIdInput: string | null,
): Promise<SessionPayload> {
  let deviceId: string | null = deviceIdInput ?? null;
  if (deviceId) {
    const d = await db.query(
      `SELECT id FROM devices WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL`,
      [deviceId, userId],
    );
    if (d.rowCount === 0) {
      deviceId = null;
    } else {
      await db.query(`UPDATE devices SET last_seen_at = now() WHERE id = $1`, [deviceId]);
    }
  }

  const accessToken = await reply.jwtSign({ sub: userId, deviceId }, { expiresIn: '7d' });

  const { plain, hash } = newRefreshToken();
  const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  if (deviceId) {
    await db.query(
      `UPDATE sessions SET revoked_at = now()
       WHERE user_id = $1 AND device_id = $2 AND revoked_at IS NULL`,
      [userId, deviceId],
    );
  }
  await db.query(
    `INSERT INTO sessions (user_id, device_id, refresh_token_hash, ip_address_hash, expires_at)
     VALUES ($1,$2,$3,$4,$5)`,
    [userId, deviceId, hash, hashIp(req.ip), expires],
  );

  // Bootstrap: si no hay ningún admin, el primero en entrar lo es.
  const adminExists = await db.query('SELECT 1 FROM users WHERE is_admin = true LIMIT 1');
  if (adminExists.rowCount === 0) {
    await db.query('UPDATE users SET is_admin = true WHERE id = $1', [userId]);
  }

  await db.query(`UPDATE users SET last_login_at = now() WHERE id = $1`, [userId]);

  const r = await db.query(
    `SELECT identity_private_key_wrapped, identity_private_key_nonce,
            exchange_private_key_wrapped, exchange_private_key_nonce, exchange_public_key
     FROM users WHERE id = $1`,
    [userId],
  );
  const row = r.rows[0];

  return {
    userId,
    deviceId,
    accessToken,
    refreshToken: plain,
    identityPrivateKeyWrapped: toB64(row.identity_private_key_wrapped),
    identityPrivateKeyNonce: toB64(row.identity_private_key_nonce),
    exchangePrivateKeyWrapped: toB64(row.exchange_private_key_wrapped),
    exchangePrivateKeyNonce: toB64(row.exchange_private_key_nonce),
    exchangePublicKey: toB64(row.exchange_public_key),
  };
}
