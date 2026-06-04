import dns from 'node:dns';
// En contenedores (Render/Frankfurt) la resolución suele preferir IPv6, pero el
// egress IPv6 hacia Neon (us-east-1, publica AAAA) no rutea y la conexión a la
// BD expira. Forzamos IPv4 primero para toda resolución saliente.
dns.setDefaultResultOrder('ipv4first');

import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import sensible from '@fastify/sensible';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import websocket from '@fastify/websocket';
import { randomUUID } from 'node:crypto';

import { env } from './config.js';
import { db, initDb } from './db/pool.js';
import { initRedis, redis } from './db/redis.js';
import { initS3 } from './storage/s3.js';
import { initMail } from './mail.js';
import { initPush } from './push.js';
import { startJanitor } from './janitor.js';
import { createRedisRateLimitStore } from './rate-limit-store.js';

import authRoutes from './routes/auth.js';
import vaultRoutes from './routes/vaults.js';
import nodeRoutes from './routes/nodes.js';
import uploadRoutes from './routes/uploads.js';
import shareRoutes from './routes/shares.js';
import wsRoutes from './routes/ws.js';
import twoFactorRoutes from './routes/two_factor.js';
import storageRoutes from './routes/storage.js';
import auditRoutes from './routes/audit.js';
import pushRoutes from './routes/push.js';
import deviceRoutes from './routes/devices.js';
import adminRoutes from './routes/admin.js';
import vaultExportRoutes from './routes/vault-export.js';
import agentRoutes from './routes/agent.js';

export async function buildServer() {
  const app = Fastify({
    logger: {
      level: env.NODE_ENV === 'production' ? 'info' : 'debug',
      transport: env.NODE_ENV === 'production'
        ? undefined
        : { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss.l' } },
    },
    bodyLimit: 64 * 1024 * 1024,
    trustProxy: true,
    genReqId: (req) => (req.headers['x-request-id'] as string) ?? randomUUID(),
  });

  // ─── API docs ───────────────────────────────────────────────
  await app.register(swagger, {
    openapi: {
      info: {
        title: 'Noctcom API',
        description: 'End-to-end encrypted vault storage API',
        version: '1.0.0',
      },
      servers: [
        { url: 'https://api.noctcom.com', description: 'Production' },
        { url: 'http://localhost:4000', description: 'Local' },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
          },
        },
      },
    },
  });

  await app.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: { docExpansion: 'list', deepLinking: true },
  });

  // ─── Security plugins ──────────────────────────────────────
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'wasm-unsafe-eval'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:', 'https://fastify.dev'],
        connectSrc: ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  });

  await app.register(cors, {
    origin: env.NODE_ENV === 'production'
      ? [
          env.FRONTEND_URL ?? 'https://noctcom.com',
          'https://www.noctcom.com',
          env.PUBLIC_URL,
        ].filter(Boolean)
      : true,
    credentials: true,
    // El default de @fastify/cors es solo GET,HEAD,POST y bloqueaba el toggle de
    // favoritos (PATCH) y el envío a papelera (DELETE). Lo declaramos explícito.
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  const redisClient = redis();
  await app.register(rateLimit, {
    max: 300,
    timeWindow: 60_000,
    keyGenerator: (req) => req.headers['x-forwarded-for']?.toString() ?? req.ip,
    skipOnError: false,
    ...(redisClient ? { store: createRedisRateLimitStore(redisClient) as any } : {}),
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
      return reply.unauthorized('invalid or expired token');
    }
    // Los tokens con scope (pending-2fa, step-up) son de un solo propósito y NO
    // valen como token de sesión: solo los access tokens (sin scope) dan acceso.
    if ((req.user as { scope?: string }).scope) {
      return reply.unauthorized('token de propósito limitado, no válido para sesión');
    }
    // La revocación de sesiones tiene que ser efectiva: si el dispositivo del
    // token fue revocado, el access token deja de valer aunque no haya expirado.
    // Solo rechazamos si el dispositivo existe Y está revocado — si no existe
    // (sesión sin dispositivo registrado) no rompemos nada.
    const deviceId = (req.user as { deviceId?: string | null }).deviceId;
    if (deviceId) {
      const r = await db.query(
        `SELECT revoked_at FROM devices WHERE id = $1 AND user_id = $2`,
        [deviceId, req.user.sub],
      );
      if ((r.rowCount ?? 0) > 0 && r.rows[0].revoked_at) {
        return reply.unauthorized('sesión revocada');
      }
    }
  });

  // ─── Health ────────────────────────────────────────────────
  app.get('/health', async (_req, reply) => {
    const checks = { db: false, redis: false, s3: false };

    try { await db.query('SELECT 1'); checks.db = true; } catch { /* */ }

    const r = redis();
    if (r) {
      try { await r.ping(); checks.redis = true; } catch { /* */ }
    } else {
      checks.redis = true;
    }

    try {
      const { HeadBucketCommand } = await import('@aws-sdk/client-s3');
      const { s3 } = await import('./storage/s3.js');
      await s3.send(new HeadBucketCommand({ Bucket: env.S3_BUCKET }));
      checks.s3 = true;
    } catch { /* */ }

    const status = checks.db ? 'ok' : 'degraded';
    const code = checks.db ? 200 : 503;
    return reply.code(code).send({ status, ...checks, ts: Date.now() });
  });

  // ─── Routes ────────────────────────────────────────────────
  await app.register(authRoutes,   { prefix: '/api/v1/auth', bodyLimit: 16_384 } as any);
  await app.register(vaultRoutes,  { prefix: '/api/v1/vaults' });
  await app.register(nodeRoutes,   { prefix: '/api/v1/nodes' });
  await app.register(uploadRoutes, { prefix: '/api/v1/uploads' });
  await app.register(shareRoutes,  { prefix: '/api/v1/shares' });
  await app.register(twoFactorRoutes, { prefix: '/api/v1/2fa' });
  await app.register(wsRoutes,     { prefix: '/api/v1/ws' });
  await app.register(storageRoutes, { prefix: '/api/v1/storage' });
  await app.register(auditRoutes,  { prefix: '/api/v1/audit' });
  await app.register(pushRoutes,   { prefix: '/api/v1/push' });
  await app.register(deviceRoutes, { prefix: '/api/v1/auth/devices' });
  await app.register(adminRoutes,  { prefix: '/api/v1/admin' });
  await app.register(vaultExportRoutes, { prefix: '/api/v1/vaults' });
  await app.register(agentRoutes,  { prefix: '/api/v1/agent' });

  return app;
}

async function main() {
  await initDb();
  await initS3();
  await initRedis();
  initMail();
  initPush();

  const app = await buildServer();
  await app.listen({ host: '0.0.0.0', port: env.PORT });
  app.log.info(`Noctcom API listening on :${env.PORT}`);

  startJanitor(app.log);

  async function shutdown(signal: string) {
    app.log.info(`${signal} received, shutting down`);
    await app.close();
    await db.end();
    const r = redis();
    if (r) await r.quit().catch(() => {});
    process.exit(0);
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
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
