/**
 * Tests de integración de las rutas WebAuthn / passkey de two_factor.ts.
 *
 * Monta el plugin real con Fastify.inject() y un Postgres falso en memoria
 * (fake-db). El authenticator por software firma las assertions de verdad, así
 * que la verificación criptográfica de @simplewebauthn/server se ejecuta entera.
 * Cubre lo que es lógica NUESTRA (no de la librería):
 *   - registro persiste la credencial y es idempotente,
 *   - el challenge es de un solo uso (anti-replay),
 *   - login/passkey/finish exige que la passkey sea del MISMO usuario que pasó
 *     la contraseña (binding pending-token ↔ credencial),
 *   - assertions sin credencial / corruptas se rechazan.
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { randomUUID } from 'node:crypto';

// Mocks de los módulos que two_factor.ts importa. Deben declararse antes de
// construir el servidor; vitest los iza por encima de los imports.
vi.mock('../config.js', () => ({
  env: {
    NODE_ENV: 'test',
    FRONTEND_URL: 'https://noctcom.com',
    PUBLIC_URL: 'https://api.noctcom.com',
    JWT_SECRET: 'test-secret-must-be-at-least-32-chars-long',
  },
}));
vi.mock('../db/pool.js', async () => ({ db: (await import('./fake-db.js')).db }));
vi.mock('../mail.js', () => ({ sendLoginCodeEmail: vi.fn(async () => {}) }));
vi.mock('../session.js', () => ({
  issueSession: vi.fn(async () => ({ accessToken: 'issued-access', refreshToken: 'issued-refresh' })),
}));

import Fastify, { type FastifyInstance } from 'fastify';
import sensible from '@fastify/sensible';
import jwt from '@fastify/jwt';
import twoFactorRoutes from '../routes/two_factor.js';
import { resetDb, seedUser } from './fake-db.js';
import { createAuthenticator, type SoftwareAuthenticator } from './webauthn-authenticator.js';

const ORIGIN = 'https://noctcom.com';
const RP_ID = 'noctcom.com';
const JWT_SECRET = 'test-secret-must-be-at-least-32-chars-long';

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify();
  await app.register(sensible);
  await app.register(jwt, { secret: JWT_SECRET });
  // Stub de autenticación: la cabecera x-test-sub hace de sesión válida.
  app.decorate('authenticate', async (req: any, reply: any) => {
    const sub = req.headers['x-test-sub'];
    if (!sub) return reply.unauthorized('sin sesión de test');
    req.user = { sub, deviceId: req.headers['x-test-device'] ?? null };
  });
  await app.register(twoFactorRoutes);
  await app.ready();
  return app;
}

// Helpers contra los endpoints reales ------------------------------------------
async function registerPasskey(
  app: FastifyInstance,
  auth: SoftwareAuthenticator,
  userId: string,
  nickname = 'Mi llave',
) {
  const begin = await app.inject({
    method: 'POST',
    url: '/webauthn/register/begin',
    headers: { 'x-test-sub': userId },
    payload: {},
  });
  const challenge = Buffer.from(begin.json().challenge, 'base64url');
  const response = await auth.register({ challenge, origin: ORIGIN });
  return app.inject({
    method: 'POST',
    url: '/webauthn/register/finish',
    headers: { 'x-test-sub': userId },
    payload: { response, nickname },
  });
}

async function assertion(
  app: FastifyInstance,
  auth: SoftwareAuthenticator,
  emailHashB64: string,
  opts: { tamper?: boolean } = {},
) {
  const begin = await app.inject({
    method: 'POST',
    url: '/webauthn/authenticate/begin',
    payload: { emailHash: emailHashB64 },
  });
  const challenge = Buffer.from(begin.json().challenge, 'base64url');
  return auth.authenticate({ challenge, origin: ORIGIN, tamper: opts.tamper });
}

// -----------------------------------------------------------------------------
describe('rutas WebAuthn (two_factor)', () => {
  let app: FastifyInstance;
  let auth: SoftwareAuthenticator;
  let userId: string;
  let emailHash: Buffer;
  let emailHashB64: string;

  beforeAll(async () => {
    app = await buildApp();
  });

  beforeEach(async () => {
    resetDb();
    userId = randomUUID();
    emailHash = Buffer.from(crypto.getRandomValues(new Uint8Array(32)));
    emailHashB64 = emailHash.toString('base64url');
    seedUser({ id: userId, username: 'noctuser', email_hash: emailHash });
    auth = await createAuthenticator({ rpID: RP_ID });
  });

  it('registra una passkey y la lista', async () => {
    const reg = await registerPasskey(app, auth, userId);
    expect(reg.statusCode).toBe(201);
    expect(reg.json()).toEqual({ ok: true });

    const list = await app.inject({
      method: 'GET',
      url: '/webauthn',
      headers: { 'x-test-sub': userId },
    });
    expect(list.statusCode).toBe(200);
    const passkeys = list.json().passkeys;
    expect(passkeys).toHaveLength(1);
    expect(passkeys[0].nickname).toBe('Mi llave');
  });

  it('register/begin exige sesión', async () => {
    const res = await app.inject({ method: 'POST', url: '/webauthn/register/begin', payload: {} });
    expect(res.statusCode).toBe(401);
  });

  it('re-registrar la misma passkey es idempotente (no duplica)', async () => {
    await registerPasskey(app, auth, userId);
    await registerPasskey(app, auth, userId); // segunda vez, mismo credentialId
    const list = await app.inject({
      method: 'GET',
      url: '/webauthn',
      headers: { 'x-test-sub': userId },
    });
    expect(list.json().passkeys).toHaveLength(1);
  });

  it('register/finish rechaza si no hay challenge (un solo uso)', async () => {
    const begin = await app.inject({
      method: 'POST',
      url: '/webauthn/register/begin',
      headers: { 'x-test-sub': userId },
      payload: {},
    });
    const challenge = Buffer.from(begin.json().challenge, 'base64url');
    const response = await auth.register({ challenge, origin: ORIGIN });

    const first = await app.inject({
      method: 'POST',
      url: '/webauthn/register/finish',
      headers: { 'x-test-sub': userId },
      payload: { response },
    });
    expect(first.statusCode).toBe(201);

    // El challenge ya se consumió; reusar el mismo attestation falla.
    const second = await app.inject({
      method: 'POST',
      url: '/webauthn/register/finish',
      headers: { 'x-test-sub': userId },
      payload: { response },
    });
    expect(second.statusCode).toBe(401);
  });

  it('authenticate/finish verifica una assertion real', async () => {
    await registerPasskey(app, auth, userId);
    const response = await assertion(app, auth, emailHashB64);
    const res = await app.inject({
      method: 'POST',
      url: '/webauthn/authenticate/finish',
      payload: { response },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true, verified: true, userId });
  });

  it('authenticate/finish rechaza una firma corrupta', async () => {
    await registerPasskey(app, auth, userId);
    const response = await assertion(app, auth, emailHashB64, { tamper: true });
    const res = await app.inject({
      method: 'POST',
      url: '/webauthn/authenticate/finish',
      payload: { response },
    });
    expect(res.statusCode).toBe(401);
  });

  it('authenticate/finish rechaza un challenge ya usado (anti-replay)', async () => {
    await registerPasskey(app, auth, userId);
    const response = await assertion(app, auth, emailHashB64);
    const first = await app.inject({
      method: 'POST',
      url: '/webauthn/authenticate/finish',
      payload: { response },
    });
    expect(first.statusCode).toBe(200);
    // Mismo response (mismo challenge ya consumido) → replay rechazado.
    const replay = await app.inject({
      method: 'POST',
      url: '/webauthn/authenticate/finish',
      payload: { response },
    });
    expect(replay.statusCode).toBe(401);
  });

  it('authenticate/finish rechaza una credencial inexistente', async () => {
    // Passkey nunca registrada en el servidor.
    seedUser({ id: userId, username: 'noctuser', email_hash: emailHash });
    const begin = await app.inject({
      method: 'POST',
      url: '/webauthn/authenticate/begin',
      payload: { emailHash: emailHashB64 },
    });
    const challenge = Buffer.from(begin.json().challenge, 'base64url');
    const response = await auth.authenticate({ challenge, origin: ORIGIN });
    const res = await app.inject({
      method: 'POST',
      url: '/webauthn/authenticate/finish',
      payload: { response },
    });
    expect(res.statusCode).toBe(401);
  });

  describe('login/passkey/finish (2º factor)', () => {
    function pendingToken(sub: string): string {
      return app.jwt.sign({ sub, deviceId: null, scope: 'pending-2fa' });
    }

    it('completa el login cuando la passkey es del mismo usuario', async () => {
      await registerPasskey(app, auth, userId);
      const response = await assertion(app, auth, emailHashB64);
      const res = await app.inject({
        method: 'POST',
        url: '/login/passkey/finish',
        payload: { pending2faToken: pendingToken(userId), response },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ accessToken: 'issued-access' });
    });

    it('rechaza si la passkey pertenece a OTRO usuario (binding)', async () => {
      await registerPasskey(app, auth, userId);
      const response = await assertion(app, auth, emailHashB64);
      // El pending token es de un usuario distinto al dueño de la passkey.
      const otherUser = randomUUID();
      seedUser({ id: otherUser, username: 'otro', email_hash: Buffer.alloc(32, 9) });
      const res = await app.inject({
        method: 'POST',
        url: '/login/passkey/finish',
        payload: { pending2faToken: pendingToken(otherUser), response },
      });
      expect(res.statusCode).toBe(401);
    });

    it('rechaza un pending token con scope incorrecto', async () => {
      await registerPasskey(app, auth, userId);
      const response = await assertion(app, auth, emailHashB64);
      const badToken = app.jwt.sign({ sub: userId, scope: 'full-session' });
      const res = await app.inject({
        method: 'POST',
        url: '/login/passkey/finish',
        payload: { pending2faToken: badToken, response },
      });
      expect(res.statusCode).toBe(401);
    });
  });
});
