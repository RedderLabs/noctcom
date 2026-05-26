import { createClient, type RedisClientType } from 'redis';
import { env } from '../config.js';

let client: RedisClientType | null = null;

export async function initRedis(): Promise<RedisClientType | null> {
  if (client) return client;
  if (!env.REDIS_URL) return null;

  try {
    client = createClient({ url: env.REDIS_URL }) as RedisClientType;
    client.on('error', (err) => console.error('redis error:', err));
    await client.connect();
    return client;
  } catch (err) {
    console.warn('redis not available, sync disabled:', err);
    return null;
  }
}

export function redis(): RedisClientType | null {
  return client;
}

export async function createSubscriber(): Promise<RedisClientType | null> {
  if (!env.REDIS_URL) return null;
  try {
    const sub = createClient({ url: env.REDIS_URL }) as RedisClientType;
    sub.on('error', (err) => console.error('redis subscriber error:', err));
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
