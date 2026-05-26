/**
 * Sesión activa del usuario.
 *
 * IMPORTANTE: el material criptográfico (MK, privkeys desempaquetadas,
 * vault keys) vive SOLO en memoria. Si el usuario refresca la página,
 * tiene que volver a desbloquear con la contraseña.
 *
 * Si quieres "remember me" hay que escoger entre:
 *   - Persistir la MK cifrada con un PIN corto en IndexedDB (UX similar a Signal)
 *   - WebAuthn con prf extension (mejor opción moderna)
 * Aquí dejamos solo memoria por simplicidad y seguridad máxima.
 */

import { create } from 'zustand';
import type { Bytes } from './crypto';
import { wipe } from './crypto';

interface VaultKey {
  vaultId: string;
  key: Bytes;
  nameDecrypted: string;
}

interface AuthState {
  userId: string | null;
  username: string | null;
  deviceId: string | null;

  // Material criptográfico (en memoria)
  masterKey: Bytes | null;
  identityPrivateKey: Bytes | null;
  identityPublicKey: Bytes | null;
  exchangePrivateKey: Bytes | null;
  exchangePublicKey: Bytes | null;

  // Vault keys desempaquetadas (cache por sesión)
  vaultKeys: Record<string, VaultKey>;

  // Estado de UI
  isAuthenticated: boolean;
  isUnlocked: boolean;
  requires2FA: boolean;
}

interface AuthActions {
  setIdentity: (data: {
    userId: string;
    username: string;
    deviceId: string;
    masterKey: Bytes;
    identityPrivateKey: Bytes;
    identityPublicKey: Bytes;
    exchangePrivateKey: Bytes;
    exchangePublicKey: Bytes;
  }) => void;
  addVaultKey: (vault: VaultKey) => void;
  getVaultKey: (vaultId: string) => VaultKey | undefined;
  setRequires2FA: (yes: boolean) => void;
  lock: () => void;
  logout: () => void;
}

export const useAuth = create<AuthState & AuthActions>((set, get) => ({
  userId: null,
  username: null,
  deviceId: null,
  masterKey: null,
  identityPrivateKey: null,
  identityPublicKey: null,
  exchangePrivateKey: null,
  exchangePublicKey: null,
  vaultKeys: {},
  isAuthenticated: false,
  isUnlocked: false,
  requires2FA: false,

  setIdentity: (data) => {
    if (typeof window !== 'undefined' && data.deviceId) {
      localStorage.setItem('noctcom.deviceId', data.deviceId);
    }
    set({
      ...data,
      isAuthenticated: true,
      isUnlocked: true,
      requires2FA: false,
    });
  },

  addVaultKey: (vault) =>
    set((s) => ({ vaultKeys: { ...s.vaultKeys, [vault.vaultId]: vault } })),

  getVaultKey: (vaultId) => get().vaultKeys[vaultId],

  setRequires2FA: (yes) => set({ requires2FA: yes }),

  lock: () => {
    const s = get();
    wipe(s.masterKey, s.identityPrivateKey, s.exchangePrivateKey);
    Object.values(s.vaultKeys).forEach((v) => wipe(v.key));
    set({
      masterKey: null,
      identityPrivateKey: null,
      exchangePrivateKey: null,
      vaultKeys: {},
      isUnlocked: false,
    });
  },

  logout: () => {
    get().lock();
    if (typeof window !== 'undefined') {
      localStorage.removeItem('noctcom.deviceId');
      localStorage.removeItem('noctcom.devicePrivKey');
    }
    set({
      userId: null,
      username: null,
      deviceId: null,
      identityPublicKey: null,
      exchangePublicKey: null,
      isAuthenticated: false,
      requires2FA: false,
    });
  },
}));

export function getStoredDeviceId(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('noctcom.deviceId');
}
