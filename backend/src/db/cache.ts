/**
 * Caché y pub/sub del stack: rate-limit, lockout de logins, límite de registros
 * por IP y las notificaciones "algo cambió" del WebSocket.
 *
 * El motor es DragonflyDB, que habla el protocolo Redis (RESP), así que el
 * cliente sigue siendo `redis` de npm y la URL sigue usando el esquema
 * `redis://`. Cambiar de motor no cambia una línea de este fichero.
 *
 * Nada de lo que se guarda aquí es contenido del usuario: son contadores con
 * TTL y avisos. El cifrado zero-knowledge no depende de esta pieza — sin caché
 * el stack funciona en modo degradado (ver login-lockout.ts / signup-limit.ts).
 */
import { createClient, type RedisClientType } from 'redis';
import { env } from '../config.js';

let client: RedisClientType | null = null;

/** URL del servidor de caché. CACHE_URL manda; REDIS_URL es el alias heredado. */
function cacheUrl(): string {
  return env.CACHE_URL || env.REDIS_URL || '';
}

/**
 * Reconexión acotada: si Dragonfly se reinicia (actualización, OOM), el cliente
 * vuelve solo en vez de dejar el rate-limit desactivado hasta el próximo
 * reinicio del backend. Backoff lineal con techo de 5 s.
 */
function reconnectStrategy(retries: number): number {
  return Math.min(200 * (retries + 1), 5_000);
}

export async function initCache(): Promise<RedisClientType | null> {
  if (client) return client;
  const url = cacheUrl();
  if (!url) return null;

  try {
    client = createClient({ url, socket: { reconnectStrategy } }) as RedisClientType;
    client.on('error', (err) => console.error('cache error:', err));
    await client.connect();
    return client;
  } catch (err) {
    console.warn('cache not available, sync disabled:', err);
    return null;
  }
}

export function cache(): RedisClientType | null {
  return client;
}

/**
 * Conexión aparte para SUBSCRIBE: en RESP una conexión suscrita no puede
 * ejecutar comandos normales, así que cada WebSocket abre la suya.
 */
export async function createSubscriber(): Promise<RedisClientType | null> {
  const url = cacheUrl();
  if (!url) return null;
  try {
    const sub = createClient({ url, socket: { reconnectStrategy } }) as RedisClientType;
    sub.on('error', (err) => console.error('cache subscriber error:', err));
    await sub.connect();
    return sub;
  } catch {
    return null;
  }
}

export async function publishChange(userId: string, event: {
  resource: string;
  action: string;
  vaultId?: string;
}) {
  if (!client) return;
  try {
    await client.publish(`user:${userId}`, JSON.stringify({ ...event, ts: Date.now() }));
  } catch { /* ignore */ }
}
