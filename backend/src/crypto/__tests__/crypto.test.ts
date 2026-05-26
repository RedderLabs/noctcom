import { describe, it, expect, beforeAll } from 'vitest';
import {
  ready, randomBytes, randomKey, randomNonce,
  encrypt, decrypt, encryptString, decryptString,
  wrapKey, unwrapKey,
  generateIdentityKeyPair, generateExchangeKeyPair,
  sign, verify,
  sealForRecipient, openSealed,
  hashEmail, contentHash,
  encryptFileStream, decryptChunk,
  deriveRecoveryKey, generateRecoverySeed,
  toBase64, fromBase64, toHex, fromHex,
  KEY_BYTES, NONCE_BYTES, CHUNK_SIZE,
} from '../index.js';

beforeAll(async () => {
  await ready();
});

// ─── Random helpers ──────────────────────────────────────────
describe('random helpers', () => {
  it('randomBytes produces correct length', () => {
    expect(randomBytes(16).length).toBe(16);
    expect(randomBytes(32).length).toBe(32);
    expect(randomBytes(64).length).toBe(64);
  });

  it('randomKey produces KEY_BYTES length', () => {
    expect(randomKey().length).toBe(KEY_BYTES);
  });

  it('randomNonce produces NONCE_BYTES length', () => {
    expect(randomNonce().length).toBe(NONCE_BYTES);
  });

  it('randomBytes produces different values each call', () => {
    const a = randomBytes(32);
    const b = randomBytes(32);
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(false);
  });
});

// ─── AEAD encrypt/decrypt ────────────────────────────────────
describe('AEAD XChaCha20-Poly1305', () => {
  it('encrypt/decrypt roundtrip', () => {
    const key = randomKey();
    const plaintext = randomBytes(256);
    const { ciphertext, nonce } = encrypt(plaintext, key);
    const decrypted = decrypt(ciphertext, nonce, key);
    expect(Buffer.from(decrypted).equals(Buffer.from(plaintext))).toBe(true);
  });

  it('encrypt produces different ciphertexts for same plaintext', () => {
    const key = randomKey();
    const plaintext = randomBytes(64);
    const a = encrypt(plaintext, key);
    const b = encrypt(plaintext, key);
    expect(Buffer.from(a.ciphertext).equals(Buffer.from(b.ciphertext))).toBe(false);
    expect(Buffer.from(a.nonce).equals(Buffer.from(b.nonce))).toBe(false);
  });

  it('decrypt with wrong key throws', () => {
    const key = randomKey();
    const wrongKey = randomKey();
    const { ciphertext, nonce } = encrypt(randomBytes(32), key);
    expect(() => decrypt(ciphertext, nonce, wrongKey)).toThrow();
  });

  it('decrypt with tampered ciphertext throws', () => {
    const key = randomKey();
    const { ciphertext, nonce } = encrypt(randomBytes(32), key);
    ciphertext[0] ^= 0xff;
    expect(() => decrypt(ciphertext, nonce, key)).toThrow();
  });

  it('encrypt/decrypt with AAD', () => {
    const key = randomKey();
    const aad = new TextEncoder().encode('associated-data');
    const plaintext = randomBytes(64);
    const { ciphertext, nonce } = encrypt(plaintext, key, aad);
    const decrypted = decrypt(ciphertext, nonce, key, aad);
    expect(Buffer.from(decrypted).equals(Buffer.from(plaintext))).toBe(true);
  });

  it('decrypt with wrong AAD throws', () => {
    const key = randomKey();
    const aad = new TextEncoder().encode('correct-aad');
    const wrongAad = new TextEncoder().encode('wrong-aad');
    const { ciphertext, nonce } = encrypt(randomBytes(32), key, aad);
    expect(() => decrypt(ciphertext, nonce, key, wrongAad)).toThrow();
  });

  it('encryptString/decryptString roundtrip with UTF-8', () => {
    const key = randomKey();
    const text = 'Hello 🌍 Ñ 你好 مرحبا';
    const { ciphertext, nonce } = encryptString(text, key);
    const decrypted = decryptString(ciphertext, nonce, key);
    expect(decrypted).toBe(text);
  });

  it('empty plaintext roundtrip', () => {
    const key = randomKey();
    const { ciphertext, nonce } = encrypt(new Uint8Array(0), key);
    const decrypted = decrypt(ciphertext, nonce, key);
    expect(decrypted.length).toBe(0);
  });
});

