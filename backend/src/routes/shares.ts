/**
 * Compartir = re-cifrar la file_key con la pubkey del destinatario.
 * El servidor recibe un "sealed_key" opaco; no puede leer la clave compartida.
 *
 * Cliente (owner):
 *   1. Descarga la pubkey del destinatario (GET /auth/users/lookup/:username).
 *   2. Desempaqueta la file_key con su vault_key.
 *   3. sealed_key = crypto_box_seal(file_key, recipient_exchange_pubkey).
 *   4. POST /shares con el sealed_key.
 *
 * Cliente (recipient):
 *   1. GET /shares/incoming → recibe sealed_keys.
 *   2. Abre cada uno con su exchange_private_key (desempaquetada con su MK).
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { db } from '../db/pool.js';

const bytesB64 = z.string().regex(/^[A-Za-z0-9_-]+$/);
const fromB64 = (s: string) => Buffer.from(s, 'base64url');
const toB64 = (b: Buffer | Uint8Array) => Buffer.from(b).toString('base64url');

const createShareSchema = z.object({
  nodeId: z.string().uuid(),
  sharedWithUserId: z.string().uuid(),
  permission: z.enum(['read', 'write']).default('read'),
  sealedKey: bytesB64,
  expiresAt: z.string().datetime().optional(),
});

const shareRoutes: FastifyPluginAsync = async (app) => {

  // ─── POST / ─ crear share ─────────────────────────────────
  app.post('/', { onRequest: [app.authenticate] }, async (req, reply) => {
    const body = createShareSchema.parse(req.body);
    const userId = req.user.sub;

    const own = await db.query(
      `SELECT v.owner_id FROM nodes n
       JOIN vaults v ON v.id = n.vault_id WHERE n.id = $1`,
      [body.nodeId],
    );
    if (own.rowCount === 0) return reply.notFound('node not found');
    if (own.rows[0].owner_id !== userId) return reply.forbidden();

    if (body.sharedWithUserId === userId) {
      return reply.badRequest('cannot share with yourself');
    }

    const r = await db.query(
      `INSERT INTO shares (node_id, shared_by, shared_with, permission, sealed_key, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (node_id, shared_with) DO UPDATE
         SET sealed_key = EXCLUDED.sealed_key,
             permission = EXCLUDED.permission,
             expires_at = EXCLUDED.expires_at,
             revoked_at = NULL
       RETURNING id, created_at`,
      [
        body.nodeId, userId, body.sharedWithUserId,
        body.permission, fromB64(body.sealedKey),
        body.expiresAt ?? null,
      ],
    );

    return reply.code(201).send({ id: r.rows[0].id, createdAt: r.rows[0].created_at });
  });

  // ─── GET /incoming ────────────────────────────────────────
  app.get('/incoming', { onRequest: [app.authenticate] }, async (req, reply) => {
    const userId = req.user.sub;
    const r = await db.query(
      `SELECT s.id, s.node_id, s.permission, s.sealed_key, s.expires_at, s.created_at,
              u.username AS shared_by_username, u.identity_public_key AS shared_by_identity_pk,
              n.name_encrypted, n.name_nonce, n.kind, n.metadata_encrypted, n.metadata_nonce,
              n.ciphertext_size, n.current_version_id
       FROM shares s
       JOIN users u ON u.id = s.shared_by
       JOIN nodes n ON n.id = s.node_id
       WHERE s.shared_with = $1 AND s.revoked_at IS NULL
             AND (s.expires_at IS NULL OR s.expires_at > now())
             AND n.deleted_at IS NULL
       ORDER BY s.created_at DESC`,
      [userId],
    );

    return reply.send({
      shares: r.rows.map((s) => ({
        id: s.id,
        nodeId: s.node_id,
        kind: s.kind,
        permission: s.permission,
        sealedKey: toB64(s.sealed_key),
        sharedByUsername: s.shared_by_username,
        sharedByIdentityPublicKey: toB64(s.shared_by_identity_pk),
        nameEncrypted: toB64(s.name_encrypted),
        nameNonce: toB64(s.name_nonce),
        metadataEncrypted: s.metadata_encrypted ? toB64(s.metadata_encrypted) : null,
        metadataNonce: s.metadata_nonce ? toB64(s.metadata_nonce) : null,
        ciphertextSize: Number(s.ciphertext_size),
        currentVersionId: s.current_version_id,
        createdAt: s.created_at,
        expiresAt: s.expires_at,
      })),
    });
  });

  // ─── GET /outgoing ────────────────────────────────────────
  app.get('/outgoing', { onRequest: [app.authenticate] }, async (req, reply) => {
    const userId = req.user.sub;
    const r = await db.query(
      `SELECT s.id, s.node_id, s.permission, s.expires_at, s.created_at,
              u.username AS shared_with_username
       FROM shares s
       JOIN users u ON u.id = s.shared_with
       WHERE s.shared_by = $1 AND s.revoked_at IS NULL
       ORDER BY s.created_at DESC`,
      [userId],
    );
    return reply.send({ shares: r.rows });
  });

  // ─── DELETE /:id ─ revocar ────────────────────────────────
  app.delete<{ Params: { id: string } }>(
    '/:id',
    { onRequest: [app.authenticate] },
    async (req, reply) => {
      const userId = req.user.sub;
      const r = await db.query(
        `UPDATE shares SET revoked_at = now()
         WHERE id = $1 AND shared_by = $2 AND revoked_at IS NULL`,
        [req.params.id, userId],
      );
      if (r.rowCount === 0) return reply.notFound();
      return reply.send({ ok: true });
    },
  );
};

export default shareRoutes;
