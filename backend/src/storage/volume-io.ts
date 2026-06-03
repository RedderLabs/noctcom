/**
 * E/S de blobs sobre un volumen, con dos backends transparentes:
 *
 *   - Volumen LOCAL (self-host): el `path` está en el sistema de ficheros del
 *     propio backend → se escribe/lee con `disk.ts`.
 *   - Volumen de AGENTE (cloud): el `path` está en la máquina del usuario → la
 *     E/S se enruta por el canal WS al "Noctcom Connector" (M3). El agente solo
 *     ve ciphertext: el cifrado ocurre en el navegador, así que sigue siendo
 *     zero-knowledge.
 *
 * El ciphertext viaja por el WS en base64url dentro del mensaje JSON ya
 * correlacionado del registry (chunks de 4 MiB → ~5,5 MiB por mensaje).
 */
import { writeToDisk, readFromDisk, deleteFromDisk } from './disk.js';
import * as registry from '../agents/registry.js';

export interface VolumeRef {
  path: string;
  agentId: string | null;
}

/** Operación de chunk que tarda algo más que un comando normal del agente. */
const CHUNK_TIMEOUT_MS = 60_000;

function ensureAgentOnline(agentId: string): void {
  if (!registry.isOnline(agentId)) {
    throw new Error('agent-offline');
  }
}

export async function writeChunk(vol: VolumeRef, key: string, data: Buffer): Promise<void> {
  if (vol.agentId) {
    ensureAgentOnline(vol.agentId);
    await registry.sendCommand(
      vol.agentId,
      'write-chunk',
      { path: vol.path, key, dataB64: data.toString('base64url') },
      CHUNK_TIMEOUT_MS,
    );
    return;
  }
  await writeToDisk(vol.path, key, data);
}

export async function readChunk(vol: VolumeRef, key: string): Promise<Buffer> {
  if (vol.agentId) {
    ensureAgentOnline(vol.agentId);
    const res = (await registry.sendCommand(
      vol.agentId,
      'read-chunk',
      { path: vol.path, key },
      CHUNK_TIMEOUT_MS,
    )) as { dataB64?: string };
    if (!res?.dataB64) throw new Error('el agente no devolvió datos del chunk');
    return Buffer.from(res.dataB64, 'base64url');
  }
  return readFromDisk(vol.path, key);
}

export async function deleteChunk(vol: VolumeRef, key: string): Promise<void> {
  if (vol.agentId) {
    ensureAgentOnline(vol.agentId);
    await registry.sendCommand(
      vol.agentId,
      'delete-chunk',
      { path: vol.path, key },
      CHUNK_TIMEOUT_MS,
    );
    return;
  }
  await deleteFromDisk(vol.path, key);
}
