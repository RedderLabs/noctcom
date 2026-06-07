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
  };
}
