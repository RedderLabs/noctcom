/**
 * Diagnóstico de la conexión a Neon. Reproduce el fallo (SSL de la URL tratado
 * como verify-full) y prueba el fix (TLS sin verificación estricta).
 *   npx tsx --env-file=.env.prod scripts/test-db.ts
 */
import pg from 'pg';

const url = process.env.DATABASE_URL;
if (!url) { console.error('✗ falta DATABASE_URL'); process.exit(1); }

async function tryConnect(label: string, ssl: any) {
  const pool = new pg.Pool({ connectionString: url, connectionTimeoutMillis: 15_000, ssl });
  const t = Date.now();
  try {
    const c = await pool.connect();
    const r = await c.query('select 1 as ok, now() as ts');
    c.release();
    console.log(`✓ ${label} — OK en ${Date.now() - t}ms`, r.rows[0]);
  } catch (e: any) {
    console.log(`✗ ${label} — ${e.message} (${Date.now() - t}ms)`);
    if (e.cause) console.log(`    causa: ${e.cause.message ?? e.cause}`);
  } finally {
    await pool.end().catch(() => {});
  }
}

console.log('\nProbando conexión a Neon…\n');
await tryConnect('tal cual la URL (sslmode → verify-full)', undefined);
await tryConnect('con el fix (ssl rejectUnauthorized:false)', { rejectUnauthorized: false });
console.log('');
