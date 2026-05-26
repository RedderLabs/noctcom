import { describe, it, expect, beforeAll } from 'vitest';
import sodium from 'libsodium-wrappers-sumo';
import {
  ready, randomKey, randomBytes, encrypt, decrypt,
  encryptString, decryptString, wrapKey, unwrapKey,
  generateIdentityKeyPair, generateExchangeKeyPair,
  sign, verify, sealForRecipient, openSealed,
  hashEmail, deriveRecoveryKey, encryptFileStream, decryptChunk,
  CHUNK_SIZE,
} from '../crypto/index.js';

beforeAll(async () => {
  await ready();
  await sodium.ready;
});

function deriveMasterKey(password: string, salt: Uint8Array, opsLimit: number, memLimit: number) {
  return sodium.crypto_pwhash(32, password, salt, opsLimit, memLimit, sodium.crypto_pwhash_ALG_ARGON2ID13);
}

function deriveSubKey(masterKey: Uint8Array, context: string): Uint8Array {
  return sodium.crypto_generichash(32, sodium.from_string(context), masterKey);
}

// ─── Signup flow ─────────────────────────────────────────────
describe('signup flow', () => {
  it('generates all keys and wraps/unwraps correctly', () => {
    const password = 'SuperSecure!P@ssw0rd123';
    const salt = randomBytes(sodium.crypto_pwhash_SALTBYTES);
    const mk = deriveMasterKey(password, salt, 3, 67108864);

    const identityKp = sodium.crypto_sign_seed_keypair(deriveSubKey(mk, 'noctcom.login.sign'));
    const exchangeKp = generateExchangeKeyPair();

    const idWrapped = wrapKey(identityKp.privateKey, mk);
    const exWrapped = wrapKey(exchangeKp.privateKey, mk);

    const vaultKey = randomKey();
    const vaultWrapKey = deriveSubKey(mk, 'noctcom.vault.wrap');
    const vaultKeyWrapped = wrapKey(vaultKey, vaultWrapKey);

    // Simulate re-login: derive MK from same password
    const mk2 = deriveMasterKey(password, salt, 3, 67108864);
    expect(Buffer.from(mk2).equals(Buffer.from(mk))).toBe(true);

    // Unwrap all keys
    const idPriv = unwrapKey(idWrapped, mk2);
    expect(Buffer.from(idPriv).equals(Buffer.from(identityKp.privateKey))).toBe(true);

    const exPriv = unwrapKey(exWrapped, mk2);
    expect(Buffer.from(exPriv).equals(Buffer.from(exchangeKp.privateKey))).toBe(true);

    const vaultWrapKey2 = deriveSubKey(mk2, 'noctcom.vault.wrap');
    const vaultKeyUnwrapped = unwrapKey(vaultKeyWrapped, vaultWrapKey2);
    expect(Buffer.from(vaultKeyUnwrapped).equals(Buffer.from(vaultKey))).toBe(true);
  });
});

// ─── Login challenge-response ────────────────────────────────
describe('login challenge-response', () => {
  it('client can prove identity by signing challenge', () => {
    const password = 'MyPassword!2026';
    const salt = randomBytes(sodium.crypto_pwhash_SALTBYTES);
    const mk = deriveMasterKey(password, salt, 3, 67108864);

    const signingKeySeed = deriveSubKey(mk, 'noctcom.login.sign');
    const kp = sodium.crypto_sign_seed_keypair(signingKeySeed);

    const challenge = randomBytes(32);
    const signature = sign(challenge, kp.privateKey);

    // Server verifies with stored public key
    expect(verify(signature, challenge, kp.publicKey)).toBe(true);
  });

  it('wrong password produces wrong signing key', () => {
    const salt = randomBytes(sodium.crypto_pwhash_SALTBYTES);
    const mk1 = deriveMasterKey('CorrectPassword!', salt, 3, 67108864);
    const mk2 = deriveMasterKey('WrongPassword!', salt, 3, 67108864);

    const kp1 = sodium.crypto_sign_seed_keypair(deriveSubKey(mk1, 'noctcom.login.sign'));
    const kp2 = sodium.crypto_sign_seed_keypair(deriveSubKey(mk2, 'noctcom.login.sign'));

    const challenge = randomBytes(32);
    const sig = sign(challenge, kp2.privateKey);

    // Server has kp1.publicKey — sig from kp2 must fail
    expect(verify(sig, challenge, kp1.publicKey)).toBe(false);
  });
});

// ─── Share flow ──────────────────────────────────────────────
describe('share flow (Alice → Bob)', () => {
  it('Alice seals file key for Bob, Bob decrypts file', () => {
    // Alice has a file encrypted with a random fileKey
    const fileKey = randomKey();
    const fileContent = new TextEncoder().encode('Secret document content');
    const { ciphertext, nonce } = encrypt(fileContent, fileKey);

    // Bob's exchange keypair (public key is known to Alice)
    const bobKp = generateExchangeKeyPair();

    // Alice seals fileKey for Bob
    const sealedFileKey = sealForRecipient(fileKey, bobKp.publicKey);

    // Bob opens the sealed fileKey
    const recoveredFileKey = openSealed(sealedFileKey, bobKp);
    expect(Buffer.from(recoveredFileKey).equals(Buffer.from(fileKey))).toBe(true);

    // Bob decrypts the file
    const decrypted = decrypt(ciphertext, nonce, recoveredFileKey);
    expect(new TextDecoder().decode(decrypted)).toBe('Secret document content');
  });

  it('Charlie cannot open sealed key meant for Bob', () => {
    const fileKey = randomKey();
    const bobKp = generateExchangeKeyPair();
    const charlieKp = generateExchangeKeyPair();

    const sealedForBob = sealForRecipient(fileKey, bobKp.publicKey);
    expect(() => openSealed(sealedForBob, charlieKp)).toThrow();
  });
});

