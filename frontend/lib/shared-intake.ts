'use client';

// Share target (Android) — recogida del archivo compartido.
//
// El service worker (public/sw.js) guarda el archivo que llega del menú
// "Compartir" del sistema en una caché efímera (SHARE_CACHE) y redirige a
// /vault/share. Aquí lo leemos, reconstruimos File[] y lo pasamos al flujo de
// subida normal del store (uploadFiles), que lo cifra en el dispositivo.
//
// Zero-knowledge: el plaintext compartido solo vive en Cache Storage local
// entre el POST del sistema y esta lectura; lo borramos en cuanto lo leemos,
// antes incluso de cifrar. Nunca toca el servidor.

import { useVault } from './vault-store';

const SHARE_CACHE = 'noctcom-share';

// Evita dos flushes solapados (la página /vault/share y el layout pueden
// dispararlo a la vez según por dónde entre el usuario).
let flushing = false;

/**
 * Vacía la caché del share target subiendo lo que haya a la bóveda actual.
 * Devuelve cuántos archivos se enviaron. No-op (0) si:
 *  - Cache Storage no está disponible,
 *  - la bóveda aún no está abierta (sin sesión activa todavía: se reintenta
 *    cuando el layout vuelva a llamar tras desbloquear),
 *  - no hay nada compartido pendiente.
 */
export async function flushSharedUploads(): Promise<number> {
  if (flushing || typeof caches === 'undefined') return 0;

  const vault = useVault.getState();
  // Sin bóveda lista no podemos cifrar: dejamos el archivo en caché para el
  // próximo intento (p. ej. tras login). NO borramos nada en este caso.
  if (!vault.currentVaultId) return 0;

  flushing = true;
  try {
    const cache = await caches.open(SHARE_CACHE);
    const keys = await cache.keys();
    if (keys.length === 0) return 0;

    const files: File[] = [];
    for (const key of keys) {
      const res = await cache.match(key);
      if (!res) continue;
      const name = decodeURIComponent(res.headers.get('x-share-name') || 'archivo');
      const type = res.headers.get('content-type') || 'application/octet-stream';
      const blob = await res.blob();
      files.push(new File([blob], name, { type }));
    }

    // Borrar YA: el plaintext compartido no debe persistir en disco más de lo
    // imprescindible. Los File quedan en memoria para uploadFiles.
    for (const key of keys) await cache.delete(key);

    if (files.length > 0) await vault.uploadFiles(files);
    return files.length;
  } catch {
    return 0;
  } finally {
    flushing = false;
  }
}
