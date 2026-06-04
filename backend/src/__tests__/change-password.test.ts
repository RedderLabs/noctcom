/**
 * Tests del cambio de contraseña maestra (auth.ts), montando authRoutes con
 * Fastify.inject() + fake-db.
 *
 * El backend NO re-deriva Argon2: solo verifica la firma del challenge contra
 * la identity_public_key guardada. Por eso los tests usan un par Ed25519 directo
 * como "identidad" (rápido, sin Argon2) y firman el challenge con su privada.
 *
 * Cubre: re-cifrado de vault keys + reemplazo de claves del usuario, prueba de
 * la contraseña actual (firma), challenge de un solo uso, no tocar vaults ajenos,
 * y revocación de sesiones de otros dispositivos.
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { randomUUID, randomBytes } from 'node:crypto';

vi.mock('../db/pool.js', async () => {
  const f = await import('./fake-db.js');
  return { db: f.db, tx: f.tx };
});
vi.mock('../mail.js', () => ({ sendVerificationEmail: vi.fn(async () => {}), normalizeLocale: () => 'es' }));
vi.mock('../storage/s3.js', () => ({ deleteBlob: vi.fn(async () => {}) }));
vi.mock('../storage/disk.js', () => ({ deleteFromDisk: vi.fn(async () => {}) }));
vi.mock('../session.js', () => ({
  issueSession: vi.fn(async () => ({ accessToken: 'a', refreshToken: 'r' })),
  hashIp: () => Buffer.alloc(32),
  newRefreshToken: () => ({ plain: 'r', hash: Buffer.alloc(32) }),
}));

import Fastify, { type FastifyInstance } from 'fastify';
import sensible from '@fastify/sensible';
import jwt from '@fastify/jwt';
import sodium from 'libsodium-wrappers-sumo';
import authRoutes from '../routes/auth.js';
import { resetDb, seedUser, seedVault, store } from './fake-db.js';

const JWT_SECRET = 'test-secret-must-be-at-least-32-chars-long';
const b64 = (b: Uint8Array | Buffer) => Buffer.from(b).toString('base64url');
const fromB64 = (s: string) => Buffer.from(s, 'base64url');

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify();
  await app.register(sensible);
  await app.register(jwt, { secret: JWT_SECRET });
  app.decorate('authenticate', async (req: any, reply: any) => {
    const sub = req.headers['x-test-sub'];
    if (!sub) return reply.unauthorized('sin sesión de test');
    req.user = { sub, deviceId: req.headers['x-test-device'] ?? null };
  });
  await app.register(authRoutes);
  await app.ready();
  return app;
}

describe('cambio de contraseña maestra (auth)', () => {
  let app: FastifyInstance;
  let userId: string;
  let vaultId: string;
  let identityKp: sodium.KeyPair;

  beforeAll(async () => {
    await sodium.ready;
    app = await buildApp();
  });

  beforeEach(() => {
    resetDb();
    userId = randomUUID();
    vaultId = randomUUID();
    identityKp = sodium.crypto_sign_keypair();
    seedUser({
      id: userId,
      identity_public_key: Buffer.from(identityKp.publicKey),
      kdf_salt: randomBytes(16),
      kdf_ops_limit: 3,
      kdf_mem_limit: 268435456,
    });
    seedVault({ id: vaultId, owner_id: userId });
  });

  async function begin(sub = userId): Promise<{ challenge: string; kdfSalt: string }> {
    const res = await app.inject({
      method: 'POST', url: '/change-password/begin', headers: { 'x-test-sub': sub },
    });
    expect(res.statusCode).toBe(200);
    return res.json();
  }

  function finalizePayload(challenge: string, signKp = identityKp, extra: Record<string, unknown> = {}) {
    const newIdentity = sodium.crypto_sign_keypair();
    return {
      challenge,
      signature: b64(sodium.crypto_sign_detached(fromB64(challenge), signKp.privateKey)),
      newOpaqueRecord: b64(randomBytes(64)),
      newKdfSalt: b64(randomBytes(16)),
      newKdfOpsLimit: 3,
      newKdfMemLimit: 268435456,
      newIdentityPublicKey: b64(newIdentity.publicKey),
      newIdentityPrivateKeyWrapped: b64(randomBytes(80)),
      newIdentityPrivateKeyNonce: b64(randomBytes(24)),
      newExchangePrivateKeyWrapped: b64(randomBytes(48)),
      newExchangePrivateKeyNonce: b64(randomBytes(24)),
      vaults: [{ id: vaultId, vaultKeyWrapped: b64(randomBytes(48)), vaultKeyNonce: b64(randomBytes(24)) }],
      ...extra,
    };
  }

  it('re-cifra vault keys y reemplaza las claves del usuario con la firma correcta', async () => {
    const { challenge } = await begin();
    const oldSalt = store.users.get(userId)!.kdf_salt;
    const payload = finalizePayload(challenge);

    const res = await app.inject({
      method: 'POST', url: '/change-password/finalize',
      headers: { 'x-test-sub': userId, 'x-test-device': randomUUID() },
      payload,
    });
    expect(res.statusCode).toBe(200);

    const u = store.users.get(userId)!;
    expect(u.kdf_salt).not.toEqual(oldSalt); // KDF salt cambió
    expect(u.identity_public_key).toEqual(fromB64(payload.newIdentityPublicKey)); // identidad rotada

    const v = store.vaults.find((x) => x.id === vaultId)!;
    expect(v.vault_key_wrapped).toEqual(fromB64(payload.vaults[0].vaultKeyWrapped)); // re-envuelta
  });

  it('rechaza si la contraseña actual es incorrecta (firma de otra identity key)', async () => {
    const { challenge } = await begin();
    const otra = sodium.crypto_sign_keypair();
    const res = await app.inject({
      method: 'POST', url: '/change-password/finalize',
      headers: { 'x-test-sub': userId },
      payload: finalizePayload(challenge, otra),
    });
    expect(res.statusCode).toBe(401);
  });

  it('el challenge es de un solo uso (anti-replay)', async () => {
    const { challenge } = await begin();
    const first = await app.inject({
      method: 'POST', url: '/change-password/finalize',
      headers: { 'x-test-sub': userId }, payload: finalizePayload(challenge),
    });
    expect(first.statusCode).toBe(200);

    const replay = await app.inject({
      method: 'POST', url: '/change-password/finalize',
      headers: { 'x-test-sub': userId }, payload: finalizePayload(challenge),
    });
    expect(replay.statusCode).toBe(401);
  });

  it('no permite re-cifrar vaults de otro usuario', async () => {
    const otroVault = randomUUID();
    seedVault({ id: otroVault, owner_id: randomUUID() });
    const { challenge } = await begin();
    const res = await app.inject({
      method: 'POST', url: '/change-password/finalize',
      headers: { 'x-test-sub': userId },
      payload: finalizePayload(challenge, identityKp, {
        vaults: [{ id: otroVault, vaultKeyWrapped: b64(randomBytes(48)), vaultKeyNonce: b64(randomBytes(24)) }],
      }),
    });
    expect(res.statusCode).toBe(400);
  });

  it('revoca las sesiones de otros dispositivos', async () => {
    const { challenge } = await begin();
    const res = await app.inject({
      method: 'POST', url: '/change-password/finalize',
      headers: { 'x-test-sub': userId, 'x-test-device': randomUUID() },
      payload: finalizePayload(challenge),
    });
    expect(res.statusCode).toBe(200);
    expect(store.revokedSessionsFor).toContain(userId);
  });
});
