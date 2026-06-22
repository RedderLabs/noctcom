import type { MetadataRoute } from 'next';

// Web App Manifest (Fase 11 · PWA). Next lo sirve en /manifest.webmanifest.
// start_url apunta al vault: quien instala la app ya tiene cuenta; si no hay
// sesión, el guard de la app redirige a login. El manifest es único (no hay
// uno por idioma): textos en español, el idioma base de la marca.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Noctcom — Zero-Knowledge Storage',
    short_name: 'Noctcom',
    description:
      'Tu bóveda privada. Cifrada en tu dispositivo. Nadie más puede abrirla.',
    start_url: '/vault',
    scope: '/',
    display: 'standalone',
    // background_color: el splash pinta este color detrás del icono — debe
    // coincidir con el fondo de los iconos generados desde logo.png.
    background_color: '#0a0b0d',
    theme_color: '#0f0f17',
    lang: 'es',
    categories: ['productivity', 'security', 'utilities'],
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      // maskable: sangre completa + glifo en zona segura (Android los recorta).
      { src: '/icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    // Accesos rápidos (Android: pulsación larga del icono; desktop: menú del
    // icono). Nombres en español, idioma base del manifest único (ver arriba).
    shortcuts: [
      {
        name: 'Subir archivo',
        short_name: 'Subir',
        description: 'Sube un archivo cifrado a tu bóveda',
        url: '/vault?upload=1',
      },
      {
        name: 'Recientes',
        short_name: 'Recientes',
        description: 'Archivos abiertos recientemente',
        url: '/vault/recent',
      },
      {
        name: 'Favoritos',
        short_name: 'Favoritos',
        description: 'Tus archivos destacados',
        url: '/vault/starred',
      },
    ],
    // Share target (Android): Noctcom aparece en el menú "Compartir" del sistema.
    // El POST multipart lo INTERCEPTA el service worker (public/sw.js) antes de
    // tocar la red: guarda el archivo en Cache Storage local y redirige a
    // /vault/share, que lo cifra en el dispositivo. El plaintext compartido NUNCA
    // sale del dispositivo ni llega al servidor — se mantiene el zero-knowledge.
    share_target: {
      action: '/vault/share',
      method: 'POST',
      enctype: 'multipart/form-data',
      params: {
        title: 'title',
        text: 'text',
        url: 'url',
        files: [{ name: 'files', accept: ['*/*'] }],
      },
    },
  };
}
