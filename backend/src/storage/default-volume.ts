import type { FastifyBaseLogger } from 'fastify';
import { db } from '../db/pool.js';
import { env } from '../config.js';
import { validateVolumePath } from './disk.js';

/**
 * Self-host: garantiza un volumen de disco local por defecto.
 *
 * En self-host las subidas deben ir a DISCO (endpoint mismo-origen
 * /api/v1/uploads/chunk/, que pasa por Caddy y va autenticado), NO a MinIO: las
 * URLs prefirmadas de MinIO apuntan a http://minio:9000 — un host interno de
 * Docker que el navegador no puede resolver, y que sobre HTTPS LAN sería además
 * mixed-content. Sin un volumen activo, uploads.ts cae a MinIO y la subida falla.
 *
 * Solo actúa si BLOB_VOLUME_PATH está definido (lo pone docker-compose en
 * self-host); en la nube queda vacío y esto no hace nada (allí S3=Backblaze sí
 * es alcanzable por el navegador). Idempotente: si ya hay un volumen local
 * activo, no toca nada.
 *
 * Nota: el path debe existir y ser escribible DENTRO del contenedor backend
 * (docker-compose monta el named volume blob_data en /data). Discos del host
 * adicionales requieren montarlos también en el servicio backend antes de
 * registrarlos desde /almacenamiento.
 */
export async function ensureDefaultVolume(log: FastifyBaseLogger): Promise<void> {
  const path = env.BLOB_VOLUME_PATH;
  if (!path) return; // nube / no configurado

  // ¿Ya hay un volumen local activo? (agent_id NULL = disco del propio servidor)
  const existing = await db.query(
    `SELECT 1 FROM storage_volumes WHERE agent_id IS NULL AND active = true LIMIT 1`,
  );
  if ((existing.rowCount ?? 0) > 0) return;

  const ok = await validateVolumePath(path);
  if (!ok) {
    log.warn(
      { path },
      'BLOB_VOLUME_PATH no es un directorio escribible — las subidas caerían a MinIO (no alcanzable desde el navegador en LAN). Revisa el montaje del contenedor backend.',
    );
    return;
  }

  await db.query(
    `INSERT INTO storage_volumes (path, label, active) VALUES ($1, $2, true)`,
    [path, 'Disco del servidor'],
  );
  log.info({ path }, 'volumen de disco por defecto registrado (self-host)');
}
