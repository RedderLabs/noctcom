import { db, tx } from '../db/pool.js';
import { deleteBlob } from './s3.js';
import { deleteFromDisk } from './disk.js';

// ─────────────────────────────────────────────────────────────────────────────
// Contabilidad de cuota y purga de subárboles.
//
// Una sola fuente de verdad para los tres sitios que mueven bytes: enviar a la
// papelera, restaurar y borrar definitivamente. Antes cada uno hacía su cuenta y
// no coincidían: `/complete` sumaba el tamaño de CADA versión subida, pero el
// borrado definitivo restaba `nodes.ciphertext_size`, que es solo la versión
// actual. Resultado: cada resubida dejaba los bytes de la versión anterior
// contados para siempre, incluso tras borrar el archivo.
//
// Regla de oro: solo cuentan para la cuota cloud las versiones cuyos chunks NO
// viven en un disco del agente (ver uploads.ts `/complete`). Las de disco nunca
// sumaron, así que nunca se restan.
// ─────────────────────────────────────────────────────────────────────────────

/** Ejecutor de consultas: el pool o un cliente dentro de una transacción. */
interface Queryable {
  query: (text: string, values?: any[]) => Promise<{ rows: any[]; rowCount: number | null }>;
}

const SUBTREE_CTE = `
  WITH RECURSIVE tree AS (
    SELECT id FROM nodes WHERE id = $1
    UNION ALL
    SELECT n.id FROM nodes n JOIN tree t ON n.parent_id = t.id
  )`;

/**
 * Bytes que este subárbol ocupa en la cuota cloud: la suma del tamaño de TODAS
 * las versiones (no solo la actual) de todos sus archivos, excluyendo las que
 * viven en disco de agente.
 */
export async function subtreeCloudBytes(q: Queryable, nodeId: string): Promise<number> {
  const r = await q.query(
    `${SUBTREE_CTE}
     SELECT COALESCE(SUM(fv.total_size), 0)::bigint AS total
     FROM file_versions fv
     WHERE fv.node_id IN (SELECT id FROM tree)
       AND NOT EXISTS (
         SELECT 1 FROM chunks c
         WHERE c.version_id = fv.id AND c.storage_type = 'disk'
       )`,
    [nodeId],
  );
  return Number(r.rows[0]?.total ?? 0);
}

/**
 * Borra de almacenamiento los blobs de todo el subárbol. Los errores se ignoran
 * a propósito (un agente offline, una clave ya borrada): la fila de la BD manda,
 * y un blob huérfano se limpia en un barrido posterior.
 */
export async function deleteSubtreeBlobs(nodeId: string): Promise<void> {
  const chunks = await db.query(
    `${SUBTREE_CTE}
     SELECT c.s3_key, c.storage_type, c.volume_id
     FROM chunks c
     JOIN file_versions fv ON fv.id = c.version_id
     WHERE fv.node_id IN (SELECT id FROM tree)`,
    [nodeId],
  );

  for (const c of chunks.rows) {
    try {
      if (c.storage_type === 'disk' && c.volume_id) {
        const vol = await db.query(`SELECT path FROM storage_volumes WHERE id = $1`, [c.volume_id]);
        if (vol.rows[0]) await deleteFromDisk(vol.rows[0].path, c.s3_key);
      } else {
        await deleteBlob(c.s3_key);
      }
    } catch { /* ignore cleanup errors */ }
  }
}

/**
 * Borrado definitivo de un subárbol: blobs primero, luego la fila (la BD cascadea
 * los descendientes). Devuelve los bytes liberados.
 *
 * `alreadyDiscounted` es true cuando el nodo venía de la papelera: al enviarlo
 * allí ya se descontaron sus bytes, así que aquí no se vuelven a restar. Sin esa
 * distinción el contador bajaría dos veces por el mismo archivo.
 */
export async function purgeSubtree(
  nodeId: string,
  ownerId: string,
  opts: { alreadyDiscounted: boolean },
): Promise<number> {
  const freed = await subtreeCloudBytes(db, nodeId);
  await deleteSubtreeBlobs(nodeId);

  await tx(async (client) => {
    await client.query(`DELETE FROM nodes WHERE id = $1`, [nodeId]);
    if (!opts.alreadyDiscounted && freed > 0) {
      await client.query(
        `UPDATE users SET storage_used_bytes = GREATEST(0, storage_used_bytes - $1) WHERE id = $2`,
        [freed, ownerId],
      );
    }
  });

  return freed;
}

