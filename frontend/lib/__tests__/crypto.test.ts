import { describe, it, expect, beforeAll } from 'vitest';
import {
  initCrypto, randomBytes, randomKey, randomNonce,
  encrypt, decrypt, encryptString, decryptString,
  encryptJSON, decryptJSON,
  deriveMasterKey, deriveSubKey, DEFAULT_KDF,
  generateIdentityKeyPair, generateExchangeKeyPair,
  sign, sealForRecipient, openSealed,
  hashEmail, toBase32, generateTotpSecret,
  decryptChunk,
  toB64, fromB64, toHex, fromHex,
  KEY_BYTES, NONCE_BYTES, CHUNK_SIZE,
} from '../crypto';

beforeAll(async () => {
  await initCrypto();
});

// ─── AEAD ────────────────────────────────────────────────────
describe('AEAD XChaCha20-Poly1305', () => {
  it('encrypt/decrypt roundtrip', () => {
    const key = randomKey();
    const plaintext = randomBytes(256);
    const { ciphertext, nonce } = encrypt(plaintext, key);
    const decrypted = decrypt(ciphertext, nonce, key);
    expect(Buffer.from(decrypted).equals(Buffer.from(plaintext))).toBe(true);
  });

  it('nonces differ per call', () => {
    const key = randomKey();
    const a = encrypt(randomBytes(32), key);
    const b = encrypt(randomBytes(32), key);
    expect(Buffer.from(a.nonce).equals(Buffer.from(b.nonce))).toBe(false);
  });

  it('wrong key throws', () => {
    const key = randomKey();
    const { ciphertext, nonce } = encrypt(randomBytes(32), key);
    expect(() => decrypt(ciphertext, nonce, randomKey())).toThrow();
  });

  it('tampered ciphertext throws', () => {
    const key = randomKey();
    const { ciphertext, nonce } = encrypt(randomBytes(32), key);
    ciphertext[0] ^= 0xff;
    expect(() => decrypt(ciphertext, nonce, key)).toThrow();
  });

  it('AAD binding works', () => {
    const key = randomKey();
    const aad = new TextEncoder().encode('my-aad');
    const { ciphertext, nonce } = encrypt(randomBytes(32), key, aad);
    expect(() => decrypt(ciphertext, nonce, key, new TextEncoder().encode('wrong'))).toThrow();
    const ok = decrypt(ciphertext, nonce, key, aad);
    expect(ok.length).toBe(32);
  });

  it('encryptString/decryptString with UTF-8', () => {
    const key = randomKey();
    const text = 'Ñ 你好 🌍 مرحبا';
    const { ciphertext, nonce } = encryptString(text, key);
    expect(decryptString(ciphertext, nonce, key)).toBe(text);
  });
});

// ─── JSON helpers ────────────────────────────────────────────
describe('JSON encryption', () => {
  it('encryptJSON/decryptJSON roundtrip', () => {
    const key = randomKey();
    const obj = { name: 'test', count: 42, nested: { a: [1, 2, 3] } };
    const { ciphertext, nonce } = encryptJSON(obj, key);
    const decrypted = decryptJSON<typeof obj>(ciphertext, nonce, key);
    expect(decrypted).toEqual(obj);
  });

  it('handles null and boolean values', () => {
    const key = randomKey();
    const obj = { a: null, b: true, c: false };
    const { ciphertext, nonce } = encryptJSON(obj, key);
    expect(decryptJSON(ciphertext, nonce, key)).toEqual(obj);
  });
});

// ─── KDF ─────────────────────────────────────────────────────
describe('KDF', () => {
  it('deriveMasterKey is deterministic', () => {
    const salt = randomBytes(DEFAULT_KDF.saltBytes());
    const mk1 = deriveMasterKey('password', salt, 3, 67108864);
    const mk2 = deriveMasterKey('password', salt, 3, 67108864);
    expect(Buffer.from(mk1).equals(Buffer.from(mk2))).toBe(true);
  });

  it('different password → different key', () => {
    const salt = randomBytes(DEFAULT_KDF.saltBytes());
    const mk1 = deriveMasterKey('password1', salt, 3, 67108864);
    const mk2 = deriveMasterKey('password2', salt, 3, 67108864);
    expect(Buffer.from(mk1).equals(Buffer.from(mk2))).toBe(false);
  });

  it('different salt → different key', () => {
    const mk1 = deriveMasterKey('password', randomBytes(DEFAULT_KDF.saltBytes()), 3, 67108864);
    const mk2 = deriveMasterKey('password', randomBytes(DEFAULT_KDF.saltBytes()), 3, 67108864);
    expect(Buffer.from(mk1).equals(Buffer.from(mk2))).toBe(false);
  });
});

