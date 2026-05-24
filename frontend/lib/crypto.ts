/**
 * Cliente cripto del navegador para Noctcom.
 * Mismo material que backend/src/crypto/index.ts, optimizado para el browser.
 * libsodium-sumo trae argon2id; pesa ~400 KB gzipped pero es imprescindible.
 */

import sodium from 'libsodium-wrappers-sumo';

export type Bytes = Uint8Array;

export const CHUNK_SIZE = 4 * 1024 * 1024;
export const KEY_BYTES = 32;
export const NONCE_BYTES = 24;

let ready = false;
export async function initCrypto(): Promise<void> {
  if (ready) return;
  await sodium.ready;
  ready = true;
}

// ─── Random ──────────────────────────────────────────────────────
export const randomBytes = (n: number) => sodium.randombytes_buf(n);
export const randomKey = () => sodium.crypto_aead_xchacha20poly1305_ietf_keygen();
export const randomNonce = () => sodium.randombytes_buf(NONCE_BYTES);

// ─── Memory hygiene ──────────────────────────────────────────────
export function wipe(...b: (Bytes | null | undefined)[]) {
  for (const x of b) if (x) sodium.memzero(x);
}

// ─── KDF ─────────────────────────────────────────────────────────
export function deriveMasterKey(password: string, salt: Bytes, opsLimit: number, memLimit: number): Bytes {
  return sodium.crypto_pwhash(
    KEY_BYTES, password, salt, opsLimit, memLimit, sodium.crypto_pwhash_ALG_ARGON2ID13,
  );
}

export const DEFAULT_KDF = {
  opsLimit: () => sodium.crypto_pwhash_OPSLIMIT_MODERATE,
  memLimit: () => sodium.crypto_pwhash_MEMLIMIT_MODERATE,
  saltBytes: () => sodium.crypto_pwhash_SALTBYTES,
};

// ─── HKDF — para derivar sub-keys (TOTP wrap key, recovery, etc.) ─
export function deriveSubKey(masterKey: Bytes, context: string): Bytes {
  return sodium.crypto_generichash(KEY_BYTES, sodium.from_string(context), masterKey);
}

// ─── AEAD ────────────────────────────────────────────────────────
export function encrypt(plaintext: Bytes, key: Bytes, aad: Bytes | null = null) {
  const nonce = randomNonce();
  const ciphertext = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(plaintext, aad, null, nonce, key);
  return { ciphertext, nonce };
}

export function decrypt(ciphertext: Bytes, nonce: Bytes, key: Bytes, aad: Bytes | null = null): Bytes {
  return sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(null, ciphertext, aad, nonce, key);
}

export function encryptString(str: string, key: Bytes) {
  return encrypt(sodium.from_string(str), key);
}

export function decryptString(ciphertext: Bytes, nonce: Bytes, key: Bytes): string {
  return sodium.to_string(decrypt(ciphertext, nonce, key));
}

export function encryptJSON<T>(obj: T, key: Bytes) {
  return encryptString(JSON.stringify(obj), key);
}

export function decryptJSON<T>(ciphertext: Bytes, nonce: Bytes, key: Bytes): T {
  return JSON.parse(decryptString(ciphertext, nonce, key)) as T;
}

// ─── Keypairs ────────────────────────────────────────────────────
export function generateIdentityKeyPair() {
  return sodium.crypto_sign_keypair();
}
export function generateExchangeKeyPair() {
  return sodium.crypto_box_keypair();
}
export function sign(message: Bytes, privateKey: Bytes) {
  return sodium.crypto_sign_detached(message, privateKey);
}

// ─── Sealed boxes ────────────────────────────────────────────────
export function sealForRecipient(plaintext: Bytes, recipientPublicKey: Bytes) {
  return sodium.crypto_box_seal(plaintext, recipientPublicKey);
}
export function openSealed(ciphertext: Bytes, publicKey: Bytes, privateKey: Bytes) {
  return sodium.crypto_box_seal_open(ciphertext, publicKey, privateKey);
}

// ─── Email hash ──────────────────────────────────────────────────
export function hashEmail(email: string): Bytes {
  const ns = sodium.from_string('noctcom.email.v1');
  return sodium.crypto_generichash(32, sodium.from_string(email.trim().toLowerCase()), ns);
}

// ─── Encoding ────────────────────────────────────────────────────
export const toB64 = (b: Bytes) => sodium.to_base64(b, sodium.base64_variants.URLSAFE_NO_PADDING);
export const fromB64 = (s: string) => sodium.from_base64(s, sodium.base64_variants.URLSAFE_NO_PADDING);
export const toHex = (b: Bytes) => sodium.to_hex(b);
export const fromHex = (s: string) => sodium.from_hex(s);

// ─── TOTP secret base32 encoding (para QR) ───────────────────────
const B32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function toBase32(bytes: Bytes): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32_ALPHABET[(value >>> (bits - 5)) & 0x1f];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32_ALPHABET[(value << (5 - bits)) & 0x1f];
  return out;
}

// ─── Generar TOTP secret (20 bytes = 160 bits, recomendado por RFC) ─
export function generateTotpSecret(): Bytes {
  return randomBytes(20);
}

// ─── File chunking ───────────────────────────────────────────────
export async function* encryptFileChunks(
  file: File | Blob,
  fileKey: Bytes,
  onProgress?: (bytesEncrypted: number, totalBytes: number) => void,
): AsyncGenerator<{ index: number; ciphertext: Bytes; nonce: Bytes; tag: Bytes }> {
  const total = file.size;
  let offset = 0;
  let index = 0;

  while (offset < total) {
    const end = Math.min(offset + CHUNK_SIZE, total);
    const slice = await file.slice(offset, end).arrayBuffer();
    const plain = new Uint8Array(slice);

    const aad = sodium.from_string(`chunk:${index}`);
    const { ciphertext, nonce } = encrypt(plain, fileKey, aad);
    const tag = ciphertext.slice(ciphertext.length - 16);

    yield { index, ciphertext, nonce, tag };

    offset = end;
    index++;
    onProgress?.(offset, total);
  }
}

export function decryptChunk(ciphertext: Bytes, nonce: Bytes, index: number, fileKey: Bytes): Bytes {
  const aad = sodium.from_string(`chunk:${index}`);
  return decrypt(ciphertext, nonce, fileKey, aad);
}
