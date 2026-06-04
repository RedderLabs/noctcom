import { unzipSync, zipSync } from 'fflate';
import { apiFetch, getAccessToken, uploadToPresignedUrl } from './api';
import { useAuth } from './auth-store';
import {
  initCrypto, deriveMasterKey, deriveSubKey,
  decrypt, encrypt, decryptString,
  fromB64, toB64, wipe,
  type Bytes,
} from './crypto';
import { sealToRecovery } from './recovery';

export type ExportPhase = 'downloading' | 'done';
export type ImportPhase = 'parsing' | 'validating' | 'rewrapping' | 'uploading' | 'done';

interface NoctcomManifest {
  version: number;
  exportedAt: string;
  generator: string;
  crypto: {
    kdfAlgorithm: string;
    kdfSalt: string;
    kdfOpsLimit: number;
    kdfMemLimit: number;
  };
  vault: {
    nameEncrypted: string;
    nameNonce: string;
    vaultKeyWrapped: string;
    vaultKeyNonce: string;
  };
  nodes: Array<{
    id: string;
    parentId: string | null;
    kind: 'folder' | 'file';
    nameEncrypted: string;
    nameNonce: string;
    metadataEncrypted: string | null;
    metadataNonce: string | null;
    fileKeyWrapped: string | null;
    fileKeyNonce: string | null;
    starred: boolean;
    createdAt: string;
    updatedAt: string;
    version?: {
      versionNumber: number;
      totalSize: number;
      chunkCount: number;
      contentHash: string;
      metadataEncrypted: string | null;
      metadataNonce: string | null;
      chunks: Array<{
        index: number;
        ciphertextSize: number;
        nonce: string;
        authTag: string;
      }>;
    };
  }>;
}

// ─── Export ───────────────────────────────────────────────────────

