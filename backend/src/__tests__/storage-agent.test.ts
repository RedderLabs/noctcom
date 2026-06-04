/**
 * M1: enrutado de GET /storage/disks al agente, y correlación del registry.
 *
 * Simula un agente conectado con un socket falso que responde al instante al
 * comando `list-disks`. Cubre: listado vía agente, agente ajeno (404), agente
 * desconectado (409); y el request/response correlacionado del registry.
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { randomUUID } from 'node:crypto';

vi.mock('../config.js', () => ({
  env: { NODE_ENV: 'test', FRONTEND_URL: 'https://noctcom.com', PUBLIC_URL: 'https://api.noctcom.com', JWT_SECRET: 'test-secret-must-be-at-least-32-chars-long' },
}));
vi.mock('../db/pool.js', async () => {
  const f = await import('./fake-db.js');
  return { db: f.db, tx: f.tx };
});

import Fastify, { type FastifyInstance } from 'fastify';
import sensible from '@fastify/sensible';
import jwt from '@fastify/jwt';
import storageRoutes from '../routes/storage.js';
import { resetDb, store } from './fake-db.js';
import * as registry from '../agents/registry.js';

const JWT_SECRET = 'test-secret-must-be-at-least-32-chars-long';

const FAKE_DISKS = [
  { id: 'C:', device: 'C:', path: 'C:\\', label: 'Windows', totalBytes: 500_000, freeBytes: 200_000, usedBytes: 300_000, filesystem: 'ntfs', removable: false, active: false, mounted: true, needsFormat: false },
];

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify();
  await app.register(sensible);
  await app.register(jwt, { secret: JWT_SECRET });
  app.decorate('authenticate', async (req: any, reply: any) => {
    const sub = req.headers['x-test-sub'];
    if (!sub) return reply.unauthorized('sin sesión');
    req.user = { sub, deviceId: null };
  });
  await app.register(storageRoutes);
  await app.ready();
  return app;
}

/** Conecta un agente falso que responde a list-disks con FAKE_DISKS al instante. */
function connectFakeAgent(agentId: string, userId: string) {
  const socket = {
    readyState: 1,
    close() {},
    send(data: string) {
      const msg = JSON.parse(data);
      if (msg.type === 'cmd' && msg.cmd === 'list-disks') {
        registry.resolveResponse(agentId, msg.id, true, { disks: FAKE_DISKS });
      }
    },
  };
  registry.addConnection(agentId, userId, socket);
}

function seedAgent(id: string, userId: string) {
  store.agents.push({
    id, user_id: userId, agent_public_key: Buffer.alloc(32), name_encrypted: Buffer.alloc(8),
    name_nonce: Buffer.alloc(24), platform: 'windows', last_seen_at: new Date(), created_at: 1, revoked_at: null,
  });
}

describe('GET /storage/disks vía agente', () => {
  let app: FastifyInstance;
  let userId: string;
  let agentId: string;

  beforeAll(async () => { app = await buildApp(); });
  beforeEach(() => {
    resetDb();
    registry._reset();
    userId = randomUUID();
    agentId = randomUUID();
  });

  it('lista los discos que reporta el agente conectado', async () => {
    seedAgent(agentId, userId);
    connectFakeAgent(agentId, userId);
    const res = await app.inject({
      method: 'GET', url: `/disks?agentId=${agentId}`, headers: { 'x-test-sub': userId },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().disks).toEqual(FAKE_DISKS);
  });

  it('404 si el agente no es del usuario', async () => {
    seedAgent(agentId, randomUUID()); // de otro usuario
    connectFakeAgent(agentId, userId);
    const res = await app.inject({
      method: 'GET', url: `/disks?agentId=${agentId}`, headers: { 'x-test-sub': userId },
    });
    expect(res.statusCode).toBe(404);
  });

  it('409 si el agente está desconectado', async () => {
    seedAgent(agentId, userId); // existe pero no hay conexión en el registry
    const res = await app.inject({
      method: 'GET', url: `/disks?agentId=${agentId}`, headers: { 'x-test-sub': userId },
    });
    expect(res.statusCode).toBe(409);
  });
});

describe('registry: correlación de comandos', () => {
  beforeEach(() => registry._reset());

  it('resuelve con la respuesta del agente', async () => {
    const id = 'a1';
    registry.addConnection(id, 'u1', {
      readyState: 1, close() {},
      send(data: string) {
        const m = JSON.parse(data);
        registry.resolveResponse(id, m.id, true, { ok: 1 });
      },
    });
    await expect(registry.sendCommand(id, 'ping', {})).resolves.toEqual({ ok: 1 });
  });

  it('rechaza si el agente está offline', async () => {
    await expect(registry.sendCommand('nope', 'ping', {})).rejects.toThrow(/offline/);
  });

  it('rechaza por timeout si no responde', async () => {
    const id = 'a2';
    registry.addConnection(id, 'u1', { readyState: 1, close() {}, send() { /* no responde */ } });
    await expect(registry.sendCommand(id, 'ping', {}, 50)).rejects.toThrow(/timeout/);
  });
});
