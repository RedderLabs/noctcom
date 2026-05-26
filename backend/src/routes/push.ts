import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { db } from '../db/pool.js';

const pushRoutes: FastifyPluginAsync = async (app) => {

  // ─── POST /register ─ guardar FCM token ───────────────────
  app.post('/register', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { token } = z.object({ token: z.string().min(10) }).parse(req.body);
    const userId = req.user.sub;

    await db.query(
      `INSERT INTO push_tokens (user_id, token)
       VALUES ($1, $2)
       ON CONFLICT (user_id, token) DO NOTHING`,
      [userId, token],
    );
    return reply.send({ ok: true });
  });

  // ─── DELETE /unregister ─ eliminar token ──────────────────
  app.delete('/unregister', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { token } = z.object({ token: z.string().min(10) }).parse(req.body);
    await db.query(
      `DELETE FROM push_tokens WHERE user_id = $1 AND token = $2`,
      [req.user.sub, token],
    );
    return reply.send({ ok: true });
  });
};

export default pushRoutes;
