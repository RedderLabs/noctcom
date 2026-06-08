/**
 * Compartir end-to-end: columna sealed_meta en shares. Idempotente.
 *   npx tsx --env-file=.env.prod scripts/migrate-shares-meta.ts
 *
 * sealed_meta = {name, mime} del archivo sellado con la pubkey del
 * destinatario (crypto_box_seal), igual que sealed_key. Sin esto el receptor
 * no puede mostrar el nombre del archivo (el name_encrypted del nodo va
 * cifrado con la vault key del emisor). NULLable: los shares anteriores a
 * esta columna no lo tienen y se descargan con nombre genérico.
 */
import pg from 'pg';

const url = process.env.DATABASE_URL;
if (!url) { console.error('✗ falta DATABASE_URL'); process.exit(1); }

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  await client.query(`ALTER TABLE shares ADD COLUMN IF NOT EXISTS sealed_meta BYTEA`);
  console.log('✅ shares.sealed_meta lista');
} finally {
  await client.end();
}
