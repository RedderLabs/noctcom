/**
 * M3: E/S de chunks con dos backends — disco local (self-host) y agente (cloud).
 *
 * Comprueba que `volume-io` enruta correctamente: a un agente conectado le manda
 * write/read/delete-chunk (ciphertext en base64url) y reconstruye los bytes; y a
 * un volumen local escribe/lee directo del sistema de ficheros. Si el agente está
 * desconectado, falla con 'agent-offline'.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { writeChunk, readChunk, deleteChunk } from '../storage/volume-io.js';
import * as registry from '../agents/registry.js';

/** Agente falso que guarda los blobs en memoria y responde a los comandos M3. */
function connectFakeDiskAgent(agentId: string, userId: string) {
  const blobs = new Map<string, string>(); // key → dataB64
  registry.addConnection(agentId, userId, {
    readyState: 1,
    close() {},
    send(data: string) {
      const m = JSON.parse(data);
      if (m.type !== 'cmd') return;
      if (m.cmd === 'write-chunk') {
        blobs.set(m.args.key, m.args.dataB64);
        registry.resolveResponse(agentId, m.id, true, { ok: true });
      } else if (m.cmd === 'read-chunk') {
        const dataB64 = blobs.get(m.args.key);
        registry.resolveResponse(agentId, m.id, true, { dataB64 });
      } else if (m.cmd === 'delete-chunk') {
        blobs.delete(m.args.key);
        registry.resolveResponse(agentId, m.id, true, { ok: true });
      }
    },
  });
  return blobs;
}

describe('volume-io: enrutado a agente', () => {
  beforeEach(() => registry._reset());

  it('escribe, lee y borra un chunk vía el agente (round-trip base64)', async () => {
    const agentId = randomUUID();
    const blobs = connectFakeDiskAgent(agentId, randomUUID());
    const vol = { path: 'D:\\', agentId };
    const data = Buffer.from('ciphertext-de-prueba-🔒', 'utf-8');

    await writeChunk(vol, 'a1/clave', data);
    expect(blobs.get('a1/clave')).toBe(data.toString('base64url'));

    const got = await readChunk(vol, 'a1/clave');
    expect(got.equals(data)).toBe(true);

    await deleteChunk(vol, 'a1/clave');
    expect(blobs.has('a1/clave')).toBe(false);
  });

  it('falla con agent-offline si el agente no está conectado', async () => {
    const vol = { path: 'D:\\', agentId: randomUUID() };
    await expect(writeChunk(vol, 'k', Buffer.from('x'))).rejects.toThrow('agent-offline');
    await expect(readChunk(vol, 'k')).rejects.toThrow('agent-offline');
    await expect(deleteChunk(vol, 'k')).rejects.toThrow('agent-offline');
  });
});

describe('volume-io: volumen local (self-host)', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'noctcom-volio-'));
  });
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('escribe y lee del sistema de ficheros cuando no hay agentId', async () => {
    const vol = { path: dir, agentId: null };
    const data = Buffer.from('blob-local');

    await writeChunk(vol, 'b2/clave', data);
    const got = await readChunk(vol, 'b2/clave');
    expect(got.equals(data)).toBe(true);

    await deleteChunk(vol, 'b2/clave');
    await expect(readChunk(vol, 'b2/clave')).rejects.toThrow();
  });
});
