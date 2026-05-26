/**
 * Sesión activa del usuario.
 *
 * El material criptográfico (MK, privkeys, vault keys) se guarda en
 * sessionStorage cifrado en base64url. Sobrevive a F5 pero se borra
 * al cerrar la pestaña — buen equilibrio entre UX y seguridad.
 */

import { create } from 'zustand';
import type { Bytes } from './crypto';
import { wipe } from './crypto';

const SS_KEY = 'noctcom.session';

interface VaultKey {
  vaultId: string;
  key: Bytes;
  nameDecrypted: string;
}

interface AuthState {
  userId: string | null;
  username: string | null;
  deviceId: string | null;

  masterKey: Bytes | null;
  identityPrivateKey: Bytes | null;
  identityPublicKey: Bytes | null;
  exchangePrivateKey: Bytes | null;
  exchangePublicKey: Bytes | null;

  vaultKeys: Record<string, VaultKey>;

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
  hydrate: () => void;
  lock: () => void;
  logout: () => void;
}

function bytesToB64(b: Bytes): string {
  let binary = '';
  for (let i = 0; i < b.length; i++) binary += String.fromCharCode(b[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64ToBytes(s: string): Bytes {
  const padded = s.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

interface SessionSnapshot {
  userId: string;
  username: string;
  deviceId: string;
  masterKey: string;
  identityPrivateKey: string;
  identityPublicKey: string;
  exchangePrivateKey: string;
  exchangePublicKey: string;
  vaultKeys: Record<string, { vaultId: string; key: string; nameDecrypted: string }>;
}

function persist(state: AuthState) {
  if (typeof window === 'undefined') return;
  if (!state.masterKey || !state.userId) return;
  try {
    const snap: SessionSnapshot = {
      userId: state.userId!,
      username: state.username!,
      deviceId: state.deviceId!,
      masterKey: bytesToB64(state.masterKey),
      identityPrivateKey: bytesToB64(state.identityPrivateKey!),
      identityPublicKey: bytesToB64(state.identityPublicKey!),
      exchangePrivateKey: bytesToB64(state.exchangePrivateKey!),
      exchangePublicKey: bytesToB64(state.exchangePublicKey!),
      vaultKeys: Object.fromEntries(
        Object.entries(state.vaultKeys).map(([id, v]) => [
          id,
          { vaultId: v.vaultId, key: bytesToB64(v.key), nameDecrypted: v.nameDecrypted },
        ]),
      ),
    };
    sessionStorage.setItem(SS_KEY, JSON.stringify(snap));
  } catch { /* quota or private browsing */ }
}

function clearSession() {
  if (typeof window === 'undefined') return;
  try { sessionStorage.removeItem(SS_KEY); } catch { /* */ }
}

function restoreSession(): Partial<AuthState> | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(SS_KEY);
    if (!raw) return null;
    const snap: SessionSnapshot = JSON.parse(raw);
    if (!snap.masterKey || !snap.userId) return null;
    return {
      userId: snap.userId,
      username: snap.username,
      deviceId: snap.deviceId,
      masterKey: b64ToBytes(snap.masterKey),
      identityPrivateKey: b64ToBytes(snap.identityPrivateKey),
      identityPublicKey: b64ToBytes(snap.identityPublicKey),
      exchangePrivateKey: b64ToBytes(snap.exchangePrivateKey),
      exchangePublicKey: b64ToBytes(snap.exchangePublicKey),
      vaultKeys: Object.fromEntries(
        Object.entries(snap.vaultKeys).map(([id, v]) => [
          id,
          { vaultId: v.vaultId, key: b64ToBytes(v.key), nameDecrypted: v.nameDecrypted },
        ]),
      ),
      isAuthenticated: true,
      isUnlocked: true,
      requires2FA: false,
    };
  } catch {
    clearSession();
    return null;
  }
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
    const next = {
      ...data,
      vaultKeys: get().vaultKeys,
      isAuthenticated: true,
      isUnlocked: true,
      requires2FA: false,
    };
    set(next);
    persist({ ...get(), ...next });
  },

  addVaultKey: (vault) => {
    set((s) => {
      const vaultKeys = { ...s.vaultKeys, [vault.vaultId]: vault };
      const next = { ...s, vaultKeys };
      persist(next);
      return { vaultKeys };
    });
  },

  getVaultKey: (vaultId) => get().vaultKeys[vaultId],

  setRequires2FA: (yes) => set({ requires2FA: yes }),

  hydrate: () => {
    const restored = restoreSession();
    if (restored) set(restored);
  },

  lock: () => {
    const s = get();
    wipe(s.masterKey, s.identityPrivateKey, s.exchangePrivateKey);
    Object.values(s.vaultKeys).forEach((v) => wipe(v.key));
    clearSession();
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
    clearSession();
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
