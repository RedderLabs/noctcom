/**
 * Kit de recuperación (Recovery v2).
 *
 * De la frase mnemónica se derivan DOS pares de claves:
 *   · Ed25519 (sign) — firma el challenge de recuperación (ya existía).
 *   · X25519 (box)   — su pública se registra en el servidor; con ella el
 *     cliente SELLA (crypto_box_seal) la vault key y la sk_exchange en
 *     cualquier momento sin necesitar la mnemónica. En recuperación, la
 *     mnemónica deriva la privada, abre los seals y se re-wrappea todo
 *     con la nueva MK. Así los archivos sobreviven al cambio de contraseña.
 *
 * Frases nuevas: BIP39 real (2048 palabras, 128 bits + checksum).
 * Frases pre-v2 (wordlist corta, sin checksum) siguen funcionando para
 * derivar — la prueba de validez real siempre es la firma del challenge.
 */

import sodium from 'libsodium-wrappers-sumo';
import { generateMnemonic as bip39Generate, validateMnemonic as bip39Validate } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';
import type { Bytes } from './crypto';

export const MNEMONIC_WORDS = 12;

/** Frase nueva: 128 bits de entropía + checksum BIP39 → 12 palabras. */
export function generateRecoveryMnemonic(): string[] {
  return bip39Generate(wordlist, 128).split(' ');
}

/** ¿Es una frase BIP39 válida (checksum incluido)? Las pre-v2 devuelven false. */
export function isBip39Mnemonic(words: string[]): boolean {
  try {
    return bip39Validate(words.join(' ').trim().toLowerCase(), wordlist);
  } catch {
    return false;
  }
}

/** Seed de recuperación — misma fórmula que el signup desde el inicio. */
export function deriveRecoverySeed(words: string[]): Bytes {
  return sodium.crypto_generichash(
    32,
    sodium.from_string(words.join(' ')),
    sodium.from_string('noctcom.recovery.v1'),
  );
}

/** Par Ed25519: firma el challenge de recuperación. */
export function deriveRecoverySignKeypair(seed: Bytes) {
  return sodium.crypto_sign_seed_keypair(seed);
}

/** Par X25519: la pública sella vault keys / sk_exchange; la privada los abre. */
export function deriveRecoveryBoxKeypair(seed: Bytes) {
  const boxSeed = sodium.crypto_generichash(
    32,
    sodium.from_string('noctcom.recovery.box.v1'),
    seed,
  );
  const kp = sodium.crypto_box_seed_keypair(boxSeed);
  sodium.memzero(boxSeed);
  return kp;
}

/** Sella un secreto (vault key, sk_exchange) a la recovery box pública. */
export function sealToRecovery(plaintext: Bytes, recoveryBoxPublicKey: Bytes): Bytes {
  return sodium.crypto_box_seal(plaintext, recoveryBoxPublicKey);
}

/** Abre un seal con el par derivado de la mnemónica. */
export function openRecoverySeal(
  sealed: Bytes,
  kp: { publicKey: Bytes; privateKey: Bytes },
): Bytes {
  return sodium.crypto_box_seal_open(sealed, kp.publicKey, kp.privateKey);
}
