/**
 * Recovery v2: columnas para el kit de recuperación completo.
 *   - users.recovery_box_public_key             X25519 pública derivada de la mnemónica
 *   - users.exchange_private_key_sealed_recovery sk_exchange sellada a esa pública
 *   - vaults.vault_key_sealed_recovery           vault_key sellada a esa pública
 * Idempotente (IF NOT EXISTS). Ejecutar contra prod:
 *   npx tsx --env-file=.env.prod scripts/migrate-recovery-v2.ts
 */
import pg from 'pg';

const url = process.env.DATABASE_URL;
if (!url) { console.error('✗ falta DATABASE_URL'); process.exit(1); }

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  await client.query(`ALTER TABLE users
    ADD COLUMN IF NOT EXISTS recovery_box_public_key BYTEA,
    ADD COLUMN IF NOT EXISTS exchange_private_key_sealed_recovery BYTEA`);
  await client.query(`ALTER TABLE vaults
    ADD COLUMN IF NOT EXISTS vault_key_sealed_recovery BYTEA`);
  console.log('✅ Recovery v2: columnas creadas (o ya existían)');
} finally {
  await client.end();
}
