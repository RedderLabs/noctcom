/**
 * Valida el autenticador por software contra @simplewebauthn/server con las
 * MISMAS opciones que usa la ruta (rpID = hostname del frontend, origins =
 * frontend + API, requireUserVerification: false). Si esto pasa, las fixtures
 * son indistinguibles de las de una passkey real para el verificador.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import {
  verifyRegistrationResponse,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import { createAuthenticator, type SoftwareAuthenticator } from './webauthn-authenticator.js';

// Espejo de rpConfig() en two_factor.ts con FRONTEND_URL=https://noctcom.com y
// PUBLIC_URL=https://api.noctcom.com.
const RP_ID = 'noctcom.com';
const ORIGINS = ['https://noctcom.com', 'https://api.noctcom.com'];
const ORIGIN = 'https://noctcom.com';

const toB64 = (b: Uint8Array) => Buffer.from(b).toString('base64url');
const randomChallenge = () => new Uint8Array(Buffer.from(crypto.getRandomValues(new Uint8Array(32))));

describe('software webauthn authenticator', () => {
  let auth: SoftwareAuthenticator;
  let publicKey: Uint8Array;

  beforeAll(async () => {
    auth = await createAuthenticator({ rpID: RP_ID });
  });

  it('produce un registro que verifica y expone la clave pública', async () => {
    const challenge = randomChallenge();
    const reg = await auth.register({ challenge, origin: ORIGIN });

    const verification = await verifyRegistrationResponse({
      response: reg as any,
      expectedChallenge: toB64(challenge),
      expectedOrigin: ORIGINS,
      expectedRPID: RP_ID,
      requireUserVerification: false,
    });

    expect(verification.verified).toBe(true);
    expect(verification.registrationInfo).toBeTruthy();
    expect(verification.registrationInfo!.credential.id).toBe(auth.credentialIdB64);
    publicKey = verification.registrationInfo!.credential.publicKey;
    expect(publicKey.length).toBeGreaterThan(0);
  });

  it('produce una assertion que verifica contra la clave registrada', async () => {
    const challenge = randomChallenge();
    const assertion = await auth.authenticate({ challenge, origin: ORIGIN });

    const verification = await verifyAuthenticationResponse({
      response: assertion as any,
      expectedChallenge: toB64(challenge),
      expectedOrigin: ORIGINS,
      expectedRPID: RP_ID,
      requireUserVerification: false,
      credential: {
        id: auth.credentialIdB64,
        publicKey,
        counter: 0,
      },
    });

    expect(verification.verified).toBe(true);
    expect(verification.authenticationInfo.newCounter).toBeGreaterThan(0);
  });

  it('rechaza un challenge que no coincide', async () => {
    const assertion = await auth.authenticate({ challenge: randomChallenge(), origin: ORIGIN });
    await expect(
      verifyAuthenticationResponse({
        response: assertion as any,
        expectedChallenge: toB64(randomChallenge()), // challenge distinto
        expectedOrigin: ORIGINS,
        expectedRPID: RP_ID,
        requireUserVerification: false,
        credential: { id: auth.credentialIdB64, publicKey, counter: 0 },
      }),
    ).rejects.toThrow();
  });

  it('rechaza un origin no esperado', async () => {
    const challenge = randomChallenge();
    const assertion = await auth.authenticate({ challenge, origin: 'https://evil.example' });
    await expect(
      verifyAuthenticationResponse({
        response: assertion as any,
        expectedChallenge: toB64(challenge),
        expectedOrigin: ORIGINS,
        expectedRPID: RP_ID,
        requireUserVerification: false,
        credential: { id: auth.credentialIdB64, publicKey, counter: 0 },
      }),
    ).rejects.toThrow();
  });

  it('rechaza una firma corrupta', async () => {
    const challenge = randomChallenge();
    const assertion = await auth.authenticate({ challenge, origin: ORIGIN, tamper: true });
    const result = await verifyAuthenticationResponse({
      response: assertion as any,
      expectedChallenge: toB64(challenge),
      expectedOrigin: ORIGINS,
      expectedRPID: RP_ID,
      requireUserVerification: false,
      credential: { id: auth.credentialIdB64, publicKey, counter: 0 },
    }).catch(() => ({ verified: false }));
    expect(result.verified).toBe(false);
  });

  it('detecta regresión del counter (clonación de authenticator)', async () => {
    const challenge = randomChallenge();
    // counter del authenticator = 5, pero el servidor cree que va por 10.
    const assertion = await auth.authenticate({ challenge, origin: ORIGIN, bumpCounter: 5 });
    await expect(
      verifyAuthenticationResponse({
        response: assertion as any,
        expectedChallenge: toB64(challenge),
        expectedOrigin: ORIGINS,
        expectedRPID: RP_ID,
        requireUserVerification: false,
        credential: { id: auth.credentialIdB64, publicKey, counter: 10 },
      }),
    ).rejects.toThrow();
  });
});
