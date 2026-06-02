/**
 * Autenticador WebAuthn por software para tests.
 *
 * Reproduce lo que haría una passkey real (un authenticator FIDO2 con clave
 * ES256/P-256): genera respuestas de registro (attestation) y de autenticación
 * (assertion) firmadas de verdad, para que @simplewebauthn/server las verifique
 * exactamente igual que en producción. NO es un mock: la firma es real y la
 * verificación criptográfica se ejecuta de principio a fin.
 *
 * Atestación "none" (la que pide nuestra ruta: attestation: 'none'), algoritmo
 * ES256 (-7). Suficiente para ejercitar register/finish y authenticate/finish.
 */
import { createHash, webcrypto } from 'node:crypto';
import { isoBase64URL, isoCBOR, isoUint8Array } from '@simplewebauthn/server/helpers';

const subtle = webcrypto.subtle;

function sha256(data: Uint8Array): Uint8Array {
  return new Uint8Array(createHash('sha256').update(data).digest());
}

// WebCrypto firma ECDSA en formato P1363 (r||s, 64 bytes); WebAuthn transporta
// la firma en DER (ASN.1). Convertimos r||s → DER para que coincida con lo que
// envía un authenticator real (simplewebauthn la des-DER-iza antes de verificar).
function p1363ToDer(raw: Uint8Array): Uint8Array {
  const encodeInt = (bytes: Uint8Array): Uint8Array => {
    let i = 0;
    while (i < bytes.length - 1 && bytes[i] === 0) i++; // quita ceros a la izquierda
    let v = bytes.slice(i);
    if (v[0]! & 0x80) v = isoUint8Array.concat([new Uint8Array([0x00]), v]); // bit alto → byte 0x00
    return isoUint8Array.concat([new Uint8Array([0x02, v.length]), v]);
  };
  const r = encodeInt(raw.slice(0, 32));
  const s = encodeInt(raw.slice(32, 64));
  const body = isoUint8Array.concat([r, s]);
  return isoUint8Array.concat([new Uint8Array([0x30, body.length]), body]);
}

function u32(n: number): Uint8Array {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n, false); // big-endian
  return b;
}

export type RegistrationResponseJSON = {
  id: string;
  rawId: string;
  response: { clientDataJSON: string; attestationObject: string; transports: string[] };
  type: 'public-key';
  clientExtensionResults: Record<string, unknown>;
  authenticatorAttachment?: string;
};

export type AuthenticationResponseJSON = {
  id: string;
  rawId: string;
  response: {
    clientDataJSON: string;
    authenticatorData: string;
    signature: string;
    userHandle?: string;
  };
  type: 'public-key';
  clientExtensionResults: Record<string, unknown>;
};

export interface SoftwareAuthenticator {
  /** credentialId codificado en base64url (== response.id). */
  readonly credentialIdB64: string;
  /** Genera una respuesta de registro firmada para el challenge dado. */
  register(opts: { challenge: Uint8Array; origin: string }): Promise<RegistrationResponseJSON>;
  /** Genera una assertion firmada. `tamper` corrompe la firma a propósito. */
  authenticate(opts: {
    challenge: Uint8Array;
    origin: string;
    tamper?: boolean;
    bumpCounter?: number;
  }): Promise<AuthenticationResponseJSON>;
}

/**
 * Crea un authenticator por software ligado a un rpID concreto.
 * Cada instancia tiene su propio par de claves y credentialId estable.
 */
export async function createAuthenticator(opts: {
  rpID: string;
  credentialId?: Uint8Array;
}): Promise<SoftwareAuthenticator> {
  const rpIdHash = sha256(new TextEncoder().encode(opts.rpID));
  const credentialId = opts.credentialId ?? webcrypto.getRandomValues(new Uint8Array(16));

  const keyPair = (await subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify'],
  )) as CryptoKeyPair;

  // Clave pública en formato COSE_Key (EC2/ES256) para el attestedCredentialData.
  const jwk = await subtle.exportKey('jwk', keyPair.publicKey);
  const x = isoBase64URL.toBuffer(jwk.x!);
  const y = isoBase64URL.toBuffer(jwk.y!);
  const cosePublicKey = isoCBOR.encode(
    new Map<number, number | Uint8Array>([
      [1, 2], // kty: EC2
      [3, -7], // alg: ES256
      [-1, 1], // crv: P-256
      [-2, x], // x
      [-3, y], // y
    ]),
  );

  // counter monótono: detecta clonación de authenticators en el servidor.
  let counter = 0;

  const clientDataJSON = (type: string, challenge: Uint8Array, origin: string): Uint8Array =>
    new TextEncoder().encode(
      JSON.stringify({
        type,
        challenge: isoBase64URL.fromBuffer(challenge),
        origin,
        crossOrigin: false,
      }),
    );

  async function sign(data: Uint8Array): Promise<Uint8Array> {
    const raw = new Uint8Array(
      await subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, keyPair.privateKey, data),
    );
    return p1363ToDer(raw);
  }

  return {
    credentialIdB64: isoBase64URL.fromBuffer(credentialId),

    async register({ challenge, origin }) {
      const clientData = clientDataJSON('webauthn.create', challenge, origin);
      const flags = 0x01 | 0x40; // UP (user present) + AT (attested credential data)
      const aaguid = new Uint8Array(16); // todo ceros (atestación "none")
      const credIdLen = new Uint8Array(2);
      new DataView(credIdLen.buffer).setUint16(0, credentialId.length, false);
      const attestedCredentialData = isoUint8Array.concat([
        aaguid,
        credIdLen,
        credentialId,
        cosePublicKey,
      ]);
      const authData = isoUint8Array.concat([
        rpIdHash,
        new Uint8Array([flags]),
        u32(counter),
        attestedCredentialData,
      ]);
      const attestationObject = isoCBOR.encode(
        new Map<string, unknown>([
          ['fmt', 'none'],
          ['attStmt', new Map()],
          ['authData', authData],
        ]),
      );
      return {
        id: isoBase64URL.fromBuffer(credentialId),
        rawId: isoBase64URL.fromBuffer(credentialId),
        response: {
          clientDataJSON: isoBase64URL.fromBuffer(clientData),
          attestationObject: isoBase64URL.fromBuffer(attestationObject),
          transports: ['internal'],
        },
        type: 'public-key',
        clientExtensionResults: {},
        authenticatorAttachment: 'platform',
      };
    },

    async authenticate({ challenge, origin, tamper, bumpCounter }) {
      counter = bumpCounter ?? counter + 1;
      const clientData = clientDataJSON('webauthn.get', challenge, origin);
      const flags = 0x01; // UP, sin attested credential data
      const authData = isoUint8Array.concat([rpIdHash, new Uint8Array([flags]), u32(counter)]);
      const signed = isoUint8Array.concat([authData, sha256(clientData)]);
      const signature = await sign(signed);
      if (tamper) signature[signature.length - 1] ^= 0xff; // corrompe el último byte
      return {
        id: isoBase64URL.fromBuffer(credentialId),
        rawId: isoBase64URL.fromBuffer(credentialId),
        response: {
          clientDataJSON: isoBase64URL.fromBuffer(clientData),
          authenticatorData: isoBase64URL.fromBuffer(authData),
          signature: isoBase64URL.fromBuffer(signature),
        },
        type: 'public-key',
        clientExtensionResults: {},
      };
    },
  };
}
