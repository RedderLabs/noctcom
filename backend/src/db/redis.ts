import { createClient, type RedisClientType } from 'redis';
import { env } from '../config.js';

let client: RedisClientType | null = null;

export async function initRedis(): Promise<RedisClientType> {
  if (client) return client;
  if (!env.REDIS_URL) throw new Error('REDIS_URL not set');

  client = createClient({ url: env.REDIS_URL });
  client.on('error', (err) => console.error('redis error:', err));
  await client.connect();
  return client;
}

export function redis(): RedisClientType {
  if (!client) throw new Error('redis not initialized');
  return client;
}
