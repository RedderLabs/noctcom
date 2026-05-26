import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { db } from '../db/pool.js';

const bytesB64 = z.string().regex(/^[A-Za-z0-9_-]+$/);
const toB64 = (b: Buffer | Uint8Array) => Buffer.from(b).toString('base64url');
const fromB64 = (s: string) => Buffer.from(s, 'base64url');

const auditRoutes: FastifyPluginAsync = async (app) => {

  // ─── POST / ─ registrar evento cifrado ────────────────────
  app.post('/', { onRequest: [app.authenticate] }, async (req, reply) => {
    const schema = z.object({
      eventEncrypted: bytesB64,
      eventNonce: bytesB64,
    });
    const body = schema.parse(req.body);
    const userId = req.user.sub;

    await db.query(
      `INSERT INTO audit_log (user_id, event_encrypted, event_nonce)
       VALUES ($1, $2, $3)`,
      [userId, fromB64(body.eventEncrypted), fromB64(body.eventNonce)],
    );

    return reply.code(201).send({ ok: true });
  });

  // ─── GET / ─ listar eventos (paginado) ────────────────────
  app.get<{ Querystring: { limit?: string; offset?: string } }>(
    '/',
    { onRequest: [app.authenticate] },
    async (req, reply) => {
      const userId = req.user.sub;
      const limit = Math.min(100, parseInt(req.query.limit ?? '50', 10));
      const offset = parseInt(req.query.offset ?? '0', 10);

      const r = await db.query(
        `SELECT id, event_encrypted, event_nonce, created_at
         FROM audit_log
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT $2 OFFSET $3`,
        [userId, limit, offset],
      );

      const count = await db.query(
        `SELECT COUNT(*)::int AS total FROM audit_log WHERE user_id = $1`,
        [userId],
      );

      return reply.send({
        events: r.rows.map((e) => ({
          id: e.id,
          eventEncrypted: toB64(e.event_encrypted),
          eventNonce: toB64(e.event_nonce),
          createdAt: e.created_at,
        })),
        total: count.rows[0].total,
      });
    },
  );
};

export default auditRoutes;
