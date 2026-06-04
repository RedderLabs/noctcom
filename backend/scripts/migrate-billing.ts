/**
 * Billing (Fase 8): columnas de plan/suscripción en users. Idempotente.
 *   npx tsx --env-file=.env.prod scripts/migrate-billing.ts
 *
 * El cobro va atado a la CUOTA (bytes), no al contenido (ZK): storage_quota_bytes
 * ya existe y es la palanca; estas columnas guardan el estado de la suscripción.
 */
import pg from 'pg';

const url = process.env.DATABASE_URL;
if (!url) { console.error('✗ falta DATABASE_URL'); process.exit(1); }

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  await client.query(`ALTER TABLE users
    ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'free',
    ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT,
    ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT,
    ADD COLUMN IF NOT EXISTS subscription_status TEXT,
    ADD COLUMN IF NOT EXISTS current_period_end TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE`);
  // Búsqueda rápida por customer en el webhook.
  await client.query(`CREATE INDEX IF NOT EXISTS users_stripe_customer_idx ON users(stripe_customer_id)`);
  // Idempotencia de eventos de Stripe (no procesar el mismo dos veces).
  await client.query(`CREATE TABLE IF NOT EXISTS stripe_events (
    id TEXT PRIMARY KEY,
    type TEXT,
    received_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
  console.log('✅ billing: columnas y tabla stripe_events creadas (o ya existían)');
} finally {
  await client.end();
}
