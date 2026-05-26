/**
 * CryptVault Crypto — capa zero-knowledge basada en libsodium.
 *
 * Algoritmos:
 *   • KDF:               Argon2id (sensitive params)
 *   • AEAD chunks:       XChaCha20-Poly1305 (24-byte nonce, sin colisiones aleatorias)
 *   • Asimétrica:        X25519 (intercambio) + Ed25519 (firmas)
 *   • Sealed boxes:      crypto_box_seal (anónimo → destinatario)
 *
 * Toda función asume libsodium ya inicializado (`await sodium.ready`).
 * Las claves se almacenan en Uint8Array. Llama wipe() cuando termines.
 */

import sodium from 'libsodium-wrappers-sumo';

export type Bytes = Uint8Array;

export const CHUNK_SIZE = 4 * 1024 * 1024;            // 4 MiB
export const NONCE_BYTES = 24;                         // XChaCha20-Poly1305
export const KEY_BYTES = 32;
export const TAG_BYTES = 16;

export interface KdfParams {
  salt: Bytes;
  opsLimit: number;
  memLimit: number;
}

export interface KeyPair {
  publicKey: Bytes;
  privateKey: Bytes;
}

export interface WrappedKey {
  ciphertext: Bytes;
  nonce: Bytes;
}

export interface EncryptedChunk {
  ciphertext: Bytes;
  nonce: Bytes;
  tag: Bytes;            // ya embebido en ciphertext por libsodium, lo separamos para BD
}

// ─────────────────────────────────────────────────────────────────
// Inicialización
// ─────────────────────────────────────────────────────────────────
export async function ready(): Promise<void> {
  await sodium.ready;
}

// ─────────────────────────────────────────────────────────────────
// Random helpers
// ─────────────────────────────────────────────────────────────────
export function randomBytes(n: number): Bytes {
  return sodium.randombytes_buf(n);
}

export function randomKey(): Bytes {
  return sodium.crypto_aead_xchacha20poly1305_ietf_keygen();
}

export function randomNonce(): Bytes {
  return sodium.randombytes_buf(NONCE_BYTES);
}

// ─────────────────────────────────────────────────────────────────
// Memory hygiene — limpia material sensible en cuanto deje de usarse
// ─────────────────────────────────────────────────────────────────
export function wipe(...buffers: Bytes[]): void {
  for (const buf of buffers) {
    if (buf) sodium.memzero(buf);
  }
}

// ─────────────────────────────────────────────────────────────────
// KDF — Argon2id contraseña → Master Key (MK)
// ─────────────────────────────────────────────────────────────────
export function deriveMasterKey(password: string, params: KdfParams): Bytes {
  return sodium.crypto_pwhash(
    KEY_BYTES,
    password,
    params.salt,
    params.opsLimit,
    params.memLimit,
    sodium.crypto_pwhash_ALG_ARGON2ID13,
  );
}

export function defaultKdfParams(): KdfParams {
  return {
    salt: randomBytes(sodium.crypto_pwhash_SALTBYTES),
    opsLimit: sodium.crypto_pwhash_OPSLIMIT_MODERATE,   // ~0.7s en CPU típica
    memLimit: sodium.crypto_pwhash_MEMLIMIT_MODERATE,   // 256 MiB
  };
}

// ─────────────────────────────────────────────────────────────────
// AEAD primitive — XChaCha20-Poly1305
// Empleado para:
//   - cifrar nombres de archivo, metadatos, audit logs (campos cortos)
//   - cifrar chunks de contenido (con keystream interno de libsodium)
//   - wrappear claves
// ─────────────────────────────────────────────────────────────────
export function encrypt(plaintext: Bytes, key: Bytes, aad: Bytes | null = null): { ciphertext: Bytes; nonce: Bytes } {
  const nonce = randomNonce();
  const ciphertext = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
    plaintext, aad, null, nonce, key,
  );
  return { ciphertext, nonce };
}

export function decrypt(ciphertext: Bytes, nonce: Bytes, key: Bytes, aad: Bytes | null = null): Bytes {
  return sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
    null, ciphertext, aad, nonce, key,
  );
}

export function encryptString(plaintext: string, key: Bytes, aad: Bytes | null = null) {
  return encrypt(sodium.from_string(plaintext), key, aad);
}

export function decryptString(ciphertext: Bytes, nonce: Bytes, key: Bytes, aad: Bytes | null = null): string {
  return sodium.to_string(decrypt(ciphertext, nonce, key, aad));
}

// ─────────────────────────────────────────────────────────────────
// Wrap / unwrap keys con AEAD (también XChaCha)
// ─────────────────────────────────────────────────────────────────
export function wrapKey(keyToWrap: Bytes, wrappingKey: Bytes): WrappedKey {
  const { ciphertext, nonce } = encrypt(keyToWrap, wrappingKey);
  return { ciphertext, nonce };
}

export function unwrapKey(wrapped: WrappedKey, wrappingKey: Bytes): Bytes {
  return decrypt(wrapped.ciphertext, wrapped.nonce, wrappingKey);
}

// ─────────────────────────────────────────────────────────────────
// Identity & exchange keypairs
// ─────────────────────────────────────────────────────────────────
export function generateIdentityKeyPair(): KeyPair {
  const kp = sodium.crypto_sign_keypair();
  return { publicKey: kp.publicKey, privateKey: kp.privateKey };
}

export function generateExchangeKeyPair(): KeyPair {
  const kp = sodium.crypto_box_keypair();
  return { publicKey: kp.publicKey, privateKey: kp.privateKey };
}

