/**
 * Corrige el cupo del free tier a 1 GB en prod (default de la columna + usuarios
 * existentes que tenían el viejo default de 2 GB).
 *   npx tsx --env-file=.env.prod scripts/fix-quota.ts
 */
import pg from 'pg';

const url = process.env.DATABASE_URL;
if (!url) { console.error('✗ falta DATABASE_URL'); process.exit(1); }

const ONE_GB = 1073741824;
const TWO_GB = 2147483648;

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  await client.query(`ALTER TABLE users ALTER COLUMN storage_quota_bytes SET DEFAULT ${ONE_GB}`);
  const r = await client.query(
    `UPDATE users SET storage_quota_bytes = $1 WHERE storage_quota_bytes = $2`,
    [ONE_GB, TWO_GB],
  );
  console.log(`✅ default → 1GB. Usuarios actualizados de 2GB→1GB: ${r.rowCount}`);
} finally {
  await client.end();
}