// ─── Key wrapping ────────────────────────────────────────────
describe('key wrapping', () => {
  it('wrapKey/unwrapKey roundtrip', () => {
    const wrappingKey = randomKey();
    const keyToWrap = randomKey();
    const wrapped = wrapKey(keyToWrap, wrappingKey);
    const unwrapped = unwrapKey(wrapped, wrappingKey);
    expect(Buffer.from(unwrapped).equals(Buffer.from(keyToWrap))).toBe(true);
  });

  it('unwrapKey with wrong wrapping key throws', () => {
    const wrappingKey = randomKey();
    const wrongKey = randomKey();
    const wrapped = wrapKey(randomKey(), wrappingKey);
    expect(() => unwrapKey(wrapped, wrongKey)).toThrow();
  });
});

// ─── Keypairs ────────────────────────────────────────────────
describe('keypairs', () => {
  it('identity keypair has correct sizes (Ed25519)', () => {
    const kp = generateIdentityKeyPair();
    expect(kp.publicKey.length).toBe(32);
    expect(kp.privateKey.length).toBe(64);
  });

  it('exchange keypair has correct sizes (X25519)', () => {
    const kp = generateExchangeKeyPair();
    expect(kp.publicKey.length).toBe(32);
    expect(kp.privateKey.length).toBe(32);
  });
});

// ─── Signatures ──────────────────────────────────────────────
describe('Ed25519 signatures', () => {
  it('sign/verify roundtrip', () => {
    const kp = generateIdentityKeyPair();
    const message = randomBytes(128);
    const sig = sign(message, kp.privateKey);
    expect(verify(sig, message, kp.publicKey)).toBe(true);
  });

  it('verify with wrong message fails', () => {
    const kp = generateIdentityKeyPair();
    const message = randomBytes(128);
    const sig = sign(message, kp.privateKey);
    const wrongMessage = randomBytes(128);
    expect(verify(sig, wrongMessage, kp.publicKey)).toBe(false);
  });

  it('verify with wrong key fails', () => {
    const kp1 = generateIdentityKeyPair();
    const kp2 = generateIdentityKeyPair();
    const message = randomBytes(128);
    const sig = sign(message, kp1.privateKey);
    expect(verify(sig, message, kp2.publicKey)).toBe(false);
  });

  it('tampered signature fails', () => {
    const kp = generateIdentityKeyPair();
    const message = randomBytes(128);
    const sig = sign(message, kp.privateKey);
    sig[0] ^= 0xff;
    expect(verify(sig, message, kp.publicKey)).toBe(false);
  });
});

// ─── Sealed boxes ────────────────────────────────────────────
describe('sealed boxes (X25519)', () => {
  it('sealForRecipient/openSealed roundtrip', () => {
    const recipient = generateExchangeKeyPair();
    const plaintext = randomBytes(64);
    const sealed = sealForRecipient(plaintext, recipient.publicKey);
    const opened = openSealed(sealed, recipient);
    expect(Buffer.from(opened).equals(Buffer.from(plaintext))).toBe(true);
  });

  it('sealed box cannot be opened by wrong recipient', () => {
    const recipient = generateExchangeKeyPair();
    const wrongRecipient = generateExchangeKeyPair();
    const sealed = sealForRecipient(randomBytes(32), recipient.publicKey);
    expect(() => openSealed(sealed, wrongRecipient)).toThrow();
  });
});