/**
 * Recalcula `storage_used_bytes` de un usuario desde la verdad (las versiones que
 * de hecho existen y no están en la papelera) y lo escribe. Devuelve el valor
 * anterior y el nuevo para poder registrar la deriva.
 *
 * Es la red de seguridad del contador: cualquier fuga histórica se corrige la
 * próxima vez que esto pasa por su cuenta.
 */
/**
 * Recalcula el contador de TODOS los usuarios de una pasada y devuelve solo los
 * que estaban desviados. Es la red de seguridad histórica: las cuentas que
 * arrastran fuga de versiones (bytes de versiones antiguas que nunca se
 * restaron) se corrigen solas en el primer barrido tras el despliegue.
 *
 * La deriva se registra en vez de corregirse en silencio: si vuelve a aparecer
 * después de esta corrección, es que hay un camino de escritura nuevo con el
 * mismo fallo, y queremos verlo.
 */
export async function reconcileAllUsage(): Promise<
  Array<{ userId: string; before: number; after: number }>
> {
  const r = await db.query(
    `WITH RECURSIVE dead AS (
       SELECT n.id FROM nodes n WHERE n.deleted_at IS NOT NULL
       UNION ALL
       SELECT n.id FROM nodes n JOIN dead d ON n.parent_id = d.id
     ),
     real_usage AS (
       SELECT v.owner_id AS user_id, COALESCE(SUM(fv.total_size), 0)::bigint AS total
       FROM file_versions fv
       JOIN nodes n ON n.id = fv.node_id
       JOIN vaults v ON v.id = n.vault_id
       WHERE n.id NOT IN (SELECT id FROM dead)
         AND NOT EXISTS (
           SELECT 1 FROM chunks c
           WHERE c.version_id = fv.id AND c.storage_type = 'disk'
         )
       GROUP BY v.owner_id
     ),
     drift AS (
       SELECT u.id,
              u.storage_used_bytes::bigint AS before,
              COALESCE(r.total, 0)::bigint AS after
       FROM users u
       LEFT JOIN real_usage r ON r.user_id = u.id
       WHERE u.storage_used_bytes <> COALESCE(r.total, 0)
     )
     UPDATE users u
        SET storage_used_bytes = d.after
       FROM drift d
      WHERE u.id = d.id
      RETURNING d.id AS user_id, d.before, d.after`,
  );

  return r.rows.map((row: any) => ({
    userId: row.user_id,
    before: Number(row.before),
    after: Number(row.after),
  }));
}

export async function reconcileUserUsage(
  userId: string,
): Promise<{ before: number; after: number }> {
  // Ojo con las carpetas: al enviar una a la papelera solo se marca ELLA, sus
  // descendientes conservan `deleted_at NULL`. Filtrar por `deleted_at IS NULL`
  // a secas contaría archivos que el usuario ya no puede ver. Por eso primero se
  // calcula el conjunto «muerto»: todo nodo con deleted_at más toda su
  // descendencia.
  const r = await db.query(
    `WITH RECURSIVE dead AS (
       SELECT n.id
       FROM nodes n
       JOIN vaults v ON v.id = n.vault_id
       WHERE v.owner_id = $1 AND n.deleted_at IS NOT NULL
       UNION ALL
       SELECT n.id FROM nodes n JOIN dead d ON n.parent_id = d.id
     )
     SELECT
       (SELECT storage_used_bytes FROM users WHERE id = $1)::bigint AS before,
       (
         SELECT COALESCE(SUM(fv.total_size), 0)::bigint
         FROM file_versions fv
         JOIN nodes n ON n.id = fv.node_id
         JOIN vaults v ON v.id = n.vault_id
         WHERE v.owner_id = $1
           AND n.id NOT IN (SELECT id FROM dead)
           AND NOT EXISTS (
             SELECT 1 FROM chunks c
             WHERE c.version_id = fv.id AND c.storage_type = 'disk'
           )
       ) AS after`,
    [userId],
  );

  const before = Number(r.rows[0]?.before ?? 0);
  const after = Number(r.rows[0]?.after ?? 0);

  if (before !== after) {
    await db.query(`UPDATE users SET storage_used_bytes = $1 WHERE id = $2`, [after, userId]);
  }
  return { before, after };
}
