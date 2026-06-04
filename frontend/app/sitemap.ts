import type { MetadataRoute } from 'next';

const BASE_URL = 'https://noctcom.com';

// Páginas públicas indexables. El español va sin prefijo (localePrefix
// 'as-needed') y el inglés bajo /en. Cada entrada declara sus alternativas de
// idioma (hreflang) para que Google relacione ambas versiones.
const PAGES: { path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency'] }[] = [
  { path: '', priority: 1, changeFrequency: 'weekly' },
  { path: '/precios', priority: 0.8, changeFrequency: 'monthly' },
  { path: '/security', priority: 0.8, changeFrequency: 'monthly' },
  { path: '/about', priority: 0.5, changeFrequency: 'monthly' },
  { path: '/roadmap', priority: 0.5, changeFrequency: 'monthly' },
  { path: '/signup', priority: 0.5, changeFrequency: 'yearly' },
  { path: '/login', priority: 0.3, changeFrequency: 'yearly' },
  { path: '/terminos', priority: 0.3, changeFrequency: 'yearly' },
  { path: '/privacidad', priority: 0.3, changeFrequency: 'yearly' },
  { path: '/cookies', priority: 0.3, changeFrequency: 'yearly' },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  const entries: MetadataRoute.Sitemap = [];

  for (const { path, priority, changeFrequency } of PAGES) {
    const esUrl = `${BASE_URL}${path}`;
    const enUrl = `${BASE_URL}/en${path}`;
    const languages = { es: esUrl, en: enUrl, 'x-default': esUrl };

    entries.push({ url: esUrl, lastModified, changeFrequency, priority, alternates: { languages } });
    entries.push({ url: enUrl, lastModified, changeFrequency, priority, alternates: { languages } });
  }

  return entries;
}
