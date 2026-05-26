import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { db } from '../db/pool.js';
import { publishChange } from '../db/redis.js';

const bytesB64 = z.string().regex(/^[A-Za-z0-9_-]+$/, 'base64url required');
const pubKey32 = bytesB64.min(1).max(Math.ceil(32 * 4 / 3) + 4);
const nonce24 = bytesB64.min(1).max(Math.ceil(24 * 4 / 3) + 4);

const fromB64 = (s: string) => Buffer.from(s, 'base64url');
const toB64 = (b: Buffer | Uint8Array) => Buffer.from(b).toString('base64url');

const registerSchema = z.object({
  devicePublicKey: pubKey32,
  deviceNameEncrypted: bytesB64.max(512),
  deviceNameNonce: nonce24,
});

const renameSchema = z.object({
  deviceNameEncrypted: bytesB64.max(512),
  deviceNameNonce: nonce24,
});

const deviceRoutes: FastifyPluginAsync = async (app) => {

  // ─── GET / — list active devices ─────────────────────────
  app.get('/', { onRequest: [app.authenticate] }, async (req, reply) => {
    const userId = req.user.sub;
    const currentDeviceId = req.user.deviceId;

    const r = await db.query(
      `SELECT id, device_name_encrypted, device_name_nonce, device_public_key,
              last_seen_at, created_at
       FROM devices
       WHERE user_id = $1 AND revoked_at IS NULL
       ORDER BY created_at ASC`,
      [userId],
    );

    const devices = r.rows.map((d) => ({
      id: d.id,
      nameEncrypted: toB64(d.device_name_encrypted),
      nameNonce: toB64(d.device_name_nonce),
      publicKey: toB64(d.device_public_key),
      lastSeenAt: d.last_seen_at?.toISOString() ?? null,
      createdAt: d.created_at.toISOString(),
      isCurrent: d.id === currentDeviceId,
    }));

    return reply.send(devices);
  });

  // ─── POST / — register new device ────────────────────────
  app.post('/', { onRequest: [app.authenticate] }, async (req, reply) => {
    const userId = req.user.sub;
    const body = registerSchema.parse(req.body);

    const r = await db.query(
      `INSERT INTO devices (user_id, device_name_encrypted, device_name_nonce, device_public_key, last_seen_at)
       VALUES ($1, $2, $3, $4, now())
       RETURNING id`,
      [
        userId,
        fromB64(body.deviceNameEncrypted),
        fromB64(body.deviceNameNonce),
        fromB64(body.devicePublicKey),
      ],
    );
    const deviceId = r.rows[0].id as string;

    // Update the current session to point to the new device
    await db.query(
      `UPDATE sessions SET device_id = $1
       WHERE user_id = $2 AND device_id = $3 AND revoked_at IS NULL`,
      [deviceId, userId, req.user.deviceId],
    );

    const accessToken = await reply.jwtSign(
      { sub: userId, deviceId },
      { expiresIn: '15m' },
    );

    publishChange(userId, { resource: 'devices', action: 'new' });

    return reply.code(201).send({ deviceId, accessToken });
  });

  // ─── PATCH /:id/rename ───────────────────────────────────
  app.patch<{ Params: { id: string } }>(
    '/:id/rename',
    { onRequest: [app.authenticate] },
    async (req, reply) => {
      const userId = req.user.sub;
      const { id } = req.params;
      const body = renameSchema.parse(req.body);

      const r = await db.query(
        `UPDATE devices SET device_name_encrypted = $1, device_name_nonce = $2
         WHERE id = $3 AND user_id = $4 AND revoked_at IS NULL`,
        [fromB64(body.deviceNameEncrypted), fromB64(body.deviceNameNonce), id, userId],
      );

      if (r.rowCount === 0) return reply.notFound('device not found');
      return reply.send({ ok: true });
    },
  );

  // ─── DELETE /:id — revoke device ─────────────────────────
  app.delete<{ Params: { id: string } }>(
    '/:id',
    { onRequest: [app.authenticate] },
    async (req, reply) => {
      const userId = req.user.sub;
      const { id } = req.params;

      if (id === req.user.deviceId) {
        return reply.badRequest('cannot revoke current device');
      }

      const r = await db.query(
        `UPDATE devices SET revoked_at = now()
         WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL
         RETURNING id`,
        [id, userId],
      );
      if (r.rowCount === 0) return reply.notFound('device not found');

      await db.query(
        `UPDATE sessions SET revoked_at = now()
         WHERE device_id = $1 AND user_id = $2 AND revoked_at IS NULL`,
        [id, userId],
      );

      publishChange(userId, { resource: 'devices', action: 'revoked' });

      return reply.send({ ok: true });
    },
  );

  // ─── DELETE / — revoke all other devices ─────────────────
  app.delete('/', { onRequest: [app.authenticate] }, async (req, reply) => {
    const userId = req.user.sub;
    const currentDeviceId = req.user.deviceId;

    await db.query(
      `UPDATE devices SET revoked_at = now()
       WHERE user_id = $1 AND id != $2 AND revoked_at IS NULL`,
      [userId, currentDeviceId],
    );

    await db.query(
      `UPDATE sessions SET revoked_at = now()
       WHERE user_id = $1 AND device_id != $2 AND revoked_at IS NULL`,
      [userId, currentDeviceId],
    );

    publishChange(userId, { resource: 'devices', action: 'revoked' });

    return reply.send({ ok: true });
  });
};

export default deviceRoutes;
