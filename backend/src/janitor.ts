import type { FastifyBaseLogger } from 'fastify';
import * as Sentry from '@sentry/node';
import { db } from './db/pool.js';
import { env } from './config.js';
import { purgeSubtree, reconcileAllUsage } from './storage/purge.js';

const GIB = 1024 ** 3;

// Días que un elemento sobrevive en la papelera antes de borrarse solo. La UI
// promete esta caducidad desde el principio; hasta ahora no había nada que la
// cumpliera y la papelera crecía para siempre.
const TRASH_RETENTION_DAYS = 30;

// Vacía la papelera de lo que ya caducó. Los bytes ya se descontaron al enviar
// el elemento a la papelera (ver routes/nodes.ts), así que aquí solo se borran
// blobs y filas: `alreadyDiscounted`. Se purgan solo las raíces de la papelera
// —los descendientes caen en cascada— y de una en una, para que un fallo suelto
// (un agente offline) no se lleve por delante el resto del barrido.
async function purgeExpiredTrash(log: FastifyBaseLogger): Promise<void> {
  try {
    const expired = await db.query(
      `SELECT n.id, v.owner_id
       FROM nodes n
       JOIN vaults v ON v.id = n.vault_id
       WHERE n.deleted_at IS NOT NULL
         AND n.deleted_at < now() - make_interval(days => $1)
       LIMIT 500`,
      [TRASH_RETENTION_DAYS],
    );
    if (expired.rowCount === 0) return;

    let purged = 0;
    let failed = 0;
    for (const row of expired.rows) {
      try {
        await purgeSubtree(row.id, row.owner_id, { alreadyDiscounted: true });
        purged++;
      } catch (err) {
        failed++;
        log.warn({ err, nodeId: row.id }, 'janitor: purga de papelera falló para un nodo');
      }
    }
    log.info({ purged, failed, retentionDays: TRASH_RETENTION_DAYS }, 'janitor: papelera caducada purgada');
  } catch (err) {
    log.warn({ err }, 'janitor: purga de papelera falló (se reintentará)');
  }
}

// Vigila el almacenamiento cloud total frente al tope de gasto (B2/MinIO). Si se
// pasa del umbral, avisa: log + GlitchTip (donde puedes poner una alerta por
// email). El tope DURO (rechazar subidas) está en uploads.ts; esto es el aviso.
async function checkStorage(log: FastifyBaseLogger): Promise<void> {
  if (env.GLOBAL_STORAGE_CAP_BYTES <= 0) return;
  try {
    const r = await db.query(`SELECT COALESCE(SUM(storage_used_bytes), 0)::bigint AS total FROM users`);
    const used = Number(r.rows[0].total);
    const cap = env.GLOBAL_STORAGE_CAP_BYTES;
    const pct = Math.round((used / cap) * 1000) / 10;
    if (pct >= env.GLOBAL_STORAGE_ALERT_PCT) {
      const msg = `Almacenamiento cloud al ${pct}% del tope (${(used / GIB).toFixed(1)} GiB de ${(cap / GIB).toFixed(1)} GiB)`;
      log.warn({ usedBytes: used, capBytes: cap, pct }, `janitor: ${msg}`);
      Sentry.captureMessage(`[storage] ${msg}`, 'warning'); // no-op si GlitchTip no está activo
    }
  } catch (err) {
    log.warn({ err }, 'janitor: chequeo de almacenamiento falló');
  }
}

// Baja a la cuota free a los usuarios cuyo trial de la beta ya expiró. El trial
// da BETA_TRIAL_QUOTA_BYTES durante BETA_TRIAL_DAYS; al acabar, los free vuelven
// a USER_QUOTA_BYTES y lo que exceda queda en solo-lectura (uploads.ts rechaza
// subidas por cuota; descargar y borrar siguen funcionando). Solo cloud: sin
// Stripe (self-host) el trial no existe. Los de pago no se tocan (plan != free).
async function expireTrials(log: FastifyBaseLogger): Promise<void> {
  if (!env.STRIPE_SECRET_KEY) return;
  try {
    const r = await db.query(
      `UPDATE users SET storage_quota_bytes = $1
        WHERE plan = 'free' AND trial_exempt = FALSE AND trial_started_at IS NOT NULL
          AND trial_started_at + make_interval(days => $2) < now()
          AND storage_quota_bytes > $1`,
      [env.USER_QUOTA_BYTES, env.BETA_TRIAL_DAYS],
    );
    if ((r.rowCount ?? 0) > 0) {
      log.info({ users: r.rowCount }, 'janitor: trials expirados — cuota devuelta a free');
    }
  } catch (err) {
    log.warn({ err }, 'janitor: expiración de trials falló (se reintentará)');
  }
}

// Cuadra el contador de cuota con lo que de verdad hay guardado. Corrige de una
// vez las cuentas que arrastran la fuga histórica de versiones (cada resubida
// sumaba bytes que el borrado nunca restaba). Se ejecuta después de la purga
// para que la papelera recién vaciada ya no cuente.
async function reconcileUsage(log: FastifyBaseLogger): Promise<void> {
  try {
    const drifted = await reconcileAllUsage();
    if (drifted.length === 0) return;
    const totalDrift = drifted.reduce((acc, d) => acc + (d.before - d.after), 0);
    log.warn(
      { users: drifted.length, totalDriftBytes: totalDrift },
      'janitor: contador de almacenamiento desviado — corregido',
    );
  } catch (err) {
    log.warn({ err }, 'janitor: reconciliación de cuota falló (se reintentará)');
  }
}

// Barrido periódico de filas efímeras ya caducadas. Sin esto, tablas como
// password_reset_tokens, webauthn_challenges y login_attempts crecen sin
// límite (un atacante que martillee /recovery/init dejaría miles de tokens
// muertos). No es seguridad crítica — la validez ya se comprueba por
// expires_at en cada uso — pero evita que la BD se hinche con basura.

const HOUR = 60 * 60 * 1000;

async function sweep(log: FastifyBaseLogger): Promise<void> {
  try {
    const tokens = await db.query(
      `DELETE FROM password_reset_tokens WHERE expires_at < now() - interval '1 hour'`,
    );
    const challenges = await db.query(
      `DELETE FROM webauthn_challenges WHERE expires_at < now() - interval '1 hour'`,
    );
    // El log de intentos de login solo sirve para forense reciente: 30 días basta.
    const attempts = await db.query(
      `DELETE FROM login_attempts WHERE created_at < now() - interval '30 days'`,
    );
    const total = (tokens.rowCount ?? 0) + (challenges.rowCount ?? 0) + (attempts.rowCount ?? 0);
    if (total > 0) {
      log.info(
        { resetTokens: tokens.rowCount, challenges: challenges.rowCount, loginAttempts: attempts.rowCount },
        'janitor: filas efímeras caducadas purgadas',
      );
    }
  } catch (err) {
    log.warn({ err }, 'janitor: barrido falló (se reintentará)');
  }
  await purgeExpiredTrash(log);
  await reconcileUsage(log);
  await checkStorage(log);
  await expireTrials(log);
}

// Arranca el barrido horario. Devuelve el handle para poder pararlo en shutdown.
export function startJanitor(log: FastifyBaseLogger): NodeJS.Timeout {
  void sweep(log); // uno al arrancar, sin esperar la primera hora
  const handle = setInterval(() => void sweep(log), HOUR);
  handle.unref?.(); // que no bloquee el cierre del proceso
  return handle;
}
