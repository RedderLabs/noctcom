/**
 * Aplica el esquema consolidado a la BD de prod (Neon).
 *   npx tsx --env-file=.env.prod scripts/apply-schema.ts
 * Idempotente: todo es CREATE ... IF NOT EXISTS.
 */
import pg from 'pg';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const url = process.env.DATABASE_URL;
if (!url) { console.error('✗ falta DATABASE_URL'); process.exit(1); }

const sqlPath = resolve(process.cwd(), '..', 'scripts', 'init-db-render.sql');
const sql = readFileSync(sqlPath, 'utf8');
console.log(`Aplicando ${sqlPath} (${sql.length} bytes)…`);

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  try {
    await client.query(sql);
  } catch (e: any) {
    console.error(`\n✗ SQL error: ${e.message}`);
    if (e.position) {
      const pos = Number(e.position);
      console.error(`  posición ${pos}:`);
      console.error('  …' + sql.slice(Math.max(0, pos - 120), pos + 60).replace(/\n/g, '\\n') + '…');
    }
    throw e;
  }
  const r = await client.query(
    `select table_name from information_schema.tables where table_schema='public' order by table_name`,
  );
  console.log(`\n✅ Esquema aplicado. ${r.rows.length} tablas:\n  ${r.rows.map((x) => x.table_name).join(', ')}`);
} finally {
  await client.end();
}
