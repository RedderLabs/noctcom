'use client';

import { create } from 'zustand';
import { toast } from 'sonner';
import { rt } from './i18n-runtime';
import { useAuth } from './auth-store';
import { apiFetch, uploadToPresignedUrl, getAccessToken } from './api';
import {
  initCrypto, decrypt, encrypt, encryptString, decryptString,
  decryptJSON, encryptJSON, randomKey, randomNonce,
  fromB64, toB64, CHUNK_SIZE, deriveSubKey, wipe,
  type Bytes,
} from './crypto';
import type { FolderIconKey, FolderColorKey } from '@/components/vault/folder-icons';
import { queueUpload } from './offline-queue';

// ─── Types ───────────────────────────────────────────────────────

export interface DecryptedNode {
  id: string;
  kind: 'folder' | 'file';
  name: string;
  icon?: FolderIconKey;
  color?: FolderColorKey;
  size: number;
  mimeType?: string;
  starred?: boolean;
  updatedAt: string;
  createdAt: string;
  currentVersionId?: string;
  fileKeyWrapped?: string;
  fileKeyNonce?: string;
  deletedAt?: string;
}

export interface UploadTask {
  fileName: string;
  progress: number;
  // 'queued' = sin red: cifrado y persistido en la cola offline (IndexedDB,
  // solo ciphertext); se transmite solo al volver la conexión (sync.ts).
  status: 'encrypting' | 'uploading' | 'queued' | 'done' | 'error';
}

interface VaultState {
  vaults: { id: string; name: string; createdAt: string }[];
  currentVaultId: string | null;
  nodes: DecryptedNode[];
  parentId: string | null;
  breadcrumb: { id: string | null; name: string }[];
  loading: boolean;
  initialized: boolean;
  uploads: Record<string, UploadTask>;
  storageUsed: number;
  storageQuota: number;
  // null = aún no sabemos (no llegó /me); false = primer login → mostrar tour
  onboarded: boolean | null;
  // Beta: undefined = aún no llegó /me; null = el trial NO arrancó (→ mostrar
  // el modal de bienvenida); string ISO = fecha en que arrancó (→ cuenta atrás).
  trialStartedAt: string | null | undefined;
  // Duración del trial en días (la decide el backend con BETA_TRIAL_DAYS).
  trialDays: number;
  // TRUE = cuenta exenta del trial (anteriores al lanzamiento): ni modal ni
  // cuenta atrás. Default true hasta que /me diga lo contrario (no molestar).
  trialExempt: boolean;
  // Plan actual ('free' | 'starter' | ...). Con plan de pago no se muestra
  // nada del trial (ya desbloqueó) y el Connector está disponible.
  plan: string;
}

interface VaultActions {
  init: () => Promise<void>;
  loadNodes: (parentId?: string | null) => Promise<void>;
  navigateToFolder: (folderId: string, folderName: string) => Promise<void>;
  navigateUp: () => Promise<void>;
  createFolder: (name: string, icon: FolderIconKey, color: FolderColorKey) => Promise<void>;
  deleteNode: (nodeId: string) => Promise<void>;
  moveNode: (nodeId: string, newParentId: string) => Promise<void>;
  uploadFiles: (files: File[]) => Promise<void>;
  getFileBlob: (node: DecryptedNode) => Promise<Blob>;
  downloadFile: (node: DecryptedNode) => Promise<void>;
  loadTrash: () => Promise<DecryptedNode[]>;
  restoreNode: (nodeId: string) => Promise<void>;
  purgeNode: (nodeId: string) => Promise<void>;
  toggleStar: (nodeId: string) => Promise<void>;
  loadRecent: () => Promise<DecryptedNode[]>;
  loadStarred: () => Promise<DecryptedNode[]>;
  lookupUser: (username: string) => Promise<{ id: string; username: string; exchangePublicKey: string } | null>;
  createShare: (nodeId: string, recipientUsername: string, permission?: 'read' | 'write') => Promise<void>;
  loadShares: (direction: 'incoming' | 'outgoing') => Promise<any[]>;
  revokeShare: (shareId: string) => Promise<void>;
  logActivity: (event: { type: string; description: string; target?: string }) => Promise<void>;
  loadActivity: (limit?: number, offset?: number) => Promise<{ events: any[]; total: number }>;
  refreshStorage: () => Promise<void>;
  completeOnboarding: () => Promise<void>;
  startTrial: () => Promise<void>;
  reset: () => void;
}

