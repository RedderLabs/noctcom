'use client';

// Fase 11 · PWA — cola de subidas offline.
//
// Si el usuario suelta archivos SIN conexión (con la sesión ya abierta, que
// es el único caso posible: sin red no hay login), el flujo de subida cifra
// igual que siempre y, en vez de transmitir, persiste aquí. Al volver la
// conexión (listener en sync.ts) la cola se vacía sola: init → PUT → complete.
//
// Zero-knowledge intacto: en IndexedDB solo se persiste CIPHERTEXT (chunks
// cifrados, nombre/metadata cifrados, fileKey envuelta con la vault key),
// nonces, auth tags y el content hash. Ni claves ni plaintext tocan disco.
// El flush ni siquiera necesita la fileKey: los tags y el hash ya están.

import { apiFetch, uploadToPresignedUrl, ApiError } from './api';
import { rt } from './i18n-runtime';
import { toast } from 'sonner';

export interface QueuedUpload {
  id: string;
  createdAt: number;
  vaultId: string;
  parentId: string | null;
  /** Nombre en claro NO: solo para el aviso al sincronizar se descifra en
   *  memoria desde nameEncrypted con la vault key (la tiene quien hace flush). */
  nameEncrypted: string;
  nameNonce: string;
  metadataEncrypted: string;
  metadataNonce: string;
  fileKeyWrapped: string;
  fileKeyNonce: string;
  totalSize: number;
  chunks: { index: number; ciphertextSize: number; nonce: string; data: ArrayBuffer }[];
  chunkAuthTags: { index: number; authTag: string }[];
  contentHash: string;
}

const DB_NAME = 'noctcom-offline';
const STORE = 'pending-uploads';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(db: IDBDatabase, mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function queueUpload(record: QueuedUpload): Promise<void> {
  const db = await openDb();
  try {
    await tx(db, 'readwrite', (s) => s.put(record));
  } finally {
    db.close();
  }
}

export async function countQueued(): Promise<number> {
  try {
    const db = await openDb();
    try {
      return await tx(db, 'readonly', (s) => s.count());
    } finally {
      db.close();
    }
  } catch {
    return 0; // IDB no disponible (modo privado antiguo, etc.)
  }
}

// Evita flushes solapados (online + init de sesión pueden coincidir).
let flushing = false;

/**
 * Vacía la cola: por cada subida pendiente repite el init→PUT→complete del
 * flujo normal con el ciphertext ya persistido. Errores de red → se conserva
 * el registro y se reintenta en el próximo online. Rechazo del servidor
 * (cuota, validación…) → se descarta el registro y se avisa, si no la cola
 * reintentaría para siempre algo que nunca va a entrar.
 *
 * Devuelve cuántas se enviaron (0 si no había nada o no hay sesión).
 */
export async function flushQueuedUploads(): Promise<number> {
  if (flushing || typeof navigator !== 'undefined' && !navigator.onLine) return 0;
  flushing = true;
  let sent = 0;
  try {
    const db = await openDb();
    try {
      const records = await tx<QueuedUpload[]>(db, 'readonly', (s) => s.getAll());
      for (const r of records.sort((a, b) => a.createdAt - b.createdAt)) {
        try {
          const initRes = await apiFetch<{
            nodeId: string;
            versionId: string;
            presignedUrls: { index: number; uploadUrl: string }[];
          }>('/api/v1/uploads/init', {
            method: 'POST',
            body: JSON.stringify({
              vaultId: r.vaultId,
              parentId: r.parentId,
              nameEncrypted: r.nameEncrypted,
              nameNonce: r.nameNonce,
              metadataEncrypted: r.metadataEncrypted,
              metadataNonce: r.metadataNonce,
              fileKeyWrapped: r.fileKeyWrapped,
              fileKeyNonce: r.fileKeyNonce,
              chunks: r.chunks.map((c) => ({
                index: c.index, ciphertextSize: c.ciphertextSize, nonce: c.nonce,
              })),
              totalSize: r.totalSize,
            }),
          });

          for (const c of r.chunks) {
            const url = initRes.presignedUrls.find((p) => p.index === c.index)!.uploadUrl;
            // Mismo enrutado que el upload normal: disco vía API o presigned B2.
            if (url.includes('/api/v1/uploads/chunk/')) {
              await apiFetch(new URL(url).pathname, {
                method: 'PUT',
                headers: { 'content-type': 'application/octet-stream' },
                body: c.data,
              });
            } else {
              await uploadToPresignedUrl(url, c.data);
            }
          }

          await apiFetch(`/api/v1/uploads/${initRes.versionId}/complete`, {
            method: 'POST',
            body: JSON.stringify({ contentHash: r.contentHash, chunkAuthTags: r.chunkAuthTags }),
          });

          await tx(db, 'readwrite', (s) => s.delete(r.id));
          sent++;
        } catch (err) {
          if (err instanceof ApiError) {
            // El servidor lo rechazó (cuota, validación…): descartar y avisar.
            await tx(db, 'readwrite', (s) => s.delete(r.id));
            toast.error(rt('toasts.offlineUploadRejected', { error: err.message }));
          } else {
            // Red caída a mitad: parar; el resto se reintenta en el próximo online.
            break;
          }
        }
      }
    } finally {
      db.close();
    }
  } catch {
    // IDB no disponible: nada que vaciar.
  } finally {
    flushing = false;
  }
  return sent;
}
