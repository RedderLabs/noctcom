import { defineRouting } from 'next-intl/routing';

// Idiomas soportados. El español es el predeterminado y, con localePrefix
// 'as-needed', conserva las URLs actuales SIN prefijo (/, /precios…); el inglés
// vive bajo /en (/en, /en/precios…). Así no rompemos enlaces ni SEO existentes
// y añadimos el inglés encima.
export const routing = defineRouting({
  locales: ['es', 'en'],
  defaultLocale: 'es',
  localePrefix: 'as-needed',
});

export type Locale = (typeof routing.locales)[number];
