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

  // ─── GET /metrics ── métricas agregadas (solo admin) ──────
  // Respetuosas con la privacidad POR DISEÑO: solo agregados SQL sobre datos
  // que ya existen (nada de trackers, cookies ni eventos por usuario). Ningún
  // dato individual sale de aquí.
  app.get('/metrics', { onRequest: [app.authenticate] }, async (req, reply) => {
    if (!(await requireAdmin(req, reply))) return;

    const [users, storage, content, plans] = await Promise.all([
      db.query(
        `SELECT count(*)::int                                                          AS total,
                count(*) FILTER (WHERE created_at    > now() - interval '7 days')::int  AS new_7d,
                count(*) FILTER (WHERE created_at    > now() - interval '30 days')::int AS new_30d,
                count(*) FILTER (WHERE last_login_at > now() - interval '7 days')::int  AS active_7d,
                count(*) FILTER (WHERE last_login_at > now() - interval '30 days')::int AS active_30d,
                count(*) FILTER (WHERE email_verified)::int                             AS verified,
                count(*) FILTER (WHERE two_factor_email_enabled
                                 OR EXISTS (SELECT 1 FROM webauthn_credentials c
                                            WHERE c.user_id = users.id
                                              AND c.revoked_at IS NULL))::int           AS with_2fa
         FROM users`,
      ),
      db.query(
        `SELECT COALESCE(SUM(storage_used_bytes), 0)::bigint AS used_bytes FROM users`,
      ),
      db.query(
        `SELECT (SELECT count(*) FROM nodes  WHERE kind = 'file' AND deleted_at IS NULL)::int AS files,
                (SELECT count(*) FROM shares WHERE revoked_at IS NULL)::int                    AS shares,
                (SELECT count(*) FROM agents WHERE revoked_at IS NULL)::int                    AS agents`,
      ),
      db.query(
        `SELECT COALESCE(plan, 'free') AS plan, count(*)::int AS n
         FROM users GROUP BY 1 ORDER BY 2 DESC`,
      ),
    ]);

    const u = users.rows[0];
    return reply.send({
      users: {
        total: u.total,
        new7d: u.new_7d,
        new30d: u.new_30d,
        active7d: u.active_7d,
        active30d: u.active_30d,
        verified: u.verified,
        with2fa: u.with_2fa,
      },
      storageUsedBytes: Number(storage.rows[0].used_bytes),
      files: content.rows[0].files,
      shares: content.rows[0].shares,
      agents: content.rows[0].agents,
      plans: Object.fromEntries(plans.rows.map((p) => [p.plan, p.n])),
    });
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
