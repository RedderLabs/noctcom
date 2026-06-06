/**
 * Beta trial: columna trial_started_at en users. Idempotente.
 *   npx tsx --env-file=.env.prod scripts/migrate-trial.ts
 *
 * NULL = el periodo de prueba aún no arrancó. Se fija (now()) la primera vez
 * que el usuario ve el modal de bienvenida del trial (POST /trial/start), no
 * al registrarse. La duración la decide BETA_TRIAL_DAYS (default 30).
 */
import pg from 'pg';

const url = process.env.DATABASE_URL;
if (!url) { console.error('✗ falta DATABASE_URL'); process.exit(1); }

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS trial_started_at TIMESTAMPTZ`);
  console.log('✅ trial: columna trial_started_at creada (o ya existía)');
} finally {
  await client.end();
}