// ─── File upload/download ────────────────────────────────────
describe('file upload/download flow', () => {
  it('encrypt multi-chunk file and decrypt all chunks', async () => {
    const fileKey = randomKey();
    const fileData = randomBytes(CHUNK_SIZE * 2 + 500);

    const encrypted: { ciphertext: Uint8Array; nonce: Uint8Array }[] = [];
    for await (const chunk of encryptFileStream([fileData], fileKey)) {
      encrypted.push({ ciphertext: chunk.ciphertext, nonce: chunk.nonce });
    }

    expect(encrypted.length).toBe(3);

    const decryptedParts: Uint8Array[] = [];
    for (let i = 0; i < encrypted.length; i++) {
      decryptedParts.push(decryptChunk(encrypted[i]!.ciphertext, encrypted[i]!.nonce, i, fileKey));
    }

    const reconstructed = new Uint8Array(decryptedParts.reduce((s, p) => s + p.length, 0));
    let offset = 0;
    for (const part of decryptedParts) {
      reconstructed.set(part, offset);
      offset += part.length;
    }

    expect(Buffer.from(reconstructed).equals(Buffer.from(fileData))).toBe(true);
  });

  it('single small file roundtrip', async () => {
    const fileKey = randomKey();
    const fileData = new TextEncoder().encode('Small file');

    const chunks: { ciphertext: Uint8Array; nonce: Uint8Array }[] = [];
    for await (const chunk of encryptFileStream([fileData], fileKey)) {
      chunks.push(chunk);
    }

    expect(chunks.length).toBe(1);
    const decrypted = decryptChunk(chunks[0]!.ciphertext, chunks[0]!.nonce, 0, fileKey);
    expect(new TextDecoder().decode(decrypted)).toBe('Small file');
  });
});

// ─── Recovery flow ───────────────────────────────────────────
describe('recovery flow', () => {
  it('mnemonic seed derives consistent recovery keypair', () => {
    const mnemonic = 'abandon ability able about above absent absorb abstract absurd abuse access accident';
    const recoverySeed = sodium.crypto_generichash(
      32, sodium.from_string(mnemonic), sodium.from_string('noctcom.recovery.v1'),
    );
    const recoveryKp = sodium.crypto_sign_seed_keypair(recoverySeed);

    // Simulate recovery: same mnemonic on different device
    const recoverySeed2 = sodium.crypto_generichash(
      32, sodium.from_string(mnemonic), sodium.from_string('noctcom.recovery.v1'),
    );
    const recoveryKp2 = sodium.crypto_sign_seed_keypair(recoverySeed2);

    expect(Buffer.from(recoveryKp2.publicKey).equals(Buffer.from(recoveryKp.publicKey))).toBe(true);
    expect(Buffer.from(recoveryKp2.privateKey).equals(Buffer.from(recoveryKp.privateKey))).toBe(true);
  });

  it('different mnemonic produces different keypair', () => {
    const seed1 = sodium.crypto_generichash(
      32, sodium.from_string('word1 word2 word3'), sodium.from_string('noctcom.recovery.v1'),
    );
    const seed2 = sodium.crypto_generichash(
      32, sodium.from_string('word4 word5 word6'), sodium.from_string('noctcom.recovery.v1'),
    );
    const kp1 = sodium.crypto_sign_seed_keypair(seed1);
    const kp2 = sodium.crypto_sign_seed_keypair(seed2);

    expect(Buffer.from(kp1.publicKey).equals(Buffer.from(kp2.publicKey))).toBe(false);
  });
});

// ─── Vault key encryption chain ──────────────────────────────
describe('vault key chain', () => {
  it('password → MK → vault wrap key → vault key → file key → file content', () => {
    // 1. Password → MK
    const password = 'StrongP@ss!2026';
    const salt = randomBytes(sodium.crypto_pwhash_SALTBYTES);
    const mk = deriveMasterKey(password, salt, 3, 67108864);

    // 2. MK → vault wrap key
    const vaultWrapKey = deriveSubKey(mk, 'noctcom.vault.wrap');

    // 3. Vault key (random, wrapped with vault wrap key)
    const vaultKey = randomKey();
    const wrappedVaultKey = wrapKey(vaultKey, vaultWrapKey);

    // 4. File key (random, wrapped with vault key)
    const fileKey = randomKey();
    const wrappedFileKey = wrapKey(fileKey, vaultKey);

    // 5. File content encrypted with file key
    const content = new TextEncoder().encode('Confidential data');
    const encrypted = encrypt(content, fileKey);

    // Reverse: password → MK → vault wrap → vault key → file key → content
    const mk2 = deriveMasterKey(password, salt, 3, 67108864);
    const vwk2 = deriveSubKey(mk2, 'noctcom.vault.wrap');
    const vk2 = unwrapKey(wrappedVaultKey, vwk2);
    const fk2 = unwrapKey(wrappedFileKey, vk2);
    const decrypted = decrypt(encrypted.ciphertext, encrypted.nonce, fk2);

    expect(new TextDecoder().decode(decrypted)).toBe('Confidential data');
  });
});
