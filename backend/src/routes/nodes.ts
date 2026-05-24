import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { db, tx } from '../db/pool.js';

const bytesB64 = z.string().regex(/^[A-Za-z0-9_-]+$/);
const fromB64 = (s: string) => Buffer.from(s, 'base64url');
const toB64 = (b: Buffer | Uint8Array) => Buffer.from(b).toString('base64url');

const createFolderSchema = z.object({
  vaultId: z.string().uuid(),
  parentId: z.string().uuid().nullable(),
  nameEncrypted: bytesB64,
  nameNonce: bytesB64,
  metadataEncrypted: bytesB64.optional(),
  metadataNonce: bytesB64.optional(),
});

const renameSchema = z.object({
  nameEncrypted: bytesB64,
  nameNonce: bytesB64,
  metadataEncrypted: bytesB64.optional(),
  metadataNonce: bytesB64.optional(),
});

const moveSchema = z.object({
  newParentId: z.string().uuid().nullable(),
});

const nodeRoutes: FastifyPluginAsync = async (app) => {

  // ─── POST /folders ─ crear carpeta ────────────────────────
  app.post('/folders', { onRequest: [app.authenticate] }, async (req, reply) => {
    const body = createFolderSchema.parse(req.body);
    const userId = req.user.sub;

    const v = await db.query(`SELECT owner_id FROM vaults WHERE id = $1`, [body.vaultId]);
    if (v.rowCount === 0) return reply.notFound('vault not found');
    if (v.rows[0].owner_id !== userId) return reply.forbidden();

    const r = await db.query(
      `INSERT INTO nodes (
        vault_id, parent_id, kind,
        name_encrypted, name_nonce,
        metadata_encrypted, metadata_nonce
      ) VALUES ($1,$2,'folder',$3,$4,$5,$6) RETURNING id, created_at`,
      [
        body.vaultId, body.parentId,
        fromB64(body.nameEncrypted), fromB64(body.nameNonce),
        body.metadataEncrypted ? fromB64(body.metadataEncrypted) : null,
        body.metadataNonce ? fromB64(body.metadataNonce) : null,
      ],
    );

    return reply.code(201).send({ id: r.rows[0].id, createdAt: r.rows[0].created_at });
  });

  // ─── GET /vault/:vaultId/list?parent=... ──────────────────
  app.get<{ Params: { vaultId: string }; Querystring: { parent?: string } }>(
    '/vault/:vaultId/list',
    { onRequest: [app.authenticate] },
    async (req, reply) => {
      const userId = req.user.sub;
      const { vaultId } = req.params;
      const parent = req.query.parent ?? null;

      const v = await db.query(`SELECT owner_id FROM vaults WHERE id = $1`, [vaultId]);
      if (v.rowCount === 0) return reply.notFound();
      if (v.rows[0].owner_id !== userId) return reply.forbidden();

      const r = await db.query(
        `SELECT id, kind, name_encrypted, name_nonce,
                metadata_encrypted, metadata_nonce,
                file_key_wrapped, file_key_nonce,
                current_version_id, ciphertext_size,
                created_at, updated_at
         FROM nodes
         WHERE vault_id = $1
               AND ((parent_id IS NULL AND $2::uuid IS NULL) OR parent_id = $2::uuid)
               AND deleted_at IS NULL
         ORDER BY kind DESC, created_at ASC`,
        [vaultId, parent],
      );

      return reply.send({
        nodes: r.rows.map((n) => ({
          id: n.id,
          kind: n.kind,
          nameEncrypted: toB64(n.name_encrypted),
          nameNonce: toB64(n.name_nonce),
          metadataEncrypted: n.metadata_encrypted ? toB64(n.metadata_encrypted) : null,
          metadataNonce: n.metadata_nonce ? toB64(n.metadata_nonce) : null,
          fileKeyWrapped: n.file_key_wrapped ? toB64(n.file_key_wrapped) : null,
          fileKeyNonce: n.file_key_nonce ? toB64(n.file_key_nonce) : null,
          currentVersionId: n.current_version_id,
          ciphertextSize: Number(n.ciphertext_size),
          createdAt: n.created_at,
          updatedAt: n.updated_at,
        })),
      });
    },
  );

  // ─── PATCH /:id ─ renombrar / actualizar metadata ─────────
  app.patch<{ Params: { id: string } }>(
    '/:id',
    { onRequest: [app.authenticate] },
    async (req, reply) => {
      const body = renameSchema.parse(req.body);
      const userId = req.user.sub;

      const own = await db.query(
        `SELECT v.owner_id FROM nodes n
         JOIN vaults v ON v.id = n.vault_id WHERE n.id = $1`,
        [req.params.id],
      );
      if (own.rowCount === 0) return reply.notFound();
      if (own.rows[0].owner_id !== userId) return reply.forbidden();

      await db.query(
        `UPDATE nodes SET
          name_encrypted = $1, name_nonce = $2,
          metadata_encrypted = COALESCE($3, metadata_encrypted),
          metadata_nonce = COALESCE($4, metadata_nonce)
         WHERE id = $5`,
        [
          fromB64(body.nameEncrypted), fromB64(body.nameNonce),
          body.metadataEncrypted ? fromB64(body.metadataEncrypted) : null,
          body.metadataNonce ? fromB64(body.metadataNonce) : null,
          req.params.id,
        ],
      );

      return reply.send({ ok: true });
    },
  );

  // ─── POST /:id/move ───────────────────────────────────────
  app.post<{ Params: { id: string } }>(
    '/:id/move',
    { onRequest: [app.authenticate] },
    async (req, reply) => {
      const body = moveSchema.parse(req.body);
      const userId = req.user.sub;

      const own = await db.query(
        `SELECT v.owner_id, n.vault_id FROM nodes n
         JOIN vaults v ON v.id = n.vault_id WHERE n.id = $1`,
        [req.params.id],
      );
      if (own.rowCount === 0) return reply.notFound();
      if (own.rows[0].owner_id !== userId) return reply.forbidden();

      if (body.newParentId) {
        const parent = await db.query(
          `SELECT vault_id, kind FROM nodes WHERE id = $1 AND deleted_at IS NULL`,
          [body.newParentId],
        );
        if (parent.rowCount === 0) return reply.badRequest('new parent not found');
        if (parent.rows[0].vault_id !== own.rows[0].vault_id) {
          return reply.badRequest('cross-vault move not allowed');
        }
        if (parent.rows[0].kind !== 'folder') return reply.badRequest('parent must be folder');

        // TODO: detectar ciclos (mover una carpeta dentro de sí misma)
      }

      await db.query(
        `UPDATE nodes SET parent_id = $1 WHERE id = $2`,
        [body.newParentId, req.params.id],
      );
      return reply.send({ ok: true });
    },
  );

  // ─── DELETE /:id ─ soft delete (papelera) ─────────────────
  app.delete<{ Params: { id: string } }>(
    '/:id',
    { onRequest: [app.authenticate] },
    async (req, reply) => {
      const userId = req.user.sub;
      const own = await db.query(
        `SELECT v.owner_id FROM nodes n
         JOIN vaults v ON v.id = n.vault_id WHERE n.id = $1`,
        [req.params.id],
      );
      if (own.rowCount === 0) return reply.notFound();
      if (own.rows[0].owner_id !== userId) return reply.forbidden();

      await db.query(`UPDATE nodes SET deleted_at = now() WHERE id = $1`, [req.params.id]);
      return reply.send({ ok: true });
    },
  );

  // ─── GET /:id/versions ────────────────────────────────────
  app.get<{ Params: { id: string } }>(
    '/:id/versions',
    { onRequest: [app.authenticate] },
    async (req, reply) => {
      const userId = req.user.sub;
      const own = await db.query(
        `SELECT v.owner_id FROM nodes n
         JOIN vaults v ON v.id = n.vault_id WHERE n.id = $1`,
        [req.params.id],
      );
      if (own.rowCount === 0) return reply.notFound();
      if (own.rows[0].owner_id !== userId) return reply.forbidden();

      const r = await db.query(
        `SELECT id, version_number, total_size, chunk_count,
                metadata_encrypted, metadata_nonce, created_at
         FROM file_versions WHERE node_id = $1 ORDER BY version_number DESC`,
        [req.params.id],
      );

      return reply.send({
        versions: r.rows.map((v) => ({
          id: v.id,
          versionNumber: v.version_number,
          totalSize: Number(v.total_size),
          chunkCount: v.chunk_count,
          metadataEncrypted: v.metadata_encrypted ? toB64(v.metadata_encrypted) : null,
          metadataNonce: v.metadata_nonce ? toB64(v.metadata_nonce) : null,
          createdAt: v.created_at,
        })),
      });
    },
  );
};

export default nodeRoutes;
