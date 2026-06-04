/**
 * Tests de las rutas de recuperación (Recovery v2) de two_factor.ts.
 *
 * Ejercitan la criptografía REAL del flujo: derivan de una "mnemónica" los
 * mismos pares que el frontend (Ed25519 para firmar, X25519 para los seals),
 * sellan vault keys con crypto_box_seal y recorren init → unlock → finalize
 * contra el plugin real montado con Fastify.inject() y el fake-db.
 *
 * Cubre lo que es lógica nuestra:
 *   - unlock solo entrega los seals con una firma válida (y son abribles),
 *   - finalize re-wrappea las vault keys y conserva el par exchange,
 *   - el token de recuperación es de un solo uso (anti-replay),
 *   - no se pueden tocar vaults de otro usuario,
 *   - status refleja kit completo/incompleto,
 *   - upgrade exige step-up y permite rotar la frase,
 *   - cuentas pre-v2 (sin box key) siguen pudiendo recuperar el acceso.
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { randomUUID, randomBytes } from 'node:crypto';

vi.mock('../config.js', () => ({
  env: {
    NODE_ENV: 'test',
    FRONTEND_URL: 'https://noctcom.com',
    PUBLIC_URL: 'https://api.noctcom.com',
    JWT_SECRET: 'test-secret-must-be-at-least-32-chars-long',
  },
}));
vi.mock('../db/pool.js', async () => {
  const f = await import('./fake-db.js');
  return { db: f.db, tx: f.tx };
});
vi.mock('../mail.js', () => ({ sendLoginCodeEmail: vi.fn(async () => {}), normalizeLocale: () => 'es' }));
vi.mock('../session.js', () => ({
  issueSession: vi.fn(async () => ({ accessToken: 'issued-access', refreshToken: 'issued-refresh' })),
}));

import Fastify, { type FastifyInstance } from 'fastify';
import sensible from '@fastify/sensible';
import jwt from '@fastify/jwt';
import sodium from 'libsodium-wrappers-sumo';
import twoFactorRoutes from '../routes/two_factor.js';
import { resetDb, seedUser, seedVault, store } from './fake-db.js';

const JWT_SECRET = 'test-secret-must-be-at-least-32-chars-long';

const b64 = (b: Uint8Array | Buffer) => Buffer.from(b).toString('base64url');
const fromB64 = (s: string) => Buffer.from(s, 'base64url');

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify();
  await app.register(sensible);
  await app.register(jwt, { secret: JWT_SECRET });
  app.decorate('authenticate', async (req: any, reply: any) => {
    const sub = req.headers['x-test-sub'];
    if (!sub) return reply.unauthorized('sin sesión de test');
    req.user = { sub, deviceId: null };
  });
  await app.register(twoFactorRoutes);
  await app.ready();
  return app;
}

// Deriva de la mnemónica exactamente lo mismo que frontend/lib/recovery.ts.
function clientRecoveryKeys(mnemonic: string) {
  const seed = sodium.crypto_generichash(
    32, sodium.from_string(mnemonic), sodium.from_string('noctcom.recovery.v1'),
  );
  const signKp = sodium.crypto_sign_seed_keypair(seed);
  const boxSeed = sodium.crypto_generichash(
    32, sodium.from_string('noctcom.recovery.box.v1'), seed,
  );
  const boxKp = sodium.crypto_box_seed_keypair(boxSeed);
  return { signKp, boxKp };
}

describe('recuperación v2 (two_factor)', () => {
  let app: FastifyInstance;
  let userId: string;
  let emailHash: Buffer;
  let emailHashB64: string;
  let keys: ReturnType<typeof clientRecoveryKeys>;
  let exchangeKp: { publicKey: Uint8Array; privateKey: Uint8Array };
  let vaultKey: Uint8Array;
  let vaultId: string;

  beforeAll(async () => {
    await sodium.ready;
    app = await buildApp();
  });

  beforeEach(() => {
    resetDb();
    userId = randomUUID();
    vaultId = randomUUID();
    emailHash = randomBytes(32);
    emailHashB64 = b64(emailHash);
    keys = clientRecoveryKeys('palabra '.repeat(11) + 'final');
    exchangeKp = sodium.crypto_box_keypair();
    vaultKey = sodium.crypto_aead_xchacha20poly1305_ietf_keygen();

    seedUser({
      id: userId,
      email_hash: emailHash,
      recovery_enabled: true,
      recovery_public_key: Buffer.from(keys.signKp.publicKey),
      recovery_box_public_key: Buffer.from(keys.boxKp.publicKey),
      recovery_kdf_salt: randomBytes(16),
      exchange_public_key: Buffer.from(exchangeKp.publicKey),
      exchange_private_key_sealed_recovery: Buffer.from(
        sodium.crypto_box_seal(exchangeKp.privateKey, keys.boxKp.publicKey),
      ),
    });
    seedVault({
      id: vaultId,
      owner_id: userId,
      vault_key_sealed_recovery: Buffer.from(
        sodium.crypto_box_seal(vaultKey, keys.boxKp.publicKey),
      ),
    });
  });

  async function initChallenge(): Promise<string> {
    const res = await app.inject({
      method: 'POST', url: '/recovery/init', payload: { emailHash: emailHashB64 },
    });
    expect(res.statusCode).toBe(200);
    return res.json().challenge as string;
  }

  function signChallenge(challenge: string, signKp = keys.signKp): string {
    return b64(sodium.crypto_sign_detached(fromB64(challenge), signKp.privateKey));
  }

  async function unlock(challenge: string, signature: string) {
    return app.inject({
      method: 'POST', url: '/recovery/unlock',
      payload: { emailHash: emailHashB64, challenge, signature },
    });
  }

  function finalizePayload(challenge: string, extra: Record<string, unknown> = {}) {
    return {
      emailHash: emailHashB64,
      challenge,
      signature: signChallenge(challenge),
      newOpaqueRecord: b64(randomBytes(64)),
      newKdfSalt: b64(randomBytes(16)),
      newKdfOpsLimit: 3,
      newKdfMemLimit: 268435456,
      newIdentityPublicKey: b64(randomBytes(32)),
      newIdentityPrivateKeyWrapped: b64(randomBytes(80)),
      newIdentityPrivateKeyNonce: b64(randomBytes(24)),
      newExchangePublicKey: b64(exchangeKp.publicKey),
      newExchangePrivateKeyWrapped: b64(randomBytes(48)),
      newExchangePrivateKeyNonce: b64(randomBytes(24)),
      ...extra,
    };
  }

  it('unlock entrega los seals con firma válida, y se abren con la mnemónica', async () => {
    const challenge = await initChallenge();
    const res = await unlock(challenge, signChallenge(challenge));
    expect(res.statusCode).toBe(200);

    const body = res.json();
    expect(body.recoveryBoxPublicKey).toBe(b64(keys.boxKp.publicKey));
    expect(body.exchangePublicKey).toBe(b64(exchangeKp.publicKey));
    expect(body.vaults).toHaveLength(1);
    expect(body.vaults[0].id).toBe(vaultId);

    // El cliente abre los seals con la privada derivada de la mnemónica
    const openedVaultKey = sodium.crypto_box_seal_open(
      fromB64(body.vaults[0].vaultKeySealedRecovery),
      keys.boxKp.publicKey, keys.boxKp.privateKey,
    );
    expect(Buffer.from(openedVaultKey)).toEqual(Buffer.from(vaultKey));

    const openedExchangeSk = sodium.crypto_box_seal_open(
      fromB64(body.exchangePrivateKeySealedRecovery),
      keys.boxKp.publicKey, keys.boxKp.privateKey,
    );
    expect(Buffer.from(openedExchangeSk)).toEqual(Buffer.from(exchangeKp.privateKey));
  });

  it('unlock rechaza la firma de otra frase', async () => {
    const challenge = await initChallenge();
    const otra = clientRecoveryKeys('otra frase completamente distinta');
    const res = await unlock(challenge, signChallenge(challenge, otra.signKp));
    expect(res.statusCode).toBe(401);
  });

  it('unlock no consume el token: finalize sigue funcionando después', async () => {
    const challenge = await initChallenge();
    await unlock(challenge, signChallenge(challenge));

    const res = await app.inject({
      method: 'POST', url: '/recovery/finalize', payload: finalizePayload(challenge),
    });
    expect(res.statusCode).toBe(200);
  });

  it('finalize re-wrappea vault keys, conserva la exchange pública y revoca sesiones', async () => {
    const challenge = await initChallenge();
    const newWrapped = randomBytes(48);
    const newNonce = randomBytes(24);

    const res = await app.inject({
      method: 'POST', url: '/recovery/finalize',
      payload: finalizePayload(challenge, {
        vaults: [{ id: vaultId, vaultKeyWrapped: b64(newWrapped), vaultKeyNonce: b64(newNonce) }],
      }),
    });
    expect(res.statusCode).toBe(200);

    const v = store.vaults.find((x) => x.id === vaultId)!;
    expect(v.vault_key_wrapped).toEqual(newWrapped);
    expect(v.vault_key_nonce).toEqual(newNonce);
    // El seal de recuperación NO cambia: la mnemónica es la misma
    expect(v.vault_key_sealed_recovery).not.toBeNull();

    const u = store.users.get(userId)!;
    expect(u.exchange_public_key).toEqual(Buffer.from(exchangeKp.publicKey));
    expect(store.revokedSessionsFor).toContain(userId);
    expect(store.resetTokens[0]!.used_at).not.toBeNull();
  });

  it('finalize rechaza vaults de otro usuario', async () => {
    const otroVault = randomUUID();
    seedVault({ id: otroVault, owner_id: randomUUID() });

    const challenge = await initChallenge();
    const res = await app.inject({
      method: 'POST', url: '/recovery/finalize',
      payload: finalizePayload(challenge, {
        vaults: [{ id: otroVault, vaultKeyWrapped: b64(randomBytes(48)), vaultKeyNonce: b64(randomBytes(24)) }],
      }),
    });
    expect(res.statusCode).toBe(400);
  });

  it('el token de recuperación es de un solo uso (anti-replay)', async () => {
    const challenge = await initChallenge();
    const first = await app.inject({
      method: 'POST', url: '/recovery/finalize', payload: finalizePayload(challenge),
    });
    expect(first.statusCode).toBe(200);

    const replay = await app.inject({
      method: 'POST', url: '/recovery/finalize', payload: finalizePayload(challenge),
    });
    expect(replay.statusCode).toBe(401);
  });

  it('status refleja kit completo e incompleto', async () => {
    const ok = await app.inject({
      method: 'GET', url: '/recovery/status', headers: { 'x-test-sub': userId },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toMatchObject({
      recoveryEnabled: true, exchangeSealed: true, vaultsTotal: 1, vaultsSealed: 1,
    });

    // Una bóveda nueva sin seal deja el kit incompleto
    seedVault({ id: randomUUID(), owner_id: userId });
    const incomplete = await app.inject({
      method: 'GET', url: '/recovery/status', headers: { 'x-test-sub': userId },
    });
    expect(incomplete.json()).toMatchObject({ vaultsTotal: 2, vaultsSealed: 1 });
  });

  it('upgrade exige step-up', async () => {
    const res = await app.inject({
      method: 'POST', url: '/recovery/upgrade', headers: { 'x-test-sub': userId },
      payload: {
        recoveryBoxPublicKey: b64(randomBytes(32)),
        exchangePrivateKeySealedRecovery: b64(randomBytes(80)),
        vaults: [],
      },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error).toBe('step-up-required');
  });

  it('upgrade sube seals nuevos y puede rotar la frase', async () => {
    const nuevas = clientRecoveryKeys('frase nueva regenerada en ajustes');
    const stepUp = app.jwt.sign({ sub: userId, scope: 'step-up' });
    const sealNuevo = sodium.crypto_box_seal(vaultKey, nuevas.boxKp.publicKey);

    const res = await app.inject({
      method: 'POST', url: '/recovery/upgrade',
      headers: { 'x-test-sub': userId, 'x-step-up-token': stepUp },
      payload: {
        recoveryPublicKey: b64(nuevas.signKp.publicKey),
        recoveryBoxPublicKey: b64(nuevas.boxKp.publicKey),
        exchangePrivateKeySealedRecovery: b64(
          sodium.crypto_box_seal(exchangeKp.privateKey, nuevas.boxKp.publicKey),
        ),
        vaults: [{ id: vaultId, vaultKeySealedRecovery: b64(sealNuevo) }],
      },
    });
    expect(res.statusCode).toBe(200);

    const u = store.users.get(userId)!;
    expect(u.recovery_public_key).toEqual(Buffer.from(nuevas.signKp.publicKey));
    expect(u.recovery_box_public_key).toEqual(Buffer.from(nuevas.boxKp.publicKey));

    const v = store.vaults.find((x) => x.id === vaultId)!;
    expect(sodium.crypto_box_seal_open(
      new Uint8Array(v.vault_key_sealed_recovery!),
      nuevas.boxKp.publicKey, nuevas.boxKp.privateKey,
    )).toEqual(vaultKey);
  });

  it('cuenta pre-v2: unlock devuelve box key null y finalize sin vaults funciona', async () => {
    resetDb();
    seedUser({
      id: userId,
      email_hash: emailHash,
      recovery_enabled: true,
      recovery_public_key: Buffer.from(keys.signKp.publicKey),
      recovery_kdf_salt: randomBytes(16),
      exchange_public_key: Buffer.from(exchangeKp.publicKey),
      // sin recovery_box_public_key ni seals: cuenta anterior a v2
    });
    seedVault({ id: vaultId, owner_id: userId });

    const challenge = await initChallenge();
    const u = await unlock(challenge, signChallenge(challenge));
    expect(u.statusCode).toBe(200);
    expect(u.json().recoveryBoxPublicKey).toBeNull();
    expect(u.json().vaults).toHaveLength(0);

    const res = await app.inject({
      method: 'POST', url: '/recovery/finalize', payload: finalizePayload(challenge),
    });
    expect(res.statusCode).toBe(200);
  });
});
