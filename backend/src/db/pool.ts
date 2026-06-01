import pg from 'pg';
import { env } from '../config.js';

const { Pool } = pg;

// Neon exige TLS, pero las versiones recientes de pg-connection-string
// interpretan `sslmode=require` de la URL como `verify-full`, y eso rompe el
// handshake contra el pooler de Neon ("Connection terminated unexpectedly").
// Forzamos TLS sin verificación estricta del certificado. El riesgo es acotado:
// todo lo que guardamos en Postgres ya va cifrado en el cliente (zero-knowledge),
// así que un MITM en el enlace a la BD solo vería ciphertext y metadatos.
// TODO: endurecer a verify-full con la CA de Neon cuando toque.
const useTls = !/localhost|127\.0\.0\.1/.test(env.DATABASE_URL);

export const db = new Pool({
  connectionString: env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30_000,
  // Neon (free tier) suspende el compute cuando no hay tráfico y tarda unos
  // segundos en despertar; le damos margen para no cortar el primer intento.
  connectionTimeoutMillis: 15_000,
  ssl: useTls ? { rejectUnauthorized: false } : undefined,
});

export async function initDb(): Promise<void> {
  // Tras un deploy el compute de Neon puede estar dormido. En vez de morir al
  // primer fallo (y quedarnos en bucle de reinicios), reintentamos con backoff
  // hasta que la base despierte.
  const maxAttempts = 8;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const client = await db.connect();
      try {
        await client.query('SELECT 1');
      } finally {
        client.release();
      }
      if (attempt > 1) console.log(`DB lista tras ${attempt} intentos`);
      return;
    } catch (err) {
      if (attempt === maxAttempts) throw err;
      const waitMs = Math.min(2_000 * attempt, 10_000);
      console.warn(`DB aún no responde (intento ${attempt}/${maxAttempts}), reintento en ${waitMs / 1000}s…`);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }
}

export async function tx<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