// ─── Email hash ──────────────────────────────────────────────
describe('hashEmail', () => {
  it('is deterministic', () => {
    const a = hashEmail('test@example.com');
    const b = hashEmail('test@example.com');
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
  });

  it('is case-insensitive', () => {
    const a = hashEmail('Test@Example.COM');
    const b = hashEmail('test@example.com');
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
  });

  it('trims whitespace', () => {
    const a = hashEmail('  test@example.com  ');
    const b = hashEmail('test@example.com');
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
  });

  it('different emails produce different hashes', () => {
    const a = hashEmail('alice@example.com');
    const b = hashEmail('bob@example.com');
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(false);
  });

  it('produces 32-byte output', () => {
    expect(hashEmail('test@example.com').length).toBe(32);
  });
});

// ─── Content hash ────────────────────────────────────────────
describe('contentHash', () => {
  it('is deterministic', () => {
    const chunks = [randomBytes(100), randomBytes(200)];
    const a = contentHash(chunks);
    const b = contentHash(chunks);
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
  });

  it('different chunks produce different hashes', () => {
    const a = contentHash([randomBytes(100)]);
    const b = contentHash([randomBytes(100)]);
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(false);
  });
});

// ─── File chunking ───────────────────────────────────────────
describe('file chunking', () => {
  it('encryptFileStream/decryptChunk roundtrip', async () => {
    const fileKey = randomKey();
    const data = randomBytes(CHUNK_SIZE + 1000);
    const source = [data];

    const chunks: { ciphertext: Uint8Array; nonce: Uint8Array; tag: Uint8Array }[] = [];
    for await (const chunk of encryptFileStream(source, fileKey)) {
      chunks.push(chunk);
    }

    expect(chunks.length).toBe(2);

    const decryptedParts: Uint8Array[] = [];
    for (let i = 0; i < chunks.length; i++) {
      decryptedParts.push(decryptChunk(chunks[i]!.ciphertext, chunks[i]!.nonce, i, fileKey));
    }

    const reconstructed = new Uint8Array(decryptedParts.reduce((s, p) => s + p.length, 0));
    let offset = 0;
    for (const part of decryptedParts) {
      reconstructed.set(part, offset);
      offset += part.length;
    }

    expect(Buffer.from(reconstructed).equals(Buffer.from(data))).toBe(true);
  });

  it('chunk reordering is detected', async () => {
    const fileKey = randomKey();
    const data = randomBytes(CHUNK_SIZE * 2);
    const source = [data];

    const chunks: { ciphertext: Uint8Array; nonce: Uint8Array }[] = [];
    for await (const chunk of encryptFileStream(source, fileKey)) {
      chunks.push(chunk);
    }

    expect(chunks.length).toBe(2);
    expect(() => decryptChunk(chunks[0]!.ciphertext, chunks[0]!.nonce, 1, fileKey)).toThrow();
  });
});

// ─── Recovery key ────────────────────────────────────────────
describe('recovery', () => {
  it('deriveRecoveryKey is deterministic', () => {
    const seed = generateRecoverySeed();
    const a = deriveRecoveryKey(seed, 'noctcom.recovery.v1');
    const b = deriveRecoveryKey(seed, 'noctcom.recovery.v1');
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
  });

  it('different info produces different keys', () => {
    const seed = generateRecoverySeed();
    const a = deriveRecoveryKey(seed, 'noctcom.recovery.v1');
    const b = deriveRecoveryKey(seed, 'noctcom.recovery.v2');
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(false);
  });
});

// ─── Encoding ────────────────────────────────────────────────
describe('encoding', () => {
  it('toBase64/fromBase64 roundtrip', () => {
    const original = randomBytes(64);
    const encoded = toBase64(original);
    const decoded = fromBase64(encoded);
    expect(Buffer.from(decoded).equals(Buffer.from(original))).toBe(true);
  });

  it('toHex/fromHex roundtrip', () => {
    const original = randomBytes(32);
    const hex = toHex(original);
    expect(hex.length).toBe(64);
    const decoded = fromHex(hex);
    expect(Buffer.from(decoded).equals(Buffer.from(original))).toBe(true);
  });

  it('base64url has no padding or special chars', () => {
    const encoded = toBase64(randomBytes(100));
    expect(encoded).not.toContain('=');
    expect(encoded).not.toContain('+');
    expect(encoded).not.toContain('/');
  });
});
