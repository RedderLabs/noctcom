/* eslint-disable no-undef */
/* Service worker de Noctcom (Fase 11 · PWA). Un solo SW para todo el scope:
   1) Push FCM — reutiliza la lógica existente vía importScripts (un scope
      solo admite un SW; registrar dos scripts se pisarían entre sí).
   2) App-shell — cachea SOLO estáticos inmutables (_next/static, iconos,
      manifest). NUNCA páginas, API ni blobs: el contenido zero-knowledge
      no toca la caché del SW bajo ningún concepto. */

// Si gstatic no responde durante la evaluación (p. ej. primer install sin
// red), no rompemos el SW: el push se recupera en la próxima actualización.
try {
  importScripts('/firebase-messaging-sw.js');
} catch (_) { /* sin push hasta la próxima carga con red */ }

const CACHE = 'noctcom-shell-v1';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key !== CACHE) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // terceros: nunca

  // Solo el shell: chunks con hash de Next (inmutables) e iconos/manifest.
  const isShell =
    url.pathname.startsWith('/_next/static/') ||
    /^\/(icon-[\w-]+\.png|apple-touch-icon\.png|favicon\.svg|logo\.(png|svg)|manifest\.webmanifest)$/.test(url.pathname);
  if (!isShell) return; // páginas y API: siempre red (nada ZK en caché)

  event.respondWith((async () => {
    const cached = await caches.match(req);
    if (cached) return cached;
    const res = await fetch(req);
    if (res.ok) {
      const cache = await caches.open(CACHE);
      cache.put(req, res.clone());
    }
    return res;
  })());
});
