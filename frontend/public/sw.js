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
// Caché efímera del share_target: el plaintext compartido por otra app vive
// aquí SOLO entre el POST del sistema y la redirección a /vault/share, que lo
// lee, lo cifra y borra estas entradas. Local al origen; nunca toca la red.
const SHARE_CACHE = 'noctcom-share';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key !== CACHE && key !== SHARE_CACHE) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

// Share target (Android): el sistema hace POST multipart al action del manifest.
// Lo interceptamos AQUÍ — antes de la red y del middleware de next-intl — para
// que el plaintext no salga del dispositivo. Guardamos los archivos en una caché
// efímera y redirigimos (303 → GET) a la página cliente que cifra y sube.
async function handleShare(request) {
  try {
    const form = await request.formData();
    const files = form.getAll('files').filter((f) => f && typeof f.arrayBuffer === 'function');
    const cache = await caches.open(SHARE_CACHE);
    // Limpiar restos de un share anterior que no se llegara a procesar.
    for (const key of await cache.keys()) await cache.delete(key);
    let i = 0;
    for (const file of files) {
      const headers = new Headers();
      headers.set('content-type', file.type || 'application/octet-stream');
      headers.set('x-share-name', encodeURIComponent(file.name || `archivo-${i}`));
      await cache.put(new Request(`/__noctcom_share__/${i}`), new Response(file, { headers }));
      i++;
    }
  } catch (_) { /* sin archivos válidos: la página avisará */ }
  // Absoluta: Response.redirect exige URL completa. shared=1 marca el origen.
  return Response.redirect(new URL('/vault/share?shared=1', self.location.origin).href, 303);
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const reqUrl = new URL(req.url);
  if (req.method === 'POST' && reqUrl.origin === self.location.origin &&
      reqUrl.pathname.endsWith('/vault/share')) {
    event.respondWith(handleShare(req));
    return;
  }
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
