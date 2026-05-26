import type { RedisClientType } from 'redis';

interface StoreResult {
  current: number;
  ttl: number;
}

export class RedisRateLimitStore {
  private redis: RedisClientType;
  private timeWindow: number;
  private prefix: string;

  constructor(options: { timeWindow: number }, redis: RedisClientType, prefix = 'rl:') {
    this.redis = redis;
    this.timeWindow = typeof options.timeWindow === 'number' ? options.timeWindow : 60_000;
    this.prefix = prefix;
  }

  incr(key: string, callback: (error: Error | null, result?: StoreResult) => void): void {
    const redisKey = `${this.prefix}${key}`;
    this.redis.multi()
      .incr(redisKey)
      .pExpire(redisKey, this.timeWindow, 'NX')
      .pTTL(redisKey)
      .exec()
      .then((results) => {
        const current = results?.[0] as number ?? 1;
        const ttl = results?.[2] as number ?? this.timeWindow;
        callback(null, { current, ttl });
      })
      .catch((err) => callback(err as Error));
  }

  child(_routeOptions: { path: string; prefix: string }) {
    return new RedisRateLimitStore(
      { timeWindow: this.timeWindow },
      this.redis,
      this.prefix,
    );
  }
}

export function createRedisRateLimitStore(redis: RedisClientType) {
  return class BoundRedisStore extends RedisRateLimitStore {
    constructor(options: { timeWindow: number }) {
      super(options, redis);
    }
  };
}