// ─────────────────────────────────────────────────────────────────
// Sealed boxes — para compartir: anónimo → destinatario
// El servidor enruta el blob; solo el destinatario lo abre.
// ─────────────────────────────────────────────────────────────────
export function sealForRecipient(plaintext: Bytes, recipientPublicKey: Bytes): Bytes {
  return sodium.crypto_box_seal(plaintext, recipientPublicKey);
}

export function openSealed(ciphertext: Bytes, kp: KeyPair): Bytes {
  return sodium.crypto_box_seal_open(ciphertext, kp.publicKey, kp.privateKey);
}

// ─────────────────────────────────────────────────────────────────
// Firmas Ed25519
// ─────────────────────────────────────────────────────────────────
export function sign(message: Bytes, privateKey: Bytes): Bytes {
  return sodium.crypto_sign_detached(message, privateKey);
}

export function verify(signature: Bytes, message: Bytes, publicKey: Bytes): boolean {
  return sodium.crypto_sign_verify_detached(signature, message, publicKey);
}

// ─────────────────────────────────────────────────────────────────
// Email hash determinista (para login lookup sin guardar email)
// Domain-separated con un namespace fijo: previene rainbow tables
// genéricas (siguen siendo posibles para el atacante con el DB dump,
// pero es lo mejor que hace un sistema zero-knowledge).
// ─────────────────────────────────────────────────────────────────
const EMAIL_NS = sodium_to_bytes_safe('noctcom.email.v1');

export function hashEmail(email: string): Bytes {
  return sodium.crypto_generichash(
    32,
    sodium.from_string(email.trim().toLowerCase()),
    EMAIL_NS,
  );
}

function sodium_to_bytes_safe(s: string): Bytes {
  // Helper: hay un orden de carga raro si llamamos sodium.from_string a top-level
  // antes de await sodium.ready. Usamos TextEncoder como fallback portable.
  return new TextEncoder().encode(s);
}

// ─────────────────────────────────────────────────────────────────
// Content hash — para deduplicación zero-knowledge (sobre ciphertext)
// ─────────────────────────────────────────────────────────────────
export function contentHash(ciphertextChunks: Bytes[]): Bytes {
  const state = sodium.crypto_generichash_init(null, 32);
  for (const chunk of ciphertextChunks) {
    sodium.crypto_generichash_update(state, chunk);
  }
  return sodium.crypto_generichash_final(state, 32);
}

// ─────────────────────────────────────────────────────────────────
// File chunking — divide un Blob/Uint8Array en chunks cifrados.
// Cada chunk lleva su nonce. Streaming-friendly.
// ─────────────────────────────────────────────────────────────────
export async function* encryptFileStream(
  source: AsyncIterable<Bytes> | Iterable<Bytes>,
  fileKey: Bytes,
): AsyncGenerator<EncryptedChunk> {
  let chunkIndex = 0;
  let buffer = new Uint8Array(0);

  const flush = (forceFlush: boolean): EncryptedChunk | null => {
    if (buffer.length === 0) return null;
    if (!forceFlush && buffer.length < CHUNK_SIZE) return null;

    const slice = buffer.slice(0, Math.min(CHUNK_SIZE, buffer.length));
    buffer = buffer.slice(slice.length);

    // AAD vincula el chunk a su índice → previene reordering attacks
    const aad = new TextEncoder().encode(`chunk:${chunkIndex}`);
    const { ciphertext, nonce } = encrypt(slice, fileKey, aad);
    chunkIndex++;

    // Separamos tag (últimos 16 bytes) para guardarlo aparte si quisieras
    const tag = ciphertext.slice(ciphertext.length - TAG_BYTES);

    return { ciphertext, nonce, tag };
  };

  for await (const piece of source as AsyncIterable<Bytes>) {
    const merged = new Uint8Array(buffer.length + piece.length);
    merged.set(buffer);
    merged.set(piece, buffer.length);
    buffer = merged;

    while (buffer.length >= CHUNK_SIZE) {
      const chunk = flush(false);
      if (chunk) yield chunk;
    }
  }

  const last = flush(true);
  if (last) yield last;
}

export function decryptChunk(
  ciphertext: Bytes,
  nonce: Bytes,
  chunkIndex: number,
  fileKey: Bytes,
): Bytes {
  const aad = new TextEncoder().encode(`chunk:${chunkIndex}`);
  return decrypt(ciphertext, nonce, fileKey, aad);
}

// ─────────────────────────────────────────────────────────────────
// Recovery phrase — BIP39-like 12 palabras → MK alternativa
// (placeholder: usa @scure/bip39 en producción)
// ─────────────────────────────────────────────────────────────────
export function generateRecoverySeed(): Bytes {
  return randomBytes(32);
}

export function deriveRecoveryKey(seed: Bytes, info: string): Bytes {
  return sodium.crypto_generichash(KEY_BYTES, seed, sodium.from_string(info));
}

// ─────────────────────────────────────────────────────────────────
// Encoding helpers
// ─────────────────────────────────────────────────────────────────
export const toBase64 = (b: Bytes): string => sodium.to_base64(b, sodium.base64_variants.URLSAFE_NO_PADDING);
export const fromBase64 = (s: string): Bytes => sodium.from_base64(s, sodium.base64_variants.URLSAFE_NO_PADDING);
export const toHex = (b: Bytes): string => sodium.to_hex(b);
export const fromHex = (s: string): Bytes => sodium.from_hex(s);
