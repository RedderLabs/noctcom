import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import sensible from '@fastify/sensible';
import websocket from '@fastify/websocket';

import { env } from './config.js';
import { initDb } from './db/pool.js';
import { initRedis } from './db/redis.js';
import { initS3 } from './storage/s3.js';

import authRoutes from './routes/auth.js';
import vaultRoutes from './routes/vaults.js';
import nodeRoutes from './routes/nodes.js';
import uploadRoutes from './routes/uploads.js';
import shareRoutes from './routes/shares.js';
import wsRoutes from './routes/ws.js';
import twoFactorRoutes from './routes/two_factor.js';

async function buildServer() {
  const app = Fastify({
    logger: {
      level: env.NODE_ENV === 'production' ? 'info' : 'debug',
      transport: env.NODE_ENV === 'production'
        ? undefined
        : { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss.l' } },
    },
    bodyLimit: 64 * 1024 * 1024,    // 64 MiB para JSON. Los chunks van por presigned URL directos a MinIO.
    trustProxy: true,
  });

  // ─── Security plugins ──────────────────────────────────────
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'wasm-unsafe-eval'"],   // libsodium WASM
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        connectSrc: ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  });

  await app.register(cors, {
    origin: env.NODE_ENV === 'production'
      ? [env.FRONTEND_URL ?? env.PUBLIC_URL]
      : true,
    credentials: true,
  });

  await app.register(rateLimit, {
    max: 300,
    timeWindow: '1 minute',
    redis: env.REDIS_URL ? await initRedis() : undefined,
    keyGenerator: (req) => req.headers['x-forwarded-for']?.toString() ?? req.ip,
    skipOnError: false,
  });

  await app.register(jwt, {
    secret: env.JWT_SECRET,
    sign: { expiresIn: '15m' },
  });

  await app.register(sensible);
  await app.register(websocket);

  // ─── Auth decorator ────────────────────────────────────────
  app.decorate('authenticate', async (req, reply) => {
    try {
      await req.jwtVerify();
    } catch {
      reply.unauthorized('invalid or expired token');
    }
  });

  // ─── Health ────────────────────────────────────────────────
  app.get('/health', async () => ({ status: 'ok', ts: Date.now() }));

  // ─── Routes ────────────────────────────────────────────────
  await app.register(authRoutes,   { prefix: '/api/v1/auth' });
  await app.register(vaultRoutes,  { prefix: '/api/v1/vaults' });
  await app.register(nodeRoutes,   { prefix: '/api/v1/nodes' });
  await app.register(uploadRoutes, { prefix: '/api/v1/uploads' });
  await app.register(shareRoutes,  { prefix: '/api/v1/shares' });
  await app.register(twoFactorRoutes, { prefix: '/api/v1/2fa' });
  await app.register(wsRoutes,     { prefix: '/api/v1/ws' });

  return app;
}

async function main() {
  await initDb();
  await initS3();

  const app = await buildServer();
  await app.listen({ host: '0.0.0.0', port: env.PORT });
  app.log.info(`CryptVault API listening on :${env.PORT}`);
}

main().catch((err) => {
  console.error('fatal startup error:', err);
  process.exit(1);
});

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (req: any, reply: any) => Promise<void>;
  }
  interface FastifyJWT {
    payload: { sub: string; deviceId: string };
    user: { sub: string; deviceId: string };
  }
}
