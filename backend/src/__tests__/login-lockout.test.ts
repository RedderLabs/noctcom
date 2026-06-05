/**
 * Tests del lockout por cuenta tras logins fallidos (login-lockout.ts +
 * integración en /login/finalize de auth.ts).
 *
 * Redis se simula en memoria (incr/expire/ttl/set/del con TTLs falsos por
 * tiempo virtual) para no necesitar un servidor. El login usa el mismo truco
 * que change-password.test.ts: un par Ed25519 directo como identidad, sin
 * Argon2.
 *
 * Cubre: bloqueo al 5º fallo (429 + Retry-After), cuenta inexistente también
 * cuenta (sin enumeración), expiración del bloqueo, backoff exponencial en el
 * segundo bloqueo, limpieza al login correcto, y no-op sin Redis.
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { randomUUID, randomBytes } from 'node:crypto';

// ─── Redis fake en memoria con tiempo virtual ────────────────────
let now = 0; // ms virtuales
const kv = new Map<string, { value: string; expiresAt: number | null }>();
let redisAvailable = true;

function alive(key: string) {
  const e = kv.get(key);
  if (!e) return null;
  if (e.expiresAt !== null && e.expiresAt <= now) { kv.delete(key); return null; }
  return e;
}

const fakeRedis = {
  async incr(key: string) {
    const e = alive(key);
    const v = e ? Number(e.value) + 1 : 1;
    kv.set(key, { value: String(v), expiresAt: e?.expiresAt ?? null });
    return v;
  },
  async expire(key: string, seconds: number) {
    const e = alive(key);
    if (e) e.expiresAt = now + seconds * 1000;
    return e ? 1 : 0;
  },
  async ttl(key: string) {
    const e = alive(key);
    if (!e) return -2;
    if (e.expiresAt === null) return -1;
    return Math.ceil((e.expiresAt - now) / 1000);
  },
  async set(key: string, value: string, opts?: { EX?: number }) {
    kv.set(key, { value, expiresAt: opts?.EX ? now + opts.EX * 1000 : null });
    return 'OK';
  },
  async del(keys: string | string[]) {
    const list = Array.isArray(keys) ? keys : [keys];
    let n = 0;
    for (const k of list) if (kv.delete(k)) n++;
    return n;
  },
};

// config.ts valida process.env entero (DATABASE_URL, S3_*…) — en tests se
// mockea con solo lo que usa login-lockout.ts.
vi.mock('../config.js', () => ({
  env: {
    LOGIN_LOCKOUT_MAX_FAILS: 5,
    LOGIN_LOCKOUT_WINDOW_S: 900,
    LOGIN_LOCKOUT_BASE_LOCK_S: 900,
    LOGIN_LOCKOUT_MAX_LOCK_S: 14400,
  },
}));

vi.mock('../db/redis.js', () => ({
  redis: () => (redisAvailable ? fakeRedis : null),
  initRedis: vi.fn(async () => null),
  createSubscriber: vi.fn(async () => null),
  publishChange: vi.fn(async () => {}),
}));

vi.mock('../db/pool.js', async () => {
  const f = await import('./fake-db.js');
  return { db: f.db, tx: f.tx };
});
vi.mock('../mail.js', () => ({ sendVerificationEmail: vi.fn(async () => {}), normalizeLocale: () => 'es' }));
vi.mock('../storage/s3.js', () => ({ deleteBlob: vi.fn(async () => {}) }));
vi.mock('../storage/disk.js', () => ({ deleteFromDisk: vi.fn(async () => {}) }));
vi.mock('../session.js', () => ({
  issueSession: vi.fn(async () => ({ accessToken: 'a', refreshToken: 'r' })),
  hashIp: () => Buffer.alloc(32),
  newRefreshToken: () => ({ plain: 'r', hash: Buffer.alloc(32) }),
}));

import Fastify, { type FastifyInstance } from 'fastify';
import sensible from '@fastify/sensible';
import jwt from '@fastify/jwt';
import sodium from 'libsodium-wrappers-sumo';
import authRoutes from '../routes/auth.js';
import { resetDb, seedUser } from './fake-db.js';
import { env } from '../config.js';

const b64 = (b: Uint8Array | Buffer) => Buffer.from(b).toString('base64url');

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify();
  await app.register(sensible);
  await app.register(jwt, { secret: 'test-secret-must-be-at-least-32-chars-long' });
  app.decorate('authenticate', async () => {});
  await app.register(authRoutes);
  await app.ready();
  return app;
}

describe('lockout de logins fallidos por cuenta', () => {
  let app: FastifyInstance;
  let identityKp: sodium.KeyPair;
  let emailHash: Buffer;

  beforeAll(async () => {
    await sodium.ready;
    app = await buildApp();
  });

  beforeEach(() => {
    resetDb();
    kv.clear();
    now = 0;
    redisAvailable = true;
    identityKp = sodium.crypto_sign_keypair();
    emailHash = randomBytes(32);
    seedUser({
      id: randomUUID(),
      email_hash: emailHash,
      identity_public_key: Buffer.from(identityKp.publicKey),
      identity_private_key_wrapped: randomBytes(80),
      identity_private_key_nonce: randomBytes(24),
      exchange_public_key: randomBytes(32),
      exchange_private_key_wrapped: randomBytes(48),
      exchange_private_key_nonce: randomBytes(24),
    });
  });

  function finalize(opts: { good?: boolean; eh?: Buffer } = {}) {
    const challenge = randomBytes(32);
    const signature = opts.good
      ? sodium.crypto_sign_detached(challenge, identityKp.privateKey)
      : randomBytes(64); // firma inválida = contraseña incorrecta
    return app.inject({
      method: 'POST',
      url: '/login/finalize',
      payload: {
        emailHash: b64(opts.eh ?? emailHash),
        challenge: b64(challenge),
        signature: b64(signature),
      },
    });
  }

  it('bloquea tras MAX_FAILS fallos: 429 con Retry-After, y el login bueno también queda fuera', async () => {
    for (let i = 0; i < env.LOGIN_LOCKOUT_MAX_FAILS; i++) {
      const res = await finalize();
      expect(res.statusCode).toBe(401); // el fallo en sí responde igual que siempre
    }
    const locked = await finalize();
    expect(locked.statusCode).toBe(429);
    expect(locked.json().error).toBe('account_locked');
    expect(Number(locked.headers['retry-after'])).toBeGreaterThan(0);
    expect(locked.json().retryAfterSeconds).toBe(env.LOGIN_LOCKOUT_BASE_LOCK_S);

    // Incluso con la contraseña CORRECTA, mientras dura el bloqueo: 429.
    const goodButLocked = await finalize({ good: true });
    expect(goodButLocked.statusCode).toBe(429);
  });

  it('una cuenta inexistente también acumula fallos y se bloquea igual (sin enumeración)', async () => {
    const ghost = randomBytes(32);
    for (let i = 0; i < env.LOGIN_LOCKOUT_MAX_FAILS; i++) {
      const res = await finalize({ eh: ghost });
      expect(res.statusCode).toBe(401);
    }
    const locked = await finalize({ eh: ghost });
    expect(locked.statusCode).toBe(429);
    expect(locked.json().error).toBe('account_locked');
  });

  it('el bloqueo expira y el segundo bloqueo dura el doble (backoff)', async () => {
    for (let i = 0; i < env.LOGIN_LOCKOUT_MAX_FAILS; i++) await finalize();
    expect((await finalize()).statusCode).toBe(429);

    // Avanza el tiempo virtual más allá del primer bloqueo.
    now += (env.LOGIN_LOCKOUT_BASE_LOCK_S + 1) * 1000;
    // Vuelve a fallar hasta el umbral: el segundo bloqueo debe durar el doble.
    for (let i = 0; i < env.LOGIN_LOCKOUT_MAX_FAILS; i++) {
      expect((await finalize()).statusCode).toBe(401);
    }
    const locked2 = await finalize();
    expect(locked2.statusCode).toBe(429);
    expect(locked2.json().retryAfterSeconds).toBe(env.LOGIN_LOCKOUT_BASE_LOCK_S * 2);
  });

  it('el login correcto limpia contador y racha', async () => {
    // Casi al umbral…
    for (let i = 0; i < env.LOGIN_LOCKOUT_MAX_FAILS - 1; i++) await finalize();
    // …login bueno: limpia.
    const ok = await finalize({ good: true });
    expect(ok.statusCode).toBe(200);
    // Vuelve a empezar de cero: MAX_FAILS-1 fallos no bloquean.
    for (let i = 0; i < env.LOGIN_LOCKOUT_MAX_FAILS - 1; i++) {
      expect((await finalize()).statusCode).toBe(401);
    }
    expect((await finalize({ good: true })).statusCode).toBe(200);
  });

  it('sin Redis es no-op: nunca bloquea (queda el rate-limit por IP)', async () => {
    redisAvailable = false;
    for (let i = 0; i < env.LOGIN_LOCKOUT_MAX_FAILS * 2; i++) {
      expect((await finalize()).statusCode).toBe(401);
    }
    expect((await finalize({ good: true })).statusCode).toBe(200);
  });
});
