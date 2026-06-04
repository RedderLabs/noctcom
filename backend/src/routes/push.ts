import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { db } from '../db/pool.js';

const pushRoutes: FastifyPluginAsync = async (app) => {

  // ─── POST /register ─ guardar FCM token ───────────────────
  // Tope de tokens por usuario: cada uno multiplica el coste de cada push
  // (multicast a todos). 20 cubre de sobra navegadores+dispositivos reales y
  // corta el DoS de inflar la tabla. Al llegar al tope, se recicla el más
  // antiguo (un token viejo suele ser un navegador que ya no existe).
  const MAX_TOKENS_PER_USER = 20;

  app.post('/register', {
    onRequest: [app.authenticate],
    config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
  }, async (req, reply) => {
    const { token } = z.object({ token: z.string().min(10).max(512) }).parse(req.body);
    const userId = req.user.sub;

    await db.query(
      `INSERT INTO push_tokens (user_id, token)
       VALUES ($1, $2)
       ON CONFLICT (user_id, token) DO NOTHING`,
      [userId, token],
    );

    // Poda FIFO: si supera el tope, elimina los más antiguos.
    await db.query(
      `DELETE FROM push_tokens
       WHERE user_id = $1 AND id NOT IN (
         SELECT id FROM push_tokens WHERE user_id = $1
         ORDER BY created_at DESC LIMIT $2
       )`,
      [userId, MAX_TOKENS_PER_USER],
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
