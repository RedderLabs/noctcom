/**
 * Contactos: consentimiento previo a compartir (anti-spam).
 *
 *   A pide a B (POST /)  →  B acepta (POST /:id/accept)  →  son contactos.
 *   Solo entre contactos aceptados se permite crear shares (ver shares.ts).
 *
 * TOFU: al pedir se fija la exchange pubkey del requester; al aceptar, la del
 * addressee. El emisor sella sus shares contra la clave fijada del contacto
 * (la que devuelve GET /), no contra un lookup fresco que el servidor podría
 * sustituir en silencio.
 *
 * Si B ya te había pedido a TI (pending inverso), tu "pedir" lo auto-acepta:
 * no tiene sentido cruzar dos solicitudes entre las mismas dos personas.
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { db } from '../db/pool.js';
import { publishChange } from '../db/redis.js';
import { sendPushToUser } from '../push.js';

const toB64 = (b: Buffer | Uint8Array) => Buffer.from(b).toString('base64url');

async function getExchangePk(userId: string): Promise<Buffer | null> {
  const r = await db.query(`SELECT exchange_public_key FROM users WHERE id = $1`, [userId]);
  return r.rowCount === 0 ? null : r.rows[0].exchange_public_key;
}

const requestSchema = z.object({
  username: z.string().min(3).max(64),
});

const contactRoutes: FastifyPluginAsync = async (app) => {

  // ─── POST / ─ enviar solicitud de contacto ────────────────
  app.post('/', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { username } = requestSchema.parse(req.body);
    const me = req.user.sub;

    const target = await db.query(`SELECT id FROM users WHERE username = $1`, [username]);
    if (target.rowCount === 0) return reply.notFound('user not found');
    const them = target.rows[0].id as string;
    if (them === me) return reply.badRequest('cannot add yourself');

    const myPk = await getExchangePk(me);

    // ¿Ya hay relación en cualquier dirección?
    const existing = await db.query(
      `SELECT id, requester_id, addressee_id, status FROM contacts
       WHERE (requester_id = $1 AND addressee_id = $2)
          OR (requester_id = $2 AND addressee_id = $1)`,
      [me, them],
    );

    const accepted = existing.rows.find((r) => r.status === 'accepted');
    if (accepted) return reply.send({ status: 'accepted', contactId: accepted.id });

    const blocked = existing.rows.find((r) => r.status === 'blocked');
    if (blocked) return reply.forbidden();

    // Solicitud inversa pendiente (ellos→yo): auto-aceptar.
    const inbound = existing.rows.find(
      (r) => r.requester_id === them && r.addressee_id === me && r.status === 'pending',
    );
    if (inbound) {
      await db.query(
        `UPDATE contacts SET status = 'accepted', responded_at = now(), addressee_exchange_pk = $2
         WHERE id = $1`,
        [inbound.id, myPk],
      );
      publishChange(them, { resource: 'contacts', action: 'accepted' });
      publishChange(me, { resource: 'contacts', action: 'accepted' });
      return reply.send({ status: 'accepted', contactId: inbound.id, autoAccepted: true });
    }

    // Solicitud directa (yo→ellos): crear o reabrir si estaba declinada.
    const r = await db.query(
      `INSERT INTO contacts (requester_id, addressee_id, status, requester_exchange_pk)
       VALUES ($1, $2, 'pending', $3)
       ON CONFLICT (requester_id, addressee_id) DO UPDATE
         SET status = 'pending', requester_exchange_pk = EXCLUDED.requester_exchange_pk,
             created_at = now(), responded_at = NULL
       RETURNING id`,
      [me, them, myPk],
    );

    publishChange(them, { resource: 'contacts', action: 'requested' });
    const sender = await db.query(`SELECT username FROM users WHERE id = $1`, [me]);
    sendPushToUser(
      them,
      'Solicitud de contacto',
      `${sender.rows[0]?.username ?? 'Alguien'} quiere compartir archivos contigo`,
      { type: 'contact_request' },
    ).catch(() => {});

    return reply.code(201).send({ status: 'pending', contactId: r.rows[0].id });
  });

  // ─── GET / ─ aceptados + solicitudes entrantes/salientes ───
  app.get('/', { onRequest: [app.authenticate] }, async (req, reply) => {
    const me = req.user.sub;

    const accepted = await db.query(
      `SELECT c.id,
              CASE WHEN c.requester_id = $1 THEN c.addressee_id ELSE c.requester_id END AS other_id,
              COALESCE(
                CASE WHEN c.requester_id = $1 THEN c.addressee_exchange_pk ELSE c.requester_exchange_pk END,
                u.exchange_public_key
              ) AS other_pk,
              u.username AS other_username
       FROM contacts c
       JOIN users u ON u.id = (CASE WHEN c.requester_id = $1 THEN c.addressee_id ELSE c.requester_id END)
       WHERE c.status = 'accepted' AND (c.requester_id = $1 OR c.addressee_id = $1)
       ORDER BY u.username`,
      [me],
    );

    const incoming = await db.query(
      `SELECT c.id, c.requester_id AS other_id, u.username AS other_username, c.created_at
       FROM contacts c JOIN users u ON u.id = c.requester_id
       WHERE c.addressee_id = $1 AND c.status = 'pending'
       ORDER BY c.created_at DESC`,
      [me],
    );

    const outgoing = await db.query(
      `SELECT c.id, c.addressee_id AS other_id, u.username AS other_username, c.created_at
       FROM contacts c JOIN users u ON u.id = c.addressee_id
       WHERE c.requester_id = $1 AND c.status = 'pending'
       ORDER BY c.created_at DESC`,
      [me],
    );

    return reply.send({
      accepted: accepted.rows.map((c) => ({
        contactId: c.id,
        userId: c.other_id,
        username: c.other_username,
        exchangePublicKey: toB64(c.other_pk),
      })),
      incoming: incoming.rows.map((c) => ({
        contactId: c.id, userId: c.other_id, username: c.other_username, createdAt: c.created_at,
      })),
      outgoing: outgoing.rows.map((c) => ({
        contactId: c.id, userId: c.other_id, username: c.other_username, createdAt: c.created_at,
      })),
    });
  });

  // ─── POST /:id/accept ─ aceptar solicitud entrante ─────────
  app.post<{ Params: { id: string } }>(
    '/:id/accept', { onRequest: [app.authenticate] }, async (req, reply) => {
      const me = req.user.sub;
      const myPk = await getExchangePk(me);
      const r = await db.query(
        `UPDATE contacts SET status = 'accepted', responded_at = now(), addressee_exchange_pk = $3
         WHERE id = $1 AND addressee_id = $2 AND status = 'pending'
         RETURNING requester_id`,
        [req.params.id, me, myPk],
      );
      if (r.rowCount === 0) return reply.notFound();
      const requester = r.rows[0].requester_id as string;
      publishChange(requester, { resource: 'contacts', action: 'accepted' });
      publishChange(me, { resource: 'contacts', action: 'accepted' });
      sendPushToUser(requester, 'Contacto aceptado', 'Ya podéis compartir archivos', { type: 'contact_accepted' }).catch(() => {});
      return reply.send({ ok: true });
    },
  );

  // ─── POST /:id/decline ─ rechazar solicitud entrante ───────
  app.post<{ Params: { id: string } }>(
    '/:id/decline', { onRequest: [app.authenticate] }, async (req, reply) => {
      const me = req.user.sub;
      const r = await db.query(
        `UPDATE contacts SET status = 'declined', responded_at = now()
         WHERE id = $1 AND addressee_id = $2 AND status = 'pending'`,
        [req.params.id, me],
      );
      if (r.rowCount === 0) return reply.notFound();
      return reply.send({ ok: true });
    },
  );

  // ─── DELETE /:id ─ eliminar contacto (cualquiera de los dos) ─
  // Corta los envíos futuros y revoca los shares vigentes en ambos sentidos
  // ("ya no te comparto"). No borra los archivos que el otro ya descargó.
  app.delete<{ Params: { id: string } }>(
    '/:id', { onRequest: [app.authenticate] }, async (req, reply) => {
      const me = req.user.sub;
      const r = await db.query(
        `DELETE FROM contacts WHERE id = $1 AND (requester_id = $2 OR addressee_id = $2)
         RETURNING requester_id, addressee_id`,
        [req.params.id, me],
      );
      if (r.rowCount === 0) return reply.notFound();
      const { requester_id: a, addressee_id: b } = r.rows[0];
      await db.query(
        `UPDATE shares SET revoked_at = now()
         WHERE revoked_at IS NULL
           AND ((shared_by = $1 AND shared_with = $2) OR (shared_by = $2 AND shared_with = $1))`,
        [a, b],
      );
      publishChange(a, { resource: 'contacts', action: 'removed' });
      publishChange(b, { resource: 'contacts', action: 'removed' });
      publishChange(a, { resource: 'shares', action: 'revoked' });
      publishChange(b, { resource: 'shares', action: 'revoked' });
      return reply.send({ ok: true });
    },
  );
};

export default contactRoutes;