// ─── Helpers ─────────────────────────────────────────────────────

function requireVaultKey(vaultId: string): Bytes {
  const vk = useAuth.getState().getVaultKey(vaultId);
  if (!vk) throw new Error('Vault key not found — session expired');
  return vk.key;
}

function decryptNodeList(rawNodes: any[], vaultKey: Bytes): DecryptedNode[] {
  return rawNodes.map((n: any) => {
    let name: string;
    try {
      name = decryptString(fromB64(n.nameEncrypted), fromB64(n.nameNonce), vaultKey);
    } catch {
      name = '[cifrado]';
    }

    let icon: FolderIconKey | undefined;
    let color: FolderColorKey | undefined;
    let mimeType: string | undefined;

    if (n.metadataEncrypted && n.metadataNonce) {
      try {
        const meta = decryptJSON<Record<string, any>>(
          fromB64(n.metadataEncrypted), fromB64(n.metadataNonce), vaultKey,
        );
        icon = meta.icon;
        color = meta.color;
        mimeType = meta.mimeType;
      } catch { /* metadata unreadable */ }
    }

    return {
      id: n.id,
      kind: n.kind,
      name,
      icon,
      color,
      mimeType,
      size: n.ciphertextSize ?? 0,
      starred: n.starred ?? false,
      updatedAt: n.updatedAt,
      createdAt: n.createdAt,
      currentVersionId: n.currentVersionId ?? undefined,
      fileKeyWrapped: n.fileKeyWrapped ?? undefined,
      fileKeyNonce: n.fileKeyNonce ?? undefined,
      deletedAt: n.deletedAt ?? undefined,
    };
  });
}

// ─── Store ───────────────────────────────────────────────────────

const initial: VaultState = {
  vaults: [],
  currentVaultId: null,
  nodes: [],
  parentId: null,
  breadcrumb: [{ id: null, name: 'Mi bóveda' }],
  loading: false,
  initialized: false,
  uploads: {},
  storageUsed: 0,
  storageQuota: 10_737_418_240,
  onboarded: null,
  trialStartedAt: undefined,
  trialDays: 30,
  trialExempt: true,
  plan: 'free',
};

