import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { db } from '../db/pool.js';

const bytesB64 = z.string().regex(/^[A-Za-z0-9_-]+$/);
const fromB64 = (s: string) => Buffer.from(s, 'base64url');
const toB64 = (b: Buffer | Uint8Array) => Buffer.from(b).toString('base64url');

const createVaultSchema = z.object({
  nameEncrypted: bytesB64,
  nameNonce: bytesB64,
  vaultKeyWrapped: bytesB64,
  vaultKeyNonce: bytesB64,
  // Recovery v2: vault_key sellada a la recovery box key del usuario
  vaultKeySealedRecovery: bytesB64.optional(),
});

const vaultRoutes: FastifyPluginAsync = async (app) => {

  app.get('/', { onRequest: [app.authenticate] }, async (req, reply) => {
    const r = await db.query(
      `SELECT id, name_encrypted, name_nonce, vault_key_wrapped, vault_key_nonce, created_at
       FROM vaults WHERE owner_id = $1 ORDER BY created_at ASC`,
      [req.user.sub],
    );
    return reply.send({
      vaults: r.rows.map((v) => ({
        id: v.id,
        nameEncrypted: toB64(v.name_encrypted),
        nameNonce: toB64(v.name_nonce),
        vaultKeyWrapped: toB64(v.vault_key_wrapped),
        vaultKeyNonce: toB64(v.vault_key_nonce),
        createdAt: v.created_at,
      })),
    });
  });

  app.post('/', { onRequest: [app.authenticate] }, async (req, reply) => {
    const body = createVaultSchema.parse(req.body);
    const r = await db.query(
      `INSERT INTO vaults (owner_id, name_encrypted, name_nonce, vault_key_wrapped, vault_key_nonce,
                           vault_key_sealed_recovery)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, created_at`,
      [
        req.user.sub,
        fromB64(body.nameEncrypted), fromB64(body.nameNonce),
        fromB64(body.vaultKeyWrapped), fromB64(body.vaultKeyNonce),
        body.vaultKeySealedRecovery ? fromB64(body.vaultKeySealedRecovery) : null,
      ],
    );
    return reply.code(201).send({ id: r.rows[0].id, createdAt: r.rows[0].created_at });
  });
};

export default vaultRoutes;
