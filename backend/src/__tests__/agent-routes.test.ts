/**
 * Tests de integración del plugin del agente ("Noctcom Connector").
 *
 * Cubre la lógica de seguridad propia: emparejamiento por código de un solo uso
 * (válido / reusado / expirado / código erróneo), listado y revocado, y la
 * verificación de firma Ed25519 que usa el canal WS (challenge-auth) probada de
 * forma aislada con el mismo primitivo que el handler. El cableado del socket WS
 * se valida E2E con el agente Rust / dogfooding manual.
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { randomUUID, randomBytes } from 'node:crypto';
import sodium from 'libsodium-wrappers-sumo';

vi.mock('../config.js', () => ({
  env: {
    NODE_ENV: 'test',
    FRONTEND_URL: 'https://noctcom.com',
    PUBLIC_URL: 'https://api.noctcom.com',
    JWT_SECRET: 'test-secret-must-be-at-least-32-chars-long',
    S3_ENDPOINT: 'https://s3.example.com',
    S3_REGION: 'us-east-005',
    S3_ACCESS_KEY: 'test-access',
    S3_SECRET_KEY: 'test-secret',
    S3_BUCKET: 'test-bucket',
    AGENT_LATEST_VERSION: '9.9.9',
  },
}));
vi.mock('../db/pool.js', async () => ({ db: (await import('./fake-db.js')).db }));
vi.mock('../db/redis.js', () => ({ publishChange: vi.fn(() => {}) }));

import Fastify, { type FastifyInstance } from 'fastify';
import sensible from '@fastify/sensible';
import jwt from '@fastify/jwt';
import websocket from '@fastify/websocket';
import agentRoutes from '../routes/agent.js';
import { resetDb, seedUser, store } from './fake-db.js';
import * as registry from '../agents/registry.js';

const JWT_SECRET = 'test-secret-must-be-at-least-32-chars-long';
const b64 = (n = 24) => randomBytes(n).toString('base64url');

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify();
  await app.register(sensible);
  await app.register(jwt, { secret: JWT_SECRET });
  await app.register(websocket);
  app.decorate('authenticate', async (req: any, reply: any) => {
    const sub = req.headers['x-test-sub'];
    if (!sub) return reply.unauthorized('sin sesión de test');
    req.user = { sub, deviceId: req.headers['x-test-device'] ?? null };
  });
  await app.register(agentRoutes);
  await app.ready();
  return app;
}

describe('rutas del agente (pairing)', () => {
  let app: FastifyInstance;
  let userId: string;

  beforeAll(async () => {
    await sodium.ready;
    app = await buildApp();
  });

  beforeEach(() => {
    resetDb();
    registry._reset();
    userId = randomUUID();
    seedUser({ id: userId, username: 'noctuser' });
  });

  async function begin(sub = userId) {
    const res = await app.inject({
      method: 'POST',
      url: '/pair/begin',
      headers: { 'x-test-sub': sub },
      payload: { nameEncrypted: b64(48), nameNonce: b64(24) },
    });
    return res;
  }

  function complete(code: string, platform = 'windows') {
    return app.inject({
      method: 'POST',
      url: '/pair/complete',
      payload: { code, agentPublicKey: randomBytes(32).toString('base64url'), platform },
    });
  }

  it('pair/begin exige sesión', async () => {
    const res = await app.inject({ method: 'POST', url: '/pair/begin', payload: { nameEncrypted: b64(), nameNonce: b64() } });
    expect(res.statusCode).toBe(401);
  });

  it('empareja un agente con un código válido', async () => {
    const b = await begin();
    expect(b.statusCode).toBe(200);
    const { code } = b.json();
    expect(typeof code).toBe('string');

    const c = await complete(code);
    expect(c.statusCode).toBe(201);
    expect(c.json().agentId).toBeTruthy();

    // Aparece en el listado del usuario.
    const list = await app.inject({ method: 'GET', url: '/', headers: { 'x-test-sub': userId } });
    expect(list.statusCode).toBe(200);
    expect(list.json()).toHaveLength(1);
    expect(list.json()[0].online).toBe(false);
  });

  it('un código es de un solo uso (no se puede reutilizar)', async () => {
    const { code } = (await begin()).json();
    expect((await complete(code)).statusCode).toBe(201);
    expect((await complete(code)).statusCode).toBe(401); // ya usado
  });

  it('rechaza un código inexistente', async () => {
    await begin();
    expect((await complete('ZZZZZZZZ')).statusCode).toBe(401);
  });

  it('rechaza un código expirado', async () => {
    const { code } = (await begin()).json();
    // Forzamos la expiración del token en el almacén.
    store.pairingTokens.forEach((t) => { t.expires_at = new Date(Date.now() - 1000); });
    expect((await complete(code)).statusCode).toBe(401);
  });

  it('revoca un agente y desaparece del listado', async () => {
    const { code } = (await begin()).json();
    const agentId = (await complete(code)).json().agentId;

    const del = await app.inject({ method: 'DELETE', url: `/${agentId}`, headers: { 'x-test-sub': userId } });
    expect(del.statusCode).toBe(200);

    const list = await app.inject({ method: 'GET', url: '/', headers: { 'x-test-sub': userId } });
    expect(list.json()).toHaveLength(0);
  });

  it('no se puede revocar el agente de otro usuario', async () => {
    const { code } = (await begin()).json();
    const agentId = (await complete(code)).json().agentId;
    const otro = randomUUID();
    const del = await app.inject({ method: 'DELETE', url: `/${agentId}`, headers: { 'x-test-sub': otro } });
    expect(del.statusCode).toBe(404);
  });
});

describe('GET /version (auto-update)', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });

  it('devuelve la última versión y un downloadUrl para una plataforma con binario', async () => {
    const res = await app.inject({ method: 'GET', url: '/version?platform=windows' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.version).toBe('9.9.9');
    expect(body.available).toBe(true);
    expect(body.downloadUrl).toBe('/api/v1/agent/download?platform=windows');
  });

  it('marca no disponible (sin binario) para una plataforma aún no publicada', async () => {
    const res = await app.inject({ method: 'GET', url: '/version?platform=linux' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.version).toBe('9.9.9');
    expect(body.available).toBe(false);
    expect(body.downloadUrl).toBeNull();
  });
});

describe('challenge-auth del agente (firma Ed25519)', () => {
  beforeAll(async () => { await sodium.ready; });

  it('una firma válida del nonce verifica; una manipulada no', () => {
    const kp = sodium.crypto_sign_keypair(); // mismo esquema que el agente
    const nonce = randomBytes(32);
    const sig = sodium.crypto_sign_detached(new Uint8Array(nonce), kp.privateKey);

    // Lo que hace el handler WS: verify_detached(sig, nonce, agent_public_key)
    expect(sodium.crypto_sign_verify_detached(sig, new Uint8Array(nonce), kp.publicKey)).toBe(true);

    const tampered = new Uint8Array(sig);
    tampered[0] ^= 0xff;
    expect(sodium.crypto_sign_verify_detached(tampered, new Uint8Array(nonce), kp.publicKey)).toBe(false);

    // Firmar un nonce distinto tampoco vale (anti-replay del reto).
    const otherNonce = randomBytes(32);
    expect(sodium.crypto_sign_verify_detached(sig, new Uint8Array(otherNonce), kp.publicKey)).toBe(false);
  });
});
