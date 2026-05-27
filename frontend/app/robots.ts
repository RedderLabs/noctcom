import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/vault/', '/verify'],
      },
    ],
    sitemap: 'https://noctcom.com/sitemap.xml',
  };
}
