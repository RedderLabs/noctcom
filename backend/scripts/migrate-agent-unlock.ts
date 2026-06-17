/**
 * Desbloqueo "Tus discos" de por vida (pago ÚNICO). Columna en users. Idempotente.
 *   npx tsx --env-file=.env.prod scripts/migrate-agent-unlock.ts
 *
 * agent_unlock = TRUE habilita usar los discos propios vía Connector sin cuota de
 * nube ni plan mensual, de forma permanente (ortogonal al `plan`). Lo activa el
 * webhook de Stripe al completar un Checkout one-time. Ver billing.ts / plans.ts.
 */
import pg from 'pg';

const url = process.env.DATABASE_URL;
if (!url) { console.error('✗ falta DATABASE_URL'); process.exit(1); }

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  await client.query(
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS agent_unlock BOOLEAN NOT NULL DEFAULT FALSE`,
  );
  console.log('✅ agent_unlock: columna creada (o ya existía)');
} finally {
  await client.end();
}