// ─── Sub-key derivation ──────────────────────────────────────
describe('deriveSubKey', () => {
  it('is deterministic', () => {
    const mk = randomKey();
    const a = deriveSubKey(mk, 'noctcom.vault.wrap');
    const b = deriveSubKey(mk, 'noctcom.vault.wrap');
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
  });

  it('different contexts → different subkeys', () => {
    const mk = randomKey();
    const a = deriveSubKey(mk, 'noctcom.vault.wrap');
    const b = deriveSubKey(mk, 'noctcom.totp.v1');
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(false);
  });

  it('produces KEY_BYTES length', () => {
    expect(deriveSubKey(randomKey(), 'test').length).toBe(KEY_BYTES);
  });
});

// ─── Keypairs & signatures ───────────────────────────────────
describe('keypairs and signatures', () => {
  it('identity keypair sizes', () => {
    const kp = generateIdentityKeyPair();
    expect(kp.publicKey.length).toBe(32);
    expect(kp.privateKey.length).toBe(64);
  });

  it('exchange keypair sizes', () => {
    const kp = generateExchangeKeyPair();
    expect(kp.publicKey.length).toBe(32);
    expect(kp.privateKey.length).toBe(32);
  });

  it('sign produces detached signature', () => {
    const kp = generateIdentityKeyPair();
    const sig = sign(randomBytes(64), kp.privateKey);
    expect(sig.length).toBe(64);
  });
});

// ─── Sealed boxes ────────────────────────────────────────────
describe('sealed boxes', () => {
  it('roundtrip', () => {
    const kp = generateExchangeKeyPair();
    const data = randomBytes(64);
    const sealed = sealForRecipient(data, kp.publicKey);
    const opened = openSealed(sealed, kp.publicKey, kp.privateKey);
    expect(Buffer.from(opened).equals(Buffer.from(data))).toBe(true);
  });

  it('wrong recipient throws', () => {
    const alice = generateExchangeKeyPair();
    const bob = generateExchangeKeyPair();
    const sealed = sealForRecipient(randomBytes(32), alice.publicKey);
    expect(() => openSealed(sealed, bob.publicKey, bob.privateKey)).toThrow();
  });
});

// ─── Email hash ──────────────────────────────────────────────
describe('hashEmail', () => {
  it('is deterministic and case-insensitive', () => {
    const a = hashEmail('User@Example.COM');
    const b = hashEmail('user@example.com');
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
  });

  it('different emails → different hashes', () => {
    const a = hashEmail('alice@example.com');
    const b = hashEmail('bob@example.com');
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(false);
  });
});

// ─── Base32 ──────────────────────────────────────────────────
describe('toBase32', () => {
  it('RFC 4648 test vectors', () => {
    const enc = new TextEncoder();
    expect(toBase32(enc.encode(''))).toBe('');
    expect(toBase32(enc.encode('f'))).toBe('MY');
    expect(toBase32(enc.encode('fo'))).toBe('MZXQ');
    expect(toBase32(enc.encode('foo'))).toBe('MZXW6');
    expect(toBase32(enc.encode('foob'))).toBe('MZXW6YQ');
    expect(toBase32(enc.encode('fooba'))).toBe('MZXW6YTB');
    expect(toBase32(enc.encode('foobar'))).toBe('MZXW6YTBOI');
  });
});

// ─── TOTP secret ─────────────────────────────────────────────
describe('TOTP', () => {
  it('generateTotpSecret is 20 bytes', () => {
    expect(generateTotpSecret().length).toBe(20);
  });
});

// ─── File chunk decryption ───────────────────────────────────
describe('chunk decryption', () => {
  it('roundtrip single chunk', () => {
    const key = randomKey();
    const data = randomBytes(1000);
    const { ciphertext, nonce } = encrypt(data, key, new TextEncoder().encode('chunk:0'));
    const decrypted = decryptChunk(ciphertext, nonce, 0, key);
    expect(Buffer.from(decrypted).equals(Buffer.from(data))).toBe(true);
  });

  it('wrong chunk index throws', () => {
    const key = randomKey();
    const data = randomBytes(100);
    const { ciphertext, nonce } = encrypt(data, key, new TextEncoder().encode('chunk:0'));
    expect(() => decryptChunk(ciphertext, nonce, 1, key)).toThrow();
  });
});

// ─── Encoding ────────────────────────────────────────────────
describe('encoding', () => {
  it('base64url roundtrip', () => {
    const data = randomBytes(100);
    expect(Buffer.from(fromB64(toB64(data))).equals(Buffer.from(data))).toBe(true);
  });

  it('hex roundtrip', () => {
    const data = randomBytes(32);
    const hex = toHex(data);
    expect(hex.length).toBe(64);
    expect(Buffer.from(fromHex(hex)).equals(Buffer.from(data))).toBe(true);
  });

  it('base64url no padding or special chars', () => {
    const encoded = toB64(randomBytes(100));
    expect(encoded).not.toContain('=');
    expect(encoded).not.toContain('+');
    expect(encoded).not.toContain('/');
  });
});
