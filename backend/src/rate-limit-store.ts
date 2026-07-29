/**
 * Store de @fastify/rate-limit respaldado por la caché del stack (DragonflyDB,
 * protocolo Redis). Compartir el contador entre instancias es lo que hace que
 * el límite sea real cuando el backend escala; sin caché, @fastify/rate-limit
 * cae a su store en memoria (por proceso).
 */
import type { RedisClientType } from 'redis';

interface StoreResult {
  current: number;
  ttl: number;
}

export class CacheRateLimitStore {
  private client: RedisClientType;
  private timeWindow: number;
  private prefix: string;

  constructor(options: { timeWindow: number }, client: RedisClientType, prefix = 'rl:') {
    this.client = client;
    this.timeWindow = typeof options.timeWindow === 'number' ? options.timeWindow : 60_000;
    this.prefix = prefix;
  }

  incr(key: string, callback: (error: Error | null, result?: StoreResult) => void): void {
    const cacheKey = `${this.prefix}${key}`;
    this.client.multi()
      .incr(cacheKey)
      .pExpire(cacheKey, this.timeWindow, 'NX')
      .pTTL(cacheKey)
      .exec()
      .then((results) => {
        const current = results?.[0] as number ?? 1;
        const ttl = results?.[2] as number ?? this.timeWindow;
        callback(null, { current, ttl });
      })
      .catch((err) => callback(err as Error));
  }

  child(_routeOptions: { path: string; prefix: string }) {
    return new CacheRateLimitStore(
      { timeWindow: this.timeWindow },
      this.client,
      this.prefix,
    );
  }
}

export function createCacheRateLimitStore(client: RedisClientType) {
  return class BoundCacheStore extends CacheRateLimitStore {
    constructor(options: { timeWindow: number }) {
      super(options, client);
    }
  };
}