export async function exportVault(
  vaultId: string,
  onProgress?: (phase: ExportPhase) => void,
): Promise<void> {
  onProgress?.('downloading');

  const token = getAccessToken();
  const resp = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL}/api/v1/vaults/${vaultId}/export`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!resp.ok) throw new Error(`Export failed: ${resp.status}`);

  const blob = await resp.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `noctcom-export-${new Date().toISOString().slice(0, 10)}.noctcom`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 100);

  onProgress?.('done');
}

// ─── Import ──────────────────────────────────────────────────────

export async function parseManifest(file: File): Promise<NoctcomManifest> {
  const buf = new Uint8Array(await file.arrayBuffer());
  const entries = unzipSync(buf);
  const manifestBytes = entries['manifest.json'];
  if (!manifestBytes) throw new Error('Invalid .noctcom file: no manifest.json');
  const text = new TextDecoder().decode(manifestBytes);
  const manifest: NoctcomManifest = JSON.parse(text);
  if (manifest.version !== 1) throw new Error(`Unsupported format version: ${manifest.version}`);
  return manifest;
}

export async function validateExportPassword(
  manifest: NoctcomManifest,
  password: string,
): Promise<{ vaultName: string; vaultKey: Bytes }> {
  await initCrypto();

  const salt = fromB64(manifest.crypto.kdfSalt);
  const oldMasterKey = deriveMasterKey(
    password, salt,
    manifest.crypto.kdfOpsLimit,
    manifest.crypto.kdfMemLimit,
  );
  const oldVaultWrapKey = deriveSubKey(oldMasterKey, 'noctcom.vault.wrap');
  wipe(oldMasterKey);

  let vaultKey: Bytes;
  try {
    vaultKey = decrypt(
      fromB64(manifest.vault.vaultKeyWrapped),
      fromB64(manifest.vault.vaultKeyNonce),
      oldVaultWrapKey,
    );
  } catch {
    wipe(oldVaultWrapKey);
    throw new Error('wrong_password');
  }
  wipe(oldVaultWrapKey);

  let vaultName: string;
  try {
    vaultName = decryptString(
      fromB64(manifest.vault.nameEncrypted),
      fromB64(manifest.vault.nameNonce),
      vaultKey,
    );
  } catch {
    vaultName = 'Imported vault';
  }

  return { vaultName, vaultKey };
}

export async function importVault(
  file: File,
  vaultKey: Bytes,
  onProgress?: (phase: ImportPhase, pct: number) => void,
): Promise<string> {
  await initCrypto();
  onProgress?.('parsing', 0);

  const buf = new Uint8Array(await file.arrayBuffer());
  const entries = unzipSync(buf);
  const manifest: NoctcomManifest = JSON.parse(
    new TextDecoder().decode(entries['manifest.json']),
  );

  onProgress?.('rewrapping', 0);

  const currentMasterKey = useAuth.getState().masterKey;
  if (!currentMasterKey) throw new Error('Not authenticated');

  const newVaultWrapKey = deriveSubKey(currentMasterKey, 'noctcom.vault.wrap');
  const { ciphertext: newVaultKeyWrapped, nonce: newVaultKeyNonce } = encrypt(vaultKey, newVaultWrapKey);
  wipe(newVaultWrapKey);

  // Recovery v2: si la cuenta tiene recovery box key, sella la vault key
  // importada a ella — así también esta bóveda sobrevive a una recuperación.
  let vaultKeySealedRecovery: string | undefined;
  try {
    const status = await apiFetch<{ recoveryBoxPublicKey: string | null }>(
      '/api/v1/2fa/recovery/status',
    );
    if (status.recoveryBoxPublicKey) {
      vaultKeySealedRecovery = toB64(
        sealToRecovery(vaultKey, fromB64(status.recoveryBoxPublicKey)),
      );
    }
  } catch { /* sin kit v2 — la bóveda se importa igual */ }

  const importNodes = manifest.nodes.map((n) => ({
    originalId: n.id,
    parentOriginalId: n.parentId,
    kind: n.kind,
    nameEncrypted: n.nameEncrypted,
    nameNonce: n.nameNonce,
    metadataEncrypted: n.metadataEncrypted,
    metadataNonce: n.metadataNonce,
    fileKeyWrapped: n.fileKeyWrapped,
    fileKeyNonce: n.fileKeyNonce,
    starred: n.starred,
    version: n.version ? {
      totalSize: n.version.totalSize,
      chunkCount: n.version.chunkCount,
      contentHash: n.version.contentHash,
      metadataEncrypted: n.version.metadataEncrypted,
      metadataNonce: n.version.metadataNonce,
      chunks: n.version.chunks.map((c) => ({
        index: c.index,
        ciphertextSize: c.ciphertextSize,
        nonce: c.nonce,
        authTag: c.authTag,
      })),
    } : undefined,
  }));

  onProgress?.('uploading', 0);

  const initResp = await apiFetch<{
    vaultId: string;
    nodeMap: Record<string, string>;
    chunkUploads: Array<{
      originalNodeId: string;
      chunkIndex: number;
      chunkId: string;
      uploadUrl: string;
    }>;
  }>('/api/v1/vaults/import/init', {
    method: 'POST',
    body: JSON.stringify({
      nameEncrypted: manifest.vault.nameEncrypted,
      nameNonce: manifest.vault.nameNonce,
      vaultKeyWrapped: toB64(newVaultKeyWrapped),
      vaultKeyNonce: toB64(newVaultKeyNonce),
      vaultKeySealedRecovery,
      nodes: importNodes,
    }),
  });

  const total = initResp.chunkUploads.length;
  let uploaded = 0;
  const CONCURRENCY = 4;

  const queue = [...initResp.chunkUploads];
  const uploadChunk = async () => {
    while (queue.length > 0) {
      const ch = queue.shift()!;
      const blobPath = `blobs/${ch.originalNodeId}/${ch.chunkIndex}`;
      const data = entries[blobPath];
      if (!data) throw new Error(`Missing blob: ${blobPath}`);

      if (ch.uploadUrl.includes('/api/v1/uploads/chunk/')) {
        const token = getAccessToken();
        await fetch(ch.uploadUrl, {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/octet-stream',
          },
          body: data,
        });
      } else {
        await uploadToPresignedUrl(ch.uploadUrl, data);
      }

      uploaded++;
      onProgress?.('uploading', Math.round((uploaded / total) * 100));
    }
  };

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, total) }, () => uploadChunk()));

  await apiFetch(`/api/v1/vaults/import/${initResp.vaultId}/complete`, { method: 'POST' });

  wipe(vaultKey);
  onProgress?.('done', 100);

  return initResp.vaultId;
}
