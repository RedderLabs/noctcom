import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { db, tx } from '../db/pool.js';
import { presignDownload, presignUpload, generateS3Key } from '../storage/s3.js';
import { readFromDisk, generateDiskKey } from '../storage/disk.js';
import { env } from '../config.js';
import { s3 } from '../storage/s3.js';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import yazl from 'yazl';
import { Readable } from 'node:stream';

const bytesB64 = z.string().regex(/^[A-Za-z0-9_-]+$/);
const toB64 = (b: Buffer | Uint8Array) => Buffer.from(b).toString('base64url');

// ─── Export ──────────────────────────────────────────────────────

const vaultExportRoutes: FastifyPluginAsync = async (app) => {

  app.get<{ Params: { vaultId: string } }>(
    '/:vaultId/export',
    { onRequest: [app.authenticate] },
    async (req, reply) => {
      const userId = req.user.sub;
      const { vaultId } = req.params;

      const vaultRow = await db.query(
        `SELECT v.id, v.name_encrypted, v.name_nonce, v.vault_key_wrapped, v.vault_key_nonce,
                u.kdf_salt, u.kdf_ops_limit, u.kdf_mem_limit
         FROM vaults v
         JOIN users u ON u.id = v.owner_id
         WHERE v.id = $1 AND v.owner_id = $2`,
        [vaultId, userId],
      );
      if (vaultRow.rowCount === 0) return reply.notFound('vault not found');
      const vault = vaultRow.rows[0];

      const nodesRows = await db.query(
        `SELECT n.id, n.parent_id, n.kind, n.name_encrypted, n.name_nonce,
                n.metadata_encrypted, n.metadata_nonce,
                n.file_key_wrapped, n.file_key_nonce,
                n.ciphertext_size, n.starred, n.created_at, n.updated_at,
                n.current_version_id
         FROM nodes n
         WHERE n.vault_id = $1 AND n.deleted_at IS NULL
         ORDER BY n.kind ASC, n.created_at ASC`,
        [vaultId],
      );

      const nodes: any[] = [];
      const chunkMap: Map<string, { nodeId: string; chunks: any[] }> = new Map();

      for (const n of nodesRows.rows) {
        const node: any = {
          id: n.id,
          parentId: n.parent_id,
          kind: n.kind,
          nameEncrypted: toB64(n.name_encrypted),
          nameNonce: toB64(n.name_nonce),
          metadataEncrypted: n.metadata_encrypted ? toB64(n.metadata_encrypted) : null,
          metadataNonce: n.metadata_nonce ? toB64(n.metadata_nonce) : null,
          fileKeyWrapped: n.file_key_wrapped ? toB64(n.file_key_wrapped) : null,
          fileKeyNonce: n.file_key_nonce ? toB64(n.file_key_nonce) : null,
          starred: n.starred,
          createdAt: n.created_at,
          updatedAt: n.updated_at,
        };

        if (n.kind === 'file' && n.current_version_id) {
          const vr = await db.query(
            `SELECT version_number, total_size, chunk_count, content_hash,
                    metadata_encrypted, metadata_nonce
             FROM file_versions WHERE id = $1`,
            [n.current_version_id],
          );
          if (vr.rowCount! > 0) {
            const v = vr.rows[0];
            const cr = await db.query(
              `SELECT chunk_index, ciphertext_size, chunk_nonce, chunk_auth_tag, s3_key, storage_type, volume_id
               FROM chunks WHERE version_id = $1 ORDER BY chunk_index ASC`,
              [n.current_version_id],
            );
            node.version = {
              versionNumber: v.version_number,
              totalSize: Number(v.total_size),
              chunkCount: v.chunk_count,
              contentHash: toB64(v.content_hash),
              metadataEncrypted: v.metadata_encrypted ? toB64(v.metadata_encrypted) : null,
              metadataNonce: v.metadata_nonce ? toB64(v.metadata_nonce) : null,
              chunks: cr.rows.map((c) => ({
                index: c.chunk_index,
                ciphertextSize: Number(c.ciphertext_size),
                nonce: toB64(c.chunk_nonce),
                authTag: toB64(c.chunk_auth_tag),
              })),
            };
            chunkMap.set(n.id, {
              nodeId: n.id,
              chunks: cr.rows.map((c) => ({
                index: c.chunk_index,
                s3Key: c.s3_key,
                storageType: c.storage_type,
                volumeId: c.volume_id,
              })),
            });
          }
        }
        nodes.push(node);
      }

      const manifest = {
        version: 1,
        exportedAt: new Date().toISOString(),
        generator: 'noctcom-api/0.1.0',
        crypto: {
          kdfAlgorithm: 'argon2id',
          kdfSalt: toB64(vault.kdf_salt),
          kdfOpsLimit: vault.kdf_ops_limit,
          kdfMemLimit: Number(vault.kdf_mem_limit),
        },
        vault: {
          nameEncrypted: toB64(vault.name_encrypted),
          nameNonce: toB64(vault.name_nonce),
          vaultKeyWrapped: toB64(vault.vault_key_wrapped),
          vaultKeyNonce: toB64(vault.vault_key_nonce),
        },
        nodes,
      };

      const zip = new yazl.ZipFile();
      zip.addBuffer(Buffer.from(JSON.stringify(manifest, null, 2)), 'manifest.json');

      for (const [nodeId, entry] of chunkMap) {
        for (const chunk of entry.chunks) {
          let data: Buffer;
          if (chunk.storageType === 'disk' && chunk.volumeId) {
            const vol = await db.query(`SELECT path FROM storage_volumes WHERE id = $1`, [chunk.volumeId]);
            if (vol.rows[0]) {
              data = await readFromDisk(vol.rows[0].path, chunk.s3Key);
            } else {
              continue;
            }
          } else {
            const resp = await s3.send(new GetObjectCommand({
              Bucket: env.S3_BUCKET,
              Key: chunk.s3Key,
            }));
            data = Buffer.from(await resp.Body!.transformToByteArray());
          }
          zip.addBuffer(data, `blobs/${nodeId}/${chunk.index}`);
        }
      }

      zip.end();

      const date = new Date().toISOString().slice(0, 10);
      reply.header('Content-Type', 'application/zip');
      reply.header('Content-Disposition', `attachment; filename="noctcom-export-${date}.noctcom"`);
      return reply.send(Readable.from(zip.outputStream));
    },
  );

  // ─── Import Init ───────────────────────────────────────────────

  const importChunkSchema = z.object({
    index: z.number().int().min(0),
    ciphertextSize: z.number().int().positive(),
    nonce: bytesB64,
    authTag: bytesB64,
  });

  const importVersionSchema = z.object({
    totalSize: z.number().int().positive(),
    chunkCount: z.number().int().positive(),
    contentHash: bytesB64,
    metadataEncrypted: bytesB64.nullable(),
    metadataNonce: bytesB64.nullable(),
    chunks: z.array(importChunkSchema).min(1),
  });

  const importNodeSchema = z.object({
    originalId: z.string(),
    parentOriginalId: z.string().nullable(),
    kind: z.enum(['folder', 'file']),
    nameEncrypted: bytesB64,
    nameNonce: bytesB64,
    metadataEncrypted: bytesB64.nullable(),
    metadataNonce: bytesB64.nullable(),
    fileKeyWrapped: bytesB64.nullable(),
    fileKeyNonce: bytesB64.nullable(),
    starred: z.boolean(),
    version: importVersionSchema.optional(),
  });

  const importInitSchema = z.object({
    nameEncrypted: bytesB64,
    nameNonce: bytesB64,
    vaultKeyWrapped: bytesB64,
    vaultKeyNonce: bytesB64,
    // Recovery v2: vault_key sellada a la recovery box key del usuario
    vaultKeySealedRecovery: bytesB64.optional(),
    nodes: z.array(importNodeSchema),
  });

  const fromB64 = (s: string) => Buffer.from(s, 'base64url');

  app.post(
    '/import/init',
    { onRequest: [app.authenticate], bodyLimit: 2 * 1024 * 1024 },
    async (req, reply) => {
      const userId = req.user.sub;
      const body = importInitSchema.parse(req.body);

      const quotaRow = await db.query(
        `SELECT storage_used_bytes, storage_quota_bytes FROM users WHERE id = $1`,
        [userId],
      );
      const used = BigInt(quotaRow.rows[0].storage_used_bytes);
      const quota = BigInt(quotaRow.rows[0].storage_quota_bytes);
      const totalImportSize = body.nodes.reduce(
        (acc, n) => acc + BigInt(n.version?.totalSize ?? 0), 0n,
      );
      if (used + totalImportSize > quota) {
        return reply.forbidden('storage quota exceeded');
      }

      const result = await tx(async (client) => {
        const vaultRes = await client.query(
          `INSERT INTO vaults (owner_id, name_encrypted, name_nonce, vault_key_wrapped, vault_key_nonce,
                               vault_key_sealed_recovery)
           VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
          [userId, fromB64(body.nameEncrypted), fromB64(body.nameNonce),
           fromB64(body.vaultKeyWrapped), fromB64(body.vaultKeyNonce),
           body.vaultKeySealedRecovery ? fromB64(body.vaultKeySealedRecovery) : null],
        );
        const vaultId = vaultRes.rows[0].id;

        const nodeMap: Record<string, string> = {};
        const chunkUploads: Array<{
          originalNodeId: string;
          chunkIndex: number;
          chunkId: string;
          uploadUrl: string;
        }> = [];

        const folders = body.nodes.filter((n) => n.kind === 'folder');
        const files = body.nodes.filter((n) => n.kind === 'file');

        const sorted: typeof folders = [];
        const remaining = [...folders];
        const resolved = new Set<string>();
        resolved.add('');

        while (remaining.length > 0) {
          const before = remaining.length;
          for (let i = remaining.length - 1; i >= 0; i--) {
            const f = remaining[i]!;
            if (!f.parentOriginalId || resolved.has(f.parentOriginalId)) {
              sorted.push(f);
              resolved.add(f.originalId);
              remaining.splice(i, 1);
            }
          }
          if (remaining.length === before) {
            sorted.push(...remaining);
            break;
          }
        }

        for (const f of sorted) {
          const parentId = f.parentOriginalId ? (nodeMap[f.parentOriginalId] ?? null) : null;
          const nr = await client.query(
            `INSERT INTO nodes (vault_id, parent_id, kind, name_encrypted, name_nonce,
                                metadata_encrypted, metadata_nonce, starred)
             VALUES ($1,$2,'folder',$3,$4,$5,$6,$7) RETURNING id`,
            [vaultId, parentId,
             fromB64(f.nameEncrypted), fromB64(f.nameNonce),
             f.metadataEncrypted ? fromB64(f.metadataEncrypted) : null,
             f.metadataNonce ? fromB64(f.metadataNonce) : null,
             f.starred],
          );
          nodeMap[f.originalId] = nr.rows[0].id;
        }

        const activeVol = await client.query(
          `SELECT id, path FROM storage_volumes WHERE active = true LIMIT 1`,
        );
        const diskVolume = activeVol.rows[0] as { id: string; path: string } | undefined;

        for (const f of files) {
          const parentId = f.parentOriginalId ? (nodeMap[f.parentOriginalId] ?? null) : null;
          const nr = await client.query(
            `INSERT INTO nodes (vault_id, parent_id, kind, name_encrypted, name_nonce,
                                metadata_encrypted, metadata_nonce,
                                file_key_wrapped, file_key_nonce, starred)
             VALUES ($1,$2,'file',$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
            [vaultId, parentId,
             fromB64(f.nameEncrypted), fromB64(f.nameNonce),
             f.metadataEncrypted ? fromB64(f.metadataEncrypted) : null,
             f.metadataNonce ? fromB64(f.metadataNonce) : null,
             f.fileKeyWrapped ? fromB64(f.fileKeyWrapped) : null,
             f.fileKeyNonce ? fromB64(f.fileKeyNonce) : null,
             f.starred],
          );
          const newNodeId = nr.rows[0].id;
          nodeMap[f.originalId] = newNodeId;

          if (f.version) {
            const vr = await client.query(
              `INSERT INTO file_versions (node_id, version_number, total_size, chunk_count,
                                          content_hash, metadata_encrypted, metadata_nonce)
               VALUES ($1,1,$2,$3,$4,$5,$6) RETURNING id`,
              [newNodeId, f.version.totalSize, f.version.chunkCount,
               fromB64(f.version.contentHash),
               f.version.metadataEncrypted ? fromB64(f.version.metadataEncrypted) : null,
               f.version.metadataNonce ? fromB64(f.version.metadataNonce) : null],
            );
            const versionId = vr.rows[0].id;

            for (const ch of f.version.chunks) {
              if (diskVolume) {
                const diskKey = generateDiskKey();
                const cr = await client.query(
                  `INSERT INTO chunks (version_id, chunk_index, s3_key, ciphertext_size,
                                       chunk_nonce, chunk_auth_tag, storage_type, volume_id)
                   VALUES ($1,$2,$3,$4,$5,$6,'disk',$7) RETURNING id`,
                  [versionId, ch.index, diskKey, ch.ciphertextSize,
                   fromB64(ch.nonce), fromB64(ch.authTag), diskVolume.id],
                );
                chunkUploads.push({
                  originalNodeId: f.originalId,
                  chunkIndex: ch.index,
                  chunkId: cr.rows[0].id,
                  uploadUrl: `${env.PUBLIC_URL}/api/v1/uploads/chunk/${cr.rows[0].id}`,
                });
              } else {
                const s3Key = generateS3Key();
                const cr = await client.query(
                  `INSERT INTO chunks (version_id, chunk_index, s3_key, ciphertext_size,
                                       chunk_nonce, chunk_auth_tag, storage_type)
                   VALUES ($1,$2,$3,$4,$5,$6,'s3') RETURNING id`,
                  [versionId, ch.index, s3Key, ch.ciphertextSize,
                   fromB64(ch.nonce), fromB64(ch.authTag)],
                );
                const uploadUrl = await presignUpload(s3Key, ch.ciphertextSize, 3600);
                chunkUploads.push({
                  originalNodeId: f.originalId,
                  chunkIndex: ch.index,
                  chunkId: cr.rows[0].id,
                  uploadUrl,
                });
              }
            }

            await client.query(
              `UPDATE nodes SET current_version_id = $1, ciphertext_size = $2 WHERE id = $3`,
              [versionId, f.version.totalSize, newNodeId],
            );
          }
        }

        const totalBytes = body.nodes.reduce((acc, n) => acc + (n.version?.totalSize ?? 0), 0);
        await client.query(
          `UPDATE users SET storage_used_bytes = storage_used_bytes + $1 WHERE id = $2`,
          [totalBytes, userId],
        );

        return { vaultId, nodeMap, chunkUploads };
      });

      return reply.code(201).send(result);
    },
  );

  // ─── Import Complete ───────────────────────────────────────────

  app.post<{ Params: { vaultId: string } }>(
    '/import/:vaultId/complete',
    { onRequest: [app.authenticate] },
    async (req, reply) => {
      const userId = req.user.sub;
      const { vaultId } = req.params;

      const own = await db.query(
        `SELECT owner_id FROM vaults WHERE id = $1`,
        [vaultId],
      );
      if (own.rowCount === 0) return reply.notFound();
      if (own.rows[0].owner_id !== userId) return reply.forbidden();

      return reply.send({ ok: true });
    },
  );
};

export default vaultExportRoutes;
