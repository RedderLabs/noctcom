/**
 * Beta trial: columna trial_started_at en users. Idempotente.
 *   npx tsx --env-file=.env.prod scripts/migrate-trial.ts
 *
 * NULL = el periodo de prueba aún no arrancó. Se fija (now()) la primera vez
 * que el usuario ve el modal de bienvenida del trial (POST /trial/start), no
 * al registrarse. La duración la decide BETA_TRIAL_DAYS (default 30).
 *
 * trial_exempt: el trial solo aplica a registros NUEVOS. El ADD con DEFAULT
 * TRUE marca exentos a los usuarios existentes; el SET DEFAULT FALSE hace que
 * los signups posteriores sí pasen por él (mismo truco que onboarded_at).
 */
import pg from 'pg';

const url = process.env.DATABASE_URL;
if (!url) { console.error('✗ falta DATABASE_URL'); process.exit(1); }

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS trial_started_at TIMESTAMPTZ`);
  await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS trial_exempt BOOLEAN NOT NULL DEFAULT TRUE`);
  await client.query(`ALTER TABLE users ALTER COLUMN trial_exempt SET DEFAULT FALSE`);
  // Limpieza: si a algún exento ya se le arrancó el reloj (ventana entre el
  // despliegue del trial y el de la exención), se le borra — no tiene trial.
  await client.query(`UPDATE users SET trial_started_at = NULL WHERE trial_exempt = TRUE`);
  console.log('✅ trial: columnas trial_started_at + trial_exempt listas (existentes exentos)');
} finally {
  await client.end();
}