export const useVault = create<VaultState & VaultActions>((set, get) => ({
  ...initial,

  // ─── Init: load vaults, unwrap keys, decrypt names ─────────
  init: async () => {
    if (get().initialized) return;
    set({ loading: true });
    try {
      await initCrypto();
      const auth = useAuth.getState();
      if (!auth.masterKey) throw new Error('Sesión expirada');

      const vaultWrapKey = deriveSubKey(auth.masterKey, 'noctcom.vault.wrap');

      const { vaults: rawVaults } = await apiFetch<{
        vaults: Array<{
          id: string;
          nameEncrypted: string;
          nameNonce: string;
          vaultKeyWrapped: string;
          vaultKeyNonce: string;
          createdAt: string;
        }>;
      }>('/api/v1/vaults');

      const vaults: VaultState['vaults'] = [];
      for (const rv of rawVaults) {
        const vaultKey = decrypt(
          fromB64(rv.vaultKeyWrapped), fromB64(rv.vaultKeyNonce), vaultWrapKey,
        );
        let name = 'Bóveda';
        try {
          name = decryptString(fromB64(rv.nameEncrypted), fromB64(rv.nameNonce), vaultKey);
        } catch { /* use default */ }
        useAuth.getState().addVaultKey({ vaultId: rv.id, key: vaultKey, nameDecrypted: name });
        vaults.push({ id: rv.id, name, createdAt: rv.createdAt });
      }

      const currentVaultId = vaults[0]?.id ?? null;
      set({
        vaults,
        currentVaultId,
        breadcrumb: [{ id: null, name: vaults[0]?.name ?? 'Mi bóveda' }],
        initialized: true,
      });

      await get().refreshStorage();
      if (currentVaultId) await get().loadNodes(null);
    } catch (err: any) {
      toast.error(err.message ?? rt('toasts.loadVaultError'));
    } finally {
      set({ loading: false });
    }
  },

  // ─── Load nodes for current vault + parent ─────────────────
  loadNodes: async (parentId = null) => {
    const { currentVaultId } = get();
    if (!currentVaultId) return;
    set({ loading: true });
    try {
      const vaultKey = requireVaultKey(currentVaultId);
      const q = parentId ? `?parent=${parentId}` : '';
      const { nodes: raw } = await apiFetch<{ nodes: any[] }>(
        `/api/v1/nodes/vault/${currentVaultId}/list${q}`,
      );
      set({ nodes: decryptNodeList(raw, vaultKey), parentId });
    } catch (err: any) {
      toast.error(err.message ?? rt('toasts.loadFilesError'));
    } finally {
      set({ loading: false });
    }
  },

  // ─── Navigation ────────────────────────────────────────────
  navigateToFolder: async (folderId, folderName) => {
    set({ breadcrumb: [...get().breadcrumb, { id: folderId, name: folderName }] });
    await get().loadNodes(folderId);
  },

  navigateUp: async () => {
    const bc = get().breadcrumb;
    if (bc.length <= 1) return;
    const next = bc.slice(0, -1);
    set({ breadcrumb: next });
    await get().loadNodes(next[next.length - 1]!.id);
  },

  // ─── Folder creation ──────────────────────────────────────
  createFolder: async (name, icon, color) => {
    const { currentVaultId, parentId } = get();
    if (!currentVaultId) return;
    const vaultKey = requireVaultKey(currentVaultId);
    const nameEnc = encryptString(name, vaultKey);
    const metaEnc = encryptJSON({ icon, color }, vaultKey);

    await apiFetch('/api/v1/nodes/folders', {
      method: 'POST',
      body: JSON.stringify({
        vaultId: currentVaultId,
        parentId,
        nameEncrypted: toB64(nameEnc.ciphertext),
        nameNonce: toB64(nameEnc.nonce),
        metadataEncrypted: toB64(metaEnc.ciphertext),
        metadataNonce: toB64(metaEnc.nonce),
      }),
    });
    get().logActivity({ type: 'folder_create', description: 'Carpeta creada', target: name });
    await get().loadNodes(parentId);
  },

  // ─── Delete (soft — moves to trash) ───────────────────────
  deleteNode: async (nodeId) => {
    const node = get().nodes.find((n) => n.id === nodeId);
    try {
      await apiFetch(`/api/v1/nodes/${nodeId}`, { method: 'DELETE' });
      if (node) {
        toast.success(rt('toasts.movedToTrash', { name: node.name }));
        get().logActivity({ type: 'delete', description: 'Archivo eliminado', target: node.name });
      }
      await get().loadNodes(get().parentId);
    } catch (err: any) {
      toast.error(rt('toasts.deleteFailed', { error: err.message }));
    }
  },

  // ─── Move node to another folder ──────────────────────────
  moveNode: async (nodeId, newParentId) => {
    await apiFetch(`/api/v1/nodes/${nodeId}/move`, {
      method: 'POST',
      body: JSON.stringify({ newParentId }),
    });
    await get().loadNodes(get().parentId);
  },

  // ─── Upload: encrypt → init → PUT chunks → complete ──────
  uploadFiles: async (files) => {
    const { currentVaultId, parentId } = get();
    if (!currentVaultId) return;
    const vaultKey = requireVaultKey(currentVaultId);
    const sodium = (await import('libsodium-wrappers-sumo')).default;
    await sodium.ready;

    for (const file of files) {
      const uid = crypto.randomUUID();
      set((s) => ({
        uploads: { ...s.uploads, [uid]: { fileName: file.name, progress: 0, status: 'encrypting' } },
      }));

      try {
        const fileKey = randomKey();
        const nameEnc = encryptString(file.name, vaultKey);
        const metaEnc = encryptJSON(
          { mimeType: file.type, originalSize: file.size },
          vaultKey,
        );
        const fkWrapped = encrypt(fileKey, vaultKey);

        // Pre-calculate chunk metadata (sizes are deterministic from XChaCha20-Poly1305)
        const numChunks = Math.max(1, Math.ceil(file.size / CHUNK_SIZE));
        const chunkMeta: { index: number; ciphertextSize: number; nonce: Bytes }[] = [];
        for (let i = 0; i < numChunks; i++) {
          const plainSize = Math.min(CHUNK_SIZE, file.size - i * CHUNK_SIZE);
          chunkMeta.push({ index: i, ciphertextSize: plainSize + 16, nonce: randomNonce() });
        }
        const totalSize = chunkMeta.reduce((sum, c) => sum + c.ciphertextSize, 0);

        // ── Sin conexión: cifrar YA (la vault key está en memoria) y encolar
        // el ciphertext en IndexedDB. sync.ts vacía la cola al volver online.
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          const hashState = sodium.crypto_generichash_init(null, 32);
          const authTags: { index: number; authTag: string }[] = [];
          const chunks: { index: number; ciphertextSize: number; nonce: string; data: ArrayBuffer }[] = [];
          for (const cm of chunkMeta) {
            const start = cm.index * CHUNK_SIZE;
            const end = Math.min(start + CHUNK_SIZE, file.size);
            const slice = new Uint8Array(await file.slice(start, end).arrayBuffer());
            const aad = sodium.from_string(`chunk:${cm.index}`);
            const ct = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
              slice, aad, null, cm.nonce, fileKey,
            );
            sodium.crypto_generichash_update(hashState, ct);
            authTags.push({ index: cm.index, authTag: toB64(ct.slice(ct.length - 16)) });
            chunks.push({
              index: cm.index,
              ciphertextSize: cm.ciphertextSize,
              nonce: toB64(cm.nonce),
              data: ct.slice().buffer, // copia exacta: ArrayBuffer limpio para IDB
            });
          }
          const contentHash = toB64(sodium.crypto_generichash_final(hashState, 32));
          wipe(fileKey);
          await queueUpload({
            id: uid,
            createdAt: Date.now(),
            vaultId: currentVaultId,
            parentId,
            nameEncrypted: toB64(nameEnc.ciphertext),
            nameNonce: toB64(nameEnc.nonce),
            metadataEncrypted: toB64(metaEnc.ciphertext),
            metadataNonce: toB64(metaEnc.nonce),
            fileKeyWrapped: toB64(fkWrapped.ciphertext),
            fileKeyNonce: toB64(fkWrapped.nonce),
            totalSize,
            chunks,
            chunkAuthTags: authTags,
            contentHash,
          });
          set((s) => ({
            uploads: { ...s.uploads, [uid]: { ...s.uploads[uid]!, status: 'queued', progress: 100 } },
          }));
          toast.info(rt('toasts.uploadQueued', { name: file.name }));
          continue;
        }

        const initRes = await apiFetch<{
          nodeId: string;
          versionId: string;
          presignedUrls: { index: number; uploadUrl: string }[];
        }>('/api/v1/uploads/init', {
          method: 'POST',
          body: JSON.stringify({
            vaultId: currentVaultId,
            parentId,
            nameEncrypted: toB64(nameEnc.ciphertext),
            nameNonce: toB64(nameEnc.nonce),
            metadataEncrypted: toB64(metaEnc.ciphertext),
            metadataNonce: toB64(metaEnc.nonce),
            fileKeyWrapped: toB64(fkWrapped.ciphertext),
            fileKeyNonce: toB64(fkWrapped.nonce),
            chunks: chunkMeta.map((c) => ({
              index: c.index,
              ciphertextSize: c.ciphertextSize,
              nonce: toB64(c.nonce),
            })),
            totalSize,
          }),
        });

        set((s) => ({
          uploads: { ...s.uploads, [uid]: { ...s.uploads[uid]!, status: 'uploading' } },
        }));

        // Encrypt each chunk, upload, and compute content hash incrementally
        const hashState = sodium.crypto_generichash_init(null, 32);
        const authTags: { index: number; authTag: string }[] = [];

        for (let i = 0; i < chunkMeta.length; i++) {
          const cm = chunkMeta[i]!;
          const start = cm.index * CHUNK_SIZE;
          const end = Math.min(start + CHUNK_SIZE, file.size);
          const slice = new Uint8Array(await file.slice(start, end).arrayBuffer());

          const aad = sodium.from_string(`chunk:${cm.index}`);
          const ct = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
            slice, aad, null, cm.nonce, fileKey,
          );

          sodium.crypto_generichash_update(hashState, ct);
          authTags.push({ index: cm.index, authTag: toB64(ct.slice(ct.length - 16)) });

          const url = initRes.presignedUrls.find((p) => p.index === cm.index)!.uploadUrl;
          const isDiskUpload = url.includes('/api/v1/uploads/chunk/');
          if (isDiskUpload) {
            await apiFetch(new URL(url).pathname, {
              method: 'PUT',
              headers: { 'content-type': 'application/octet-stream' },
              body: ct as unknown as BodyInit,
            });
            const pct = Math.round(((i + 1) / chunkMeta.length) * 100);
            set((s) => ({
              uploads: { ...s.uploads, [uid]: { ...s.uploads[uid]!, progress: pct } },
            }));
          } else {
            await uploadToPresignedUrl(url, ct as unknown as BodyInit, (loaded, total) => {
              const pct = Math.round(((i + loaded / total) / chunkMeta.length) * 100);
              set((s) => ({
                uploads: { ...s.uploads, [uid]: { ...s.uploads[uid]!, progress: pct } },
              }));
            });
          }
        }

        const contentHash = sodium.crypto_generichash_final(hashState, 32);
        await apiFetch(`/api/v1/uploads/${initRes.versionId}/complete`, {
          method: 'POST',
          body: JSON.stringify({ contentHash: toB64(contentHash), chunkAuthTags: authTags }),
        });

        wipe(fileKey);
        set((s) => ({
          uploads: { ...s.uploads, [uid]: { ...s.uploads[uid]!, status: 'done', progress: 100 } },
        }));
        toast.success(rt('toasts.uploaded', { name: file.name }));
        get().logActivity({ type: 'upload', description: 'Archivo subido', target: file.name });
      } catch (err: any) {
        set((s) => ({
          uploads: { ...s.uploads, [uid]: { ...s.uploads[uid]!, status: 'error' } },
        }));
        toast.error(rt('toasts.uploadError', { name: file.name, error: err.message }));
      }
    }

    await get().loadNodes(get().parentId);
    await get().refreshStorage();

    setTimeout(() => {
      set((s) => {
        const u = { ...s.uploads };
        for (const k of Object.keys(u)) if (u[k]!.status === 'done' || u[k]!.status === 'queued') delete u[k];
        return { uploads: u };
      });
    }, 3000);
  },

  // ─── Decrypt file to Blob (reusable for preview + download) ─
  getFileBlob: async (node) => {
    if (node.kind !== 'file' || !node.currentVersionId) {
      throw new Error('No es un archivo descargable');
    }
    const { currentVaultId } = get();
    if (!currentVaultId) throw new Error('No hay vault seleccionado');

    const vaultKey = requireVaultKey(currentVaultId);
    const sodium = (await import('libsodium-wrappers-sumo')).default;
    await sodium.ready;

    const dl = await apiFetch<{
      chunks: { index: number; nonce: string; downloadUrl: string }[];
      fileKeyWrapped: string;
      fileKeyNonce: string;
    }>(`/api/v1/uploads/${node.currentVersionId}/download`);

    const fileKey = decrypt(fromB64(dl.fileKeyWrapped), fromB64(dl.fileKeyNonce), vaultKey);
    const parts: Uint8Array[] = [];

    for (const ch of dl.chunks.sort((a, b) => a.index - b.index)) {
      const headers: Record<string, string> = {};
      const token = getAccessToken();
      if (token && ch.downloadUrl.includes('/api/')) {
        headers.authorization = `Bearer ${token}`;
      }
      const res = await fetch(ch.downloadUrl, { headers });
      if (!res.ok) throw new Error(`Chunk ${ch.index} falló`);
      const ct = new Uint8Array(await res.arrayBuffer());
      const aad = sodium.from_string(`chunk:${ch.index}`);
      parts.push(
        sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
          null, ct, aad, fromB64(ch.nonce), fileKey,
        ),
      );
    }

    wipe(fileKey);
    return new Blob(parts as BlobPart[], { type: node.mimeType || 'application/octet-stream' });
  },

  downloadFile: async (node) => {
    if (node.kind !== 'file' || !node.currentVersionId) return;
    try {
      toast.info(rt('toasts.downloading', { name: node.name }));
      const blob = await get().getFileBlob(node);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = node.name;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(a.href); }, 100);
      toast.success(rt('toasts.downloaded', { name: node.name }));
    } catch (err: any) {
      toast.error(rt('toasts.downloadFailed', { error: err.message }));
    }
  },

  // ─── Trash ─────────────────────────────────────────────────
  loadTrash: async () => {
    const { currentVaultId } = get();
    if (!currentVaultId) return [];
    try {
      const vaultKey = requireVaultKey(currentVaultId);
      const { nodes: raw } = await apiFetch<{ nodes: any[] }>(
        `/api/v1/nodes/vault/${currentVaultId}/trash`,
      );
      return decryptNodeList(raw, vaultKey);
    } catch {
      return [];
    }
  },

  restoreNode: async (nodeId) => {
    await apiFetch(`/api/v1/nodes/${nodeId}/restore`, { method: 'POST' });
    toast.success(rt('toasts.restored'));
  },

  purgeNode: async (nodeId) => {
    try {
      await apiFetch(`/api/v1/nodes/${nodeId}/permanent`, { method: 'DELETE' });
      toast.success(rt('toasts.deletedForever'));
    } catch (err: any) {
      toast.error(rt('toasts.deleteFailed', { error: err.message }));
      throw err;
    }
  },

  // ─── Star toggle ────────────────────────────────────────────
  toggleStar: async (nodeId) => {
    const { starred } = await apiFetch<{ starred: boolean }>(
      `/api/v1/nodes/${nodeId}/star`, { method: 'PATCH' },
    );
    set((s) => ({
      nodes: s.nodes.map((n) => n.id === nodeId ? { ...n, starred } : n),
    }));
  },

  // ─── Recent & Starred loaders ─────────────────────────────
  loadRecent: async () => {
    const { currentVaultId } = get();
    if (!currentVaultId) return [];
    try {
      const vaultKey = requireVaultKey(currentVaultId);
      const { nodes: raw } = await apiFetch<{ nodes: any[] }>(
        `/api/v1/nodes/vault/${currentVaultId}/recent`,
      );
      return decryptNodeList(raw, vaultKey);
    } catch {
      return [];
    }
  },

  loadStarred: async () => {
    const { currentVaultId } = get();
    if (!currentVaultId) return [];
    try {
      const vaultKey = requireVaultKey(currentVaultId);
      const { nodes: raw } = await apiFetch<{ nodes: any[] }>(
        `/api/v1/nodes/vault/${currentVaultId}/starred`,
      );
      return decryptNodeList(raw, vaultKey);
    } catch {
      return [];
    }
  },

  // ─── Shares ────────────────────────────────────────────────
  lookupUser: async (username) => {
    try {
      return await apiFetch<{ id: string; username: string; exchangePublicKey: string }>(
        `/api/v1/auth/users/lookup/${encodeURIComponent(username)}`,
      );
    } catch {
      return null;
    }
  },

  createShare: async (nodeId, recipientUsername, permission = 'read') => {
    const { currentVaultId } = get();
    if (!currentVaultId) return;

    const vaultKey = requireVaultKey(currentVaultId);
    const sodium = (await import('libsodium-wrappers-sumo')).default;
    await sodium.ready;

    const recipient = await get().lookupUser(recipientUsername);
    if (!recipient) throw new Error(`Usuario «${recipientUsername}» no encontrado`);

    const node = get().nodes.find((n) => n.id === nodeId);
    if (!node || !node.fileKeyWrapped || !node.fileKeyNonce) {
      throw new Error('Archivo sin clave — no se puede compartir');
    }

    const fileKey = decrypt(fromB64(node.fileKeyWrapped), fromB64(node.fileKeyNonce), vaultKey);
    const sealedKey = sodium.crypto_box_seal(fileKey, fromB64(recipient.exchangePublicKey));
    wipe(fileKey);

    await apiFetch('/api/v1/shares', {
      method: 'POST',
      body: JSON.stringify({
        nodeId,
        sharedWithUserId: recipient.id,
        permission,
        sealedKey: toB64(sealedKey),
      }),
    });

    toast.success(rt('toasts.sharedWith', { name: recipient.username }));
    get().logActivity({ type: 'share', description: `Compartido con ${recipient.username}`, target: node.name });
  },

  loadShares: async (direction) => {
    try {
      const { shares } = await apiFetch<{ shares: any[] }>(`/api/v1/shares/${direction}`);
      return shares;
    } catch {
      return [];
    }
  },

  revokeShare: async (shareId) => {
    await apiFetch(`/api/v1/shares/${shareId}`, { method: 'DELETE' });
    toast.success(rt('toasts.shareRevoked'));
  },

  // ─── Activity log ───────────────────────────────────────────
  logActivity: async (event) => {
    const auth = useAuth.getState();
    if (!auth.masterKey) return;
    const auditKey = deriveSubKey(auth.masterKey, 'noctcom.audit.v1');
    const enc = encryptJSON(event, auditKey);
    await apiFetch('/api/v1/audit', {
      method: 'POST',
      body: JSON.stringify({
        eventEncrypted: toB64(enc.ciphertext),
        eventNonce: toB64(enc.nonce),
      }),
    }).catch(() => {});
  },

  loadActivity: async (limit = 50, offset = 0) => {
    const auth = useAuth.getState();
    if (!auth.masterKey) return { events: [], total: 0 };
    const auditKey = deriveSubKey(auth.masterKey, 'noctcom.audit.v1');

    try {
      const { events: raw, total } = await apiFetch<{
        events: { id: string; eventEncrypted: string; eventNonce: string; createdAt: string }[];
        total: number;
      }>(`/api/v1/audit?limit=${limit}&offset=${offset}`);

      const events = raw.map((e) => {
        try {
          const data = decryptJSON<Record<string, any>>(fromB64(e.eventEncrypted), fromB64(e.eventNonce), auditKey);
          return { id: e.id, ...data, createdAt: e.createdAt };
        } catch {
          return { id: e.id, type: 'unknown', description: '[cifrado]', createdAt: e.createdAt };
        }
      });

      return { events, total };
    } catch {
      return { events: [], total: 0 };
    }
  },

  // ─── Storage ───────────────────────────────────────────────
  refreshStorage: async () => {
    try {
      const me = await apiFetch<{
        storageUsedBytes: number; storageQuotaBytes: number; onboarded?: boolean;
        trialStartedAt?: string | null; trialDays?: number; trialExempt?: boolean;
        plan?: string;
      }>('/api/v1/auth/me');
      set({
        storageUsed: me.storageUsedBytes,
        storageQuota: me.storageQuotaBytes,
        // Solo se fija la primera vez: si el usuario cierra el tour, el estado
        // local pasa a true y un refresh posterior no debe re-abrirlo.
        onboarded: get().onboarded === true ? true : (me.onboarded ?? true),
        // Misma idea: una vez arrancado localmente (optimista), un refresh con
        // datos viejos del servidor no debe re-abrir el modal del trial.
        trialStartedAt: get().trialStartedAt ?? (me.trialStartedAt ?? null),
        trialDays: me.trialDays ?? get().trialDays,
        trialExempt: me.trialExempt ?? true,
        plan: me.plan ?? 'free',
      });
    } catch { /* ignore */ }
  },

  completeOnboarding: async () => {
    set({ onboarded: true }); // optimista: el tour se cierra ya
    try {
      await apiFetch('/api/v1/auth/onboarding/complete', { method: 'POST' });
    } catch { /* sin red no pasa nada: se reintentará en el próximo login */ }
  },

  // El reloj de la beta arranca al VER el modal de bienvenida del trial.
  startTrial: async () => {
    if (get().trialExempt || get().trialStartedAt) return;
    set({ trialStartedAt: new Date().toISOString() }); // optimista: el contador sale ya
    try {
      await apiFetch('/api/v1/auth/trial/start', { method: 'POST' });
    } catch { /* sin red no pasa nada: se reintentará en el próximo login */ }
  },

  reset: () => set(initial),
}));
