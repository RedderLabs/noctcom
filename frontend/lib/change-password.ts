'use client';

import { apiFetch } from './api';
import { useAuth } from './auth-store';
import {
  initCrypto, deriveMasterKey, deriveSubKey, encrypt, sign,
  randomBytes, DEFAULT_KDF, fromB64, toB64, wipe,
} from './crypto';

/**
 * Cambia la contraseña maestra estando autenticado.
 *
 * Zero-knowledge: el cliente ya tiene en memoria las vault keys y la exchange
 * privada, así que solo las RE-ENVUELVE con la MK nueva (nada se descifra en el
 * servidor). La prueba de conocer la contraseña ACTUAL es firmar un challenge
 * con la identity key derivada de ella; si es errónea, el servidor lo rechaza.
 *
 * El par exchange se conserva (misma pública → los archivos compartidos contigo
 * siguen abriéndose) y los seals de recuperación no cambian (misma mnemónica).
 */
export async function changeMasterPassword(currentPassword: string, newPassword: string): Promise<void> {
  await initCrypto();
  const sodium = (await import('libsodium-wrappers-sumo')).default;
  await sodium.ready;

  const auth = useAuth.getState();
  if (!auth.masterKey || !auth.exchangePrivateKey || !auth.exchangePublicKey
      || !auth.userId || !auth.username || !auth.deviceId) {
    throw new Error('Sesión no inicializada — vuelve a iniciar sesión');
  }

  // 1. Challenge + params KDF actuales
  const begin = await apiFetch<{
    challenge: string; kdfSalt: string; kdfOpsLimit: number; kdfMemLimit: number;
  }>('/api/v1/auth/change-password/begin', { method: 'POST' });

  // 2. Deriva la MK vieja desde la contraseña tecleada y firma el challenge con
  //    su identity key (prueba de posesión de la contraseña actual).
  const oldMk = deriveMasterKey(
    currentPassword, fromB64(begin.kdfSalt), begin.kdfOpsLimit, begin.kdfMemLimit,
  );
  const oldSignSeed = deriveSubKey(oldMk, 'noctcom.login.sign');
  const oldIdentityKp = sodium.crypto_sign_seed_keypair(oldSignSeed);
  const signature = sign(fromB64(begin.challenge), oldIdentityKp.privateKey);

  // 3. Nuevas claves derivadas de la contraseña nueva.
  const newSalt = randomBytes(DEFAULT_KDF.saltBytes());
  const opsLimit = DEFAULT_KDF.opsLimit();
  const memLimit = DEFAULT_KDF.memLimit();
  const newMk = deriveMasterKey(newPassword, newSalt, opsLimit, memLimit);

  const newSignSeed = deriveSubKey(newMk, 'noctcom.login.sign');
  const newIdentityKp = sodium.crypto_sign_seed_keypair(newSignSeed);
  const newIdWrapped = encrypt(newIdentityKp.privateKey, newMk);

  // exchange: misma clave, re-envuelta con la MK nueva.
  const newExWrapped = encrypt(auth.exchangePrivateKey, newMk);

  // vault keys (en memoria) re-envueltas con la MK nueva.
  const newVaultWrapKey = deriveSubKey(newMk, 'noctcom.vault.wrap');
  const vaults = Object.values(auth.vaultKeys).map((v) => {
    const w = encrypt(v.key, newVaultWrapKey);
    return { id: v.vaultId, vaultKeyWrapped: toB64(w.ciphertext), vaultKeyNonce: toB64(w.nonce) };
  });

  const opaqueRecord = randomBytes(64);

  try {
    await apiFetch('/api/v1/auth/change-password/finalize', {
      method: 'POST',
      body: JSON.stringify({
        challenge: begin.challenge,
        signature: toB64(signature),
        newOpaqueRecord: toB64(opaqueRecord),
        newKdfSalt: toB64(newSalt),
        newKdfOpsLimit: opsLimit,
        newKdfMemLimit: memLimit,
        newIdentityPublicKey: toB64(newIdentityKp.publicKey),
        newIdentityPrivateKeyWrapped: toB64(newIdWrapped.ciphertext),
        newIdentityPrivateKeyNonce: toB64(newIdWrapped.nonce),
        newExchangePrivateKeyWrapped: toB64(newExWrapped.ciphertext),
        newExchangePrivateKeyNonce: toB64(newExWrapped.nonce),
        vaults,
      }),
    });
  } finally {
    wipe(oldMk, oldSignSeed, oldIdentityKp.privateKey, newSignSeed, newVaultWrapKey);
  }

  // 4. Actualiza la sesión en memoria con las claves nuevas (las vault keys
  //    crudas no cambian; setIdentity las conserva). El access token sigue válido.
  useAuth.getState().setIdentity({
    userId: auth.userId,
    username: auth.username,
    deviceId: auth.deviceId,
    masterKey: newMk,
    identityPrivateKey: newIdentityKp.privateKey,
    identityPublicKey: newIdentityKp.publicKey,
    exchangePrivateKey: auth.exchangePrivateKey,
    exchangePublicKey: auth.exchangePublicKey,
  });
}
