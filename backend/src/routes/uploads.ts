/**
 * Flujo de upload zero-knowledge:
 *
 *   1. Cliente cifra el archivo en chunks de 4 MiB con la file_key.
 *   2. Cliente llama POST /uploads/init con metadatos cifrados y cantidad de chunks.
 *      → backend crea node + file_version + N rows en chunks (sin s3_key aún).
 *      → devuelve N presigned URLs.
 *   3. Cliente hace PUT directo a MinIO con cada chunk (sin tocar el backend).
 *   4. Cliente llama POST /uploads/:versionId/complete con auth_tags + content_hash.
 *      → backend marca la versión como current_version_id del node.
 *
 *  El backend nunca ve el plaintext ni la file_key.
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { db, tx } from '../db/pool.js';
import { presignUpload, presignDownload, generateS3Key, deleteBlob } from '../storage/s3.js';
import { generateDiskKey } from '../storage/disk.js';
import { writeChunk, readChunk, deleteChunk, type VolumeRef } from '../storage/volume-io.js';
import * as registry from '../agents/registry.js';
import { env } from '../config.js';
import { publishChange } from '../db/redis.js';

const bytesB64 = z.string().regex(/^[A-Za-z0-9_-]+$/);

const initUploadSchema = z.object({
  vaultId: z.string().uuid(),
  parentId: z.string().uuid().nullable(),
  nodeId: z.string().uuid().optional(),         // si existe, se crea una versión nueva
  nameEncrypted: bytesB64,
  nameNonce: bytesB64,
  metadataEncrypted: bytesB64,
  metadataNonce: bytesB64,
  fileKeyWrapped: bytesB64,
  fileKeyNonce: bytesB64,
  chunks: z.array(z.object({
    index: z.number().int().min(0),
    ciphertextSize: z.number().int().positive().max(8 * 1024 * 1024),
    nonce: bytesB64,
  })).min(1).max(2048),
  totalSize: z.number().int().positive(),
});

const completeUploadSchema = z.object({
  contentHash: bytesB64,
  chunkAuthTags: z.array(z.object({
    index: z.number().int().min(0),
    authTag: bytesB64,
  })).min(1),
});

const fromB64 = (s: string) => Buffer.from(s, 'base64url');
const toB64 = (b: Buffer | Uint8Array) => Buffer.from(b).toString('base64url');

const uploadRoutes: FastifyPluginAsync = async (app) => {

  app.addContentTypeParser('application/octet-stream', { parseAs: 'buffer' }, (_req, body, done) => {
    done(null, body);
  });

  // ─── POST /init ────────────────────────────────────────────
  app.post('/init', { onRequest: [app.authenticate] }, async (req, reply) => {
    const body = initUploadSchema.parse(req.body);
    const userId = req.user.sub;

    if (body.totalSize > env.MAX_UPLOAD_BYTES) {
      return reply.payloadTooLarge(`file exceeds max ${env.MAX_UPLOAD_BYTES} bytes`);
    }

    // Verifica ownership del vault + cuota
    const vaultRow = await db.query(
      `SELECT owner_id FROM vaults WHERE id = $1`,
      [body.vaultId],
    );
    if (vaultRow.rowCount === 0) return reply.notFound('vault not found');
    if (vaultRow.rows[0].owner_id !== userId) return reply.forbidden();

    const quotaRow = await db.query(
      `SELECT storage_used_bytes, storage_quota_bytes FROM users WHERE id = $1`,
      [userId],
    );
    const used = BigInt(quotaRow.rows[0].storage_used_bytes);
    const quota = BigInt(quotaRow.rows[0].storage_quota_bytes);
    if (used + BigInt(body.totalSize) > quota) {
      return reply.forbidden('storage quota exceeded');
    }

    const result = await tx(async (client) => {
      let nodeId = body.nodeId;

      if (!nodeId) {
        const n = await client.query(
          `INSERT INTO nodes (
            vault_id, parent_id, kind,
            name_encrypted, name_nonce,
            metadata_encrypted, metadata_nonce,
            file_key_wrapped, file_key_nonce
          ) VALUES ($1,$2,'file',$3,$4,$5,$6,$7,$8)
          RETURNING id`,
          [
            body.vaultId, body.parentId,
            fromB64(body.nameEncrypted), fromB64(body.nameNonce),
            fromB64(body.metadataEncrypted), fromB64(body.metadataNonce),
            fromB64(body.fileKeyWrapped), fromB64(body.fileKeyNonce),
          ],
        );
        nodeId = n.rows[0].id;
      } else {
        const own = await client.query(
          `SELECT n.id FROM nodes n
           JOIN vaults v ON v.id = n.vault_id
           WHERE n.id = $1 AND v.owner_id = $2`,
          [nodeId, userId],
        );
        if (own.rowCount === 0) throw new Error('node not found or not owned');
      }

      const versionNumberRow = await client.query(
        `SELECT COALESCE(MAX(version_number), 0) + 1 AS next FROM file_versions WHERE node_id = $1`,
        [nodeId],
      );
      const versionNumber = versionNumberRow.rows[0].next;

      const v = await client.query(
        `INSERT INTO file_versions (
          node_id, version_number, metadata_encrypted, metadata_nonce,
          total_size, chunk_count, content_hash, created_by_device
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
        [
          nodeId, versionNumber,
          fromB64(body.metadataEncrypted), fromB64(body.metadataNonce),
          body.totalSize, body.chunks.length,
          Buffer.alloc(32),                  // hash temporal, se setea en /complete
          req.user.deviceId,
        ],
      );
      const versionId = v.rows[0].id;

      // Select storage backend: prefer the user's active disk volume, fallback
      // to S3. Un volumen de agente (agent_id) solo sirve si su agente está
      // conectado ahora mismo; si está offline, caemos a S3 para no crear chunks
      // que nadie podría escribir.
      const activeVol = await client.query(
        `SELECT id, path, agent_id FROM storage_volumes
          WHERE active = true AND (user_id = $1 OR user_id IS NULL)
          ORDER BY (user_id = $1) DESC NULLS LAST
          LIMIT 1`,
        [userId],
      );
      let diskVolume = activeVol.rows[0] as
        | { id: string; path: string; agent_id: string | null }
        | undefined;
      if (diskVolume?.agent_id && !registry.isOnline(diskVolume.agent_id)) {
        diskVolume = undefined; // agente desconectado → almacenar en S3
      }

      const presignedUrls: Array<{ index: number; uploadUrl: string; s3Key: string }> = [];
      for (const ch of body.chunks) {
        if (diskVolume) {
          const diskKey = generateDiskKey();
          const chunkRow = await client.query(
            `INSERT INTO chunks (version_id, chunk_index, s3_key, ciphertext_size, chunk_nonce, chunk_auth_tag, storage_type, volume_id)
             VALUES ($1,$2,$3,$4,$5,$6,'disk',$7) RETURNING id`,
            [versionId, ch.index, diskKey, ch.ciphertextSize, fromB64(ch.nonce), Buffer.alloc(16), diskVolume.id],
          );
          const chunkId = chunkRow.rows[0].id;
          presignedUrls.push({
            index: ch.index,
            uploadUrl: `${env.PUBLIC_URL}/api/v1/uploads/chunk/${chunkId}`,
            s3Key: diskKey,
          });
        } else {
          const s3Key = generateS3Key();
          await client.query(
            `INSERT INTO chunks (version_id, chunk_index, s3_key, ciphertext_size, chunk_nonce, chunk_auth_tag, storage_type)
             VALUES ($1,$2,$3,$4,$5,$6,'s3')`,
            [versionId, ch.index, s3Key, ch.ciphertextSize, fromB64(ch.nonce), Buffer.alloc(16)],
          );
          const url = await presignUpload(s3Key, ch.ciphertextSize, 600);
          presignedUrls.push({ index: ch.index, uploadUrl: url, s3Key });
        }
      }

      return { nodeId, versionId, presignedUrls };
    });

    return reply.code(201).send(result);
  });

  // ─── POST /:versionId/complete ─────────────────────────────
  app.post<{ Params: { versionId: string } }>(
    '/:versionId/complete',
    { onRequest: [app.authenticate] },
    async (req, reply) => {
      const body = completeUploadSchema.parse(req.body);
      const userId = req.user.sub;

      await tx(async (client) => {
        const ver = await client.query(
          `SELECT fv.id, fv.node_id, fv.total_size, n.vault_id, v.owner_id
           FROM file_versions fv
           JOIN nodes n ON n.id = fv.node_id
           JOIN vaults v ON v.id = n.vault_id
           WHERE fv.id = $1`,
          [req.params.versionId],
        );
        if (ver.rowCount === 0) throw new Error('version not found');
        if (ver.rows[0].owner_id !== userId) throw new Error('forbidden');

        for (const t of body.chunkAuthTags) {
          await client.query(
            `UPDATE chunks SET chunk_auth_tag = $1
             WHERE version_id = $2 AND chunk_index = $3`,
            [fromB64(t.authTag), req.params.versionId, t.index],
          );
        }

        await client.query(
          `UPDATE file_versions SET content_hash = $1 WHERE id = $2`,
          [fromB64(body.contentHash), req.params.versionId],
        );

        await client.query(
          `UPDATE nodes
           SET current_version_id = $1, ciphertext_size = $2, updated_at = now()
           WHERE id = $3`,
          [req.params.versionId, ver.rows[0].total_size, ver.rows[0].node_id],
        );

        await client.query(
          `UPDATE users SET storage_used_bytes = storage_used_bytes + $1 WHERE id = $2`,
          [ver.rows[0].total_size, userId],
        );
      });

      publishChange(userId, { resource: 'nodes', action: 'uploaded' });
      publishChange(userId, { resource: 'storage', action: 'updated' });
      return reply.send({ ok: true });
    },
  );

  // ─── GET /:versionId/download ─────────────────────────────
  app.get<{ Params: { versionId: string } }>(
    '/:versionId/download',
    { onRequest: [app.authenticate] },
    async (req, reply) => {
      const userId = req.user.sub;
      const r = await db.query(
        `SELECT fv.id, fv.node_id, fv.total_size, fv.chunk_count, fv.content_hash,
                fv.metadata_encrypted, fv.metadata_nonce,
                n.file_key_wrapped, n.file_key_nonce, n.vault_id,
                v.owner_id, v.vault_key_wrapped, v.vault_key_nonce
         FROM file_versions fv
         JOIN nodes n ON n.id = fv.node_id
         JOIN vaults v ON v.id = n.vault_id
         WHERE fv.id = $1`,
        [req.params.versionId],
      );
      if (r.rowCount === 0) return reply.notFound();
      const fv = r.rows[0];

      const hasAccess = fv.owner_id === userId
        || (await db.query(
          `SELECT 1 FROM shares
           WHERE node_id = $1 AND shared_with = $2 AND revoked_at IS NULL
                 AND (expires_at IS NULL OR expires_at > now())`,
          [fv.node_id, userId],
        )).rowCount! > 0;
      if (!hasAccess) return reply.forbidden();

      const chunks = await db.query(
        `SELECT id, chunk_index, s3_key, ciphertext_size, chunk_nonce, storage_type, volume_id
         FROM chunks WHERE version_id = $1 ORDER BY chunk_index ASC`,
        [req.params.versionId],
      );

      const chunkResponses = await Promise.all(
        chunks.rows.map(async (c) => ({
          index: c.chunk_index,
          ciphertextSize: Number(c.ciphertext_size),
          nonce: toB64(c.chunk_nonce),
          downloadUrl: c.storage_type === 'disk'
            ? `${env.PUBLIC_URL}/api/v1/uploads/chunk/${c.id}/data`
            : await presignDownload(c.s3_key, 600),
        })),
      );

      return reply.send({
        versionId: fv.id,
        totalSize: Number(fv.total_size),
        chunkCount: fv.chunk_count,
        contentHash: toB64(fv.content_hash),
        metadataEncrypted: toB64(fv.metadata_encrypted),
        metadataNonce: toB64(fv.metadata_nonce),
        fileKeyWrapped: toB64(fv.file_key_wrapped),
        fileKeyNonce: toB64(fv.file_key_nonce),
        vaultKeyWrapped: toB64(fv.vault_key_wrapped),
        vaultKeyNonce: toB64(fv.vault_key_nonce),
        chunks: chunkResponses,
      });
    },
  );

  // ─── DELETE /:versionId ─ borrar blobs físicos ────────────
  app.delete<{ Params: { versionId: string } }>(
    '/:versionId',
    { onRequest: [app.authenticate] },
    async (req, reply) => {
      const userId = req.user.sub;
      const own = await db.query(
        `SELECT v.owner_id, fv.total_size, fv.node_id
         FROM file_versions fv
         JOIN nodes n ON n.id = fv.node_id
         JOIN vaults v ON v.id = n.vault_id
         WHERE fv.id = $1`,
        [req.params.versionId],
      );
      if (own.rowCount === 0) return reply.notFound();
      if (own.rows[0].owner_id !== userId) return reply.forbidden();

      const chunks = await db.query(
        `SELECT s3_key, storage_type, volume_id FROM chunks WHERE version_id = $1`,
        [req.params.versionId],
      );

      for (const c of chunks.rows) {
        try {
          if (c.storage_type === 'disk' && c.volume_id) {
            const vol = await db.query(`SELECT path, agent_id FROM storage_volumes WHERE id = $1`, [c.volume_id]);
            if (vol.rows[0]) {
              await deleteChunk({ path: vol.rows[0].path, agentId: vol.rows[0].agent_id }, c.s3_key);
            }
          } else {
            await deleteBlob(c.s3_key);
          }
        } catch { /* ignore cleanup errors (p.ej. agente offline; se limpia luego) */ }
      }

      await tx(async (client) => {
        await client.query(`DELETE FROM file_versions WHERE id = $1`, [req.params.versionId]);
        await client.query(
          `UPDATE users SET storage_used_bytes = GREATEST(0, storage_used_bytes - $1) WHERE id = $2`,
          [own.rows[0].total_size, userId],
        );
      });

      return reply.send({ ok: true });
    },
  );

  // ─── PUT /chunk/:chunkId — upload encrypted chunk to disk ──
  app.put<{ Params: { chunkId: string } }>(
    '/chunk/:chunkId',
    { onRequest: [app.authenticate], bodyLimit: 8 * 1024 * 1024 },
    async (req, reply) => {
      const userId = req.user.sub;
      const r = await db.query(
        `SELECT c.id, c.s3_key, c.volume_id, c.storage_type,
                v.owner_id
         FROM chunks c
         JOIN file_versions fv ON fv.id = c.version_id
         JOIN nodes n ON n.id = fv.node_id
         JOIN vaults v ON v.id = n.vault_id
         WHERE c.id = $1`,
        [req.params.chunkId],
      );
      if (r.rowCount === 0) return reply.notFound();
      if (r.rows[0].owner_id !== userId) return reply.forbidden();
      if (r.rows[0].storage_type !== 'disk') return reply.badRequest('chunk is not disk-backed');

      const vol = await db.query(
        `SELECT path, agent_id FROM storage_volumes WHERE id = $1`,
        [r.rows[0].volume_id],
      );
      if (vol.rowCount === 0) return reply.notFound('volume not found');
      const volRef: VolumeRef = { path: vol.rows[0].path, agentId: vol.rows[0].agent_id };

      const data = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body as any);

      try {
        await writeChunk(volRef, r.rows[0].s3_key, data);
      } catch (err: any) {
        if (err?.message === 'agent-offline') {
          return reply.code(409).send({ error: 'agent-offline', message: 'el disco de tu agente no está conectado' });
        }
        req.log.warn({ err: err?.message }, 'write-chunk falló');
        return reply.code(502).send({ error: 'storage-error', message: 'no se pudo guardar el chunk' });
      }
      return reply.send({ ok: true });
    },
  );

  // ─── GET /chunk/:chunkId/data — download encrypted chunk from disk
  app.get<{ Params: { chunkId: string } }>(
    '/chunk/:chunkId/data',
    { onRequest: [app.authenticate] },
    async (req, reply) => {
      const userId = req.user.sub;
      const r = await db.query(
        `SELECT c.id, c.s3_key, c.volume_id, c.storage_type,
                v.owner_id, n.vault_id
         FROM chunks c
         JOIN file_versions fv ON fv.id = c.version_id
         JOIN nodes n ON n.id = fv.node_id
         JOIN vaults v ON v.id = n.vault_id
         WHERE c.id = $1`,
        [req.params.chunkId],
      );
      if (r.rowCount === 0) return reply.notFound();

      const row = r.rows[0];
      const hasAccess = row.owner_id === userId
        || (await db.query(
          `SELECT 1 FROM shares
           WHERE node_id IN (SELECT node_id FROM file_versions WHERE id = (SELECT version_id FROM chunks WHERE id = $1))
             AND shared_with = $2 AND revoked_at IS NULL
             AND (expires_at IS NULL OR expires_at > now())`,
          [req.params.chunkId, userId],
        )).rowCount! > 0;
      if (!hasAccess) return reply.forbidden();

      if (row.storage_type !== 'disk') return reply.badRequest('chunk is not disk-backed');

      const vol = await db.query(
        `SELECT path, agent_id FROM storage_volumes WHERE id = $1`,
        [row.volume_id],
      );
      if (vol.rowCount === 0) return reply.notFound('volume not found');
      const volRef: VolumeRef = { path: vol.rows[0].path, agentId: vol.rows[0].agent_id };

      let data: Buffer;
      try {
        data = await readChunk(volRef, row.s3_key);
      } catch (err: any) {
        if (err?.message === 'agent-offline') {
          return reply.code(409).send({ error: 'agent-offline', message: 'el disco de tu agente no está conectado' });
        }
        req.log.warn({ err: err?.message }, 'read-chunk falló');
        return reply.code(502).send({ error: 'storage-error', message: 'no se pudo leer el chunk' });
      }
      return reply.type('application/octet-stream').send(data);
    },
  );
};

export default uploadRoutes;
