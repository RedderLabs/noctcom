import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { db } from '../db/pool.js';

const adminRoutes: FastifyPluginAsync = async (app) => {

  async function requireAdmin(req: any, reply: any): Promise<boolean> {
    const r = await db.query(
      'SELECT is_admin FROM users WHERE id = $1',
      [req.user.sub],
    );
    if (!r.rows[0]?.is_admin) {
      reply.forbidden('se requiere acceso de administrador');
      return false;
    }
    return true;
  }

  // ─── GET /users ── listar usuarios (solo admin) ───────────
  app.get('/users', { onRequest: [app.authenticate] }, async (req, reply) => {
    if (!(await requireAdmin(req, reply))) return;

    const r = await db.query(
      `SELECT id, username, is_admin, created_at, last_login_at
       FROM users ORDER BY created_at`,
    );

    return reply.send(r.rows.map((u) => ({
      id: u.id,
      username: u.username,
      isAdmin: u.is_admin,
      createdAt: u.created_at,
      lastLoginAt: u.last_login_at,
    })));
  });

  // ─── PATCH /users/:id/role ── promover / revocar admin ────
  app.patch<{ Params: { id: string } }>(
    '/users/:id/role',
    { onRequest: [app.authenticate] },
    async (req, reply) => {
      if (!(await requireAdmin(req, reply))) return;

      const { isAdmin } = z.object({ isAdmin: z.boolean() }).parse(req.body);
      const targetId = req.params.id;

      if (targetId === (req as any).user.sub && !isAdmin) {
        return reply.badRequest('no puedes revocarte el admin a ti mismo');
      }

      const r = await db.query(
        'UPDATE users SET is_admin = $1 WHERE id = $2 RETURNING id, username, is_admin',
        [isAdmin, targetId],
      );
      if (r.rowCount === 0) return reply.notFound('usuario no encontrado');

      const u = r.rows[0];
      return reply.send({
        id: u.id,
        username: u.username,
        isAdmin: u.is_admin,
      });
    },
  );
};

export default adminRoutes;
