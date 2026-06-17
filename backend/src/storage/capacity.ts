/**
 * Capacidad real (bytes) de los discos ACTIVOS de un usuario: los suyos y los
 * volúmenes locales del backend (user_id NULL, self-host).
 *
 * Híbrido a propósito:
 *   - Volumen LOCAL (self-host, agent_id NULL): su path vive en el filesystem
 *     del backend → lo medimos EN VIVO con statfs. La columna total_bytes no
 *     sirve aquí porque POST /volumes no la rellena (quedaría a 0); statfs
 *     refleja el tamaño real del disco al instante, así que conectar un HDD/SSD
 *     nuevo sube la capacidad sin tocar nada.
 *   - Volumen de AGENTE (cloud, agent_id NO NULL): su disco está en la máquina
 *     del usuario, no en el backend → statfs fallaría. Usamos total_bytes, que
 *     el "Noctcom Connector" reportó al registrarlo.
 *
 * Se deduplica por dispositivo de fichero (st.dev) para no contar dos veces dos
 * volúmenes locales que viven en el mismo disco.
 */
import { promises as fs } from 'node:fs';
import { db } from '../db/pool.js';

export interface DiskUsage {
  /** Capacidad total real de los discos activos (bytes). */
  totalBytes: number;
  /**
   * Ocupación real del filesystem de los discos LOCALES (total − libre vía
   * statfs): incluye journal, bloques reservados y metadatos, no solo los
   * chunks de Noctcom. Coincide con lo que muestra GET /volumes por disco. Los
   * discos de agente no se miden aquí (su filesystem vive en otra máquina).
   */
  usedBytes: number;
}

/**
 * Capacidad y ocupación reales de los discos ACTIVOS de un usuario: los suyos y
 * los volúmenes locales del backend (user_id NULL, self-host). Deduplicado por
 * dispositivo (st.dev) para no contar dos veces volúmenes del mismo disco.
 * `usedBytes` se mide con el mismo statfs que GET /volumes, así el hero del
 * panel cuadra exactamente con la tarjeta de cada disco.
 */
export async function activeDiskUsage(userId: string): Promise<DiskUsage> {
  const r = await db.query(
    `SELECT path, agent_id, total_bytes FROM storage_volumes
      WHERE active = true AND (user_id = $1 OR user_id IS NULL)`,
    [userId],
  );

  let totalBytes = 0;
  let usedBytes = 0;
  const seenDevices = new Set<string>();
  for (const v of r.rows as Array<{ path: string; agent_id: string | null; total_bytes: string | number }>) {
    if (v.agent_id) {
      // Disco de agente (cloud): su filesystem está en la máquina del usuario,
      // statfs fallaría → usamos total_bytes reportado y no contamos su uso.
      totalBytes += Number(v.total_bytes) || 0;
      continue;
    }
    try {
      const st = await fs.stat(v.path);
      const dev = String(st.dev);
      if (seenDevices.has(dev)) continue; // mismo disco ya contado
      seenDevices.add(dev);
      const sf = await fs.statfs(v.path);
      totalBytes += sf.bsize * sf.blocks;
      usedBytes += sf.bsize * (sf.blocks - sf.bfree);
    } catch { /* disco desconectado: no suma */ }
  }
  return { totalBytes, usedBytes };
}
