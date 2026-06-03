/**
 * M2b: POST /storage/disks/agent-format — formateo destructivo vía agente.
 *
 * Verifica las salvaguardas (confirmación de etiqueta, nunca el disco de
 * sistema, ownership+online, step-up obligatorio) y el camino feliz: el agente
 * formatea y el volumen queda registrado y activo (idempotente).
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { randomUUID } from 'node:crypto';

vi.mock('../config.js', () => ({
  env: { NODE_ENV: 'test', FRONTEND_URL: 'https://noctcom.com', PUBLIC_URL: 'https://api.noctcom.com', JWT_SECRET: 'test-secret-must-be-at-least-32-chars-long' },
}));
vi.mock('../db/pool.js', async () => ({ db: (await import('./fake-db.js')).db }));

import Fastify, { type FastifyInstance } from 'fastify';
import sensible from '@fastify/sensible';
import jwt from '@fastify/jwt';
import storageRoutes from '../routes/storage.js';
import { resetDb, store } from './fake-db.js';
import * as registry from '../agents/registry.js';

const JWT_SECRET = 'test-secret-must-be-at-least-32-chars-long';

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

/** Agente falso que responde a format-volume devolviendo el volumen preparado. */
function connectFormattingAgent(agentId: string, userId: string) {
  registry.addConnection(agentId, userId, {
    readyState: 1,
    close() {},
    send(data: string) {
      const m = JSON.parse(data);
      if (m.type === 'cmd' && m.cmd === 'format-volume') {
        const root = `${m.args.driveLetter}:\\`;
        registry.resolveResponse(agentId, m.id, true, { path: root, blobPath: `${root}noctcom-blobs` });
      }
    },
  });
}

function seedAgent(id: string, userId: string) {
  store.agents.push({
    id, user_id: userId, agent_public_key: Buffer.alloc(32), name_encrypted: Buffer.alloc(8),
    name_nonce: Buffer.alloc(24), platform: 'windows', last_seen_at: new Date(), created_at: 1, revoked_at: null,
  });
}

describe('POST /storage/disks/agent-format', () => {
  let app: FastifyInstance;
  let userId: string;
  let agentId: string;
  let stepUp: string;

  beforeAll(async () => { app = await buildApp(); });
  beforeEach(() => {
    resetDb();
    registry._reset();
    userId = randomUUID();
    agentId = randomUUID();
    stepUp = app.jwt.sign({ sub: userId, scope: 'step-up' });
  });

  const body = (over: Record<string, unknown> = {}) => ({
    agentId, driveLetter: 'D', label: 'datos', confirmLabel: 'datos', totalBytes: 1000, ...over,
  });

  it('400 si la etiqueta de confirmación no coincide', async () => {
    const res = await app.inject({
      method: 'POST', url: '/disks/agent-format',
      headers: { 'x-test-sub': userId, 'x-step-up-token': stepUp },
      payload: body({ confirmLabel: 'otra' }),
    });
    expect(res.statusCode).toBe(400);
  });

  it('400 si se intenta formatear el disco de sistema (C:)', async () => {
    const res = await app.inject({
      method: 'POST', url: '/disks/agent-format',
      headers: { 'x-test-sub': userId, 'x-step-up-token': stepUp },
      payload: body({ driveLetter: 'C', label: 'sis', confirmLabel: 'sis' }),
    });
    expect(res.statusCode).toBe(400);
  });

  it('409 si el agente está desconectado', async () => {
    seedAgent(agentId, userId);
    const res = await app.inject({
      method: 'POST', url: '/disks/agent-format',
      headers: { 'x-test-sub': userId, 'x-step-up-token': stepUp },
      payload: body(),
    });
    expect(res.statusCode).toBe(409);
  });

  it('401 si falta el token de step-up', async () => {
    seedAgent(agentId, userId);
    connectFormattingAgent(agentId, userId);
    const res = await app.inject({
      method: 'POST', url: '/disks/agent-format',
      headers: { 'x-test-sub': userId },
      payload: body(),
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error).toBe('step-up-required');
  });

  it('400 si el disco (en uso) ya guarda archivos de Noctcom', async () => {
    seedAgent(agentId, userId);
    connectFormattingAgent(agentId, userId);
    // Volumen ya registrado en D:\ con un chunk almacenado.
    const volId = randomUUID();
    store.volumes.push({ id: volId, path: 'D:\\', agent_id: agentId, user_id: userId, active: true, total_bytes: 1000 });
    store.chunks.push({ volume_id: volId });

    const res = await app.inject({
      method: 'POST', url: '/disks/agent-format',
      headers: { 'x-test-sub': userId, 'x-step-up-token': stepUp },
      payload: body(),
    });
    expect(res.statusCode).toBe(400);
    // No se llegó a formatear: el volumen sigue ahí.
    expect(store.volumes).toHaveLength(1);
  });

  it('formatea y registra el volumen como activo (201), idempotente', async () => {
    seedAgent(agentId, userId);
    connectFormattingAgent(agentId, userId);

    const res = await app.inject({
      method: 'POST', url: '/disks/agent-format',
      headers: { 'x-test-sub': userId, 'x-step-up-token': stepUp },
      payload: body(),
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().path).toBe('D:\\');
    expect(store.volumes).toHaveLength(1);
    expect(store.volumes[0]).toMatchObject({ agent_id: agentId, user_id: userId, active: true, label: 'datos', total_bytes: 1000 });

    // Segunda llamada: no duplica, reactiva el existente.
    const res2 = await app.inject({
      method: 'POST', url: '/disks/agent-format',
      headers: { 'x-test-sub': userId, 'x-step-up-token': stepUp },
      payload: body({ label: 'datos2', confirmLabel: 'datos2' }),
    });
    expect(res2.statusCode).toBe(200);
    expect(res2.json().alreadyRegistered).toBe(true);
    expect(store.volumes).toHaveLength(1);
    expect(store.volumes[0].label).toBe('datos2');
  });
});
