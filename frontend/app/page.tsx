import type { Metadata } from 'next';
import LandingPage from './LandingPage';

const BASE_URL = 'https://noctcom.com';

export const metadata: Metadata = {
  title: 'Noctcom — Almacenamiento Zero-Knowledge cifrado E2E',
  description:
    'Tu bóveda privada. Cifrada en tu dispositivo con Argon2id + XChaCha20-Poly1305. Ni siquiera nosotros podemos leer tus archivos. Open source, self-hosteable.',
  alternates: { canonical: BASE_URL },
  openGraph: {
    title: 'Noctcom — Almacenamiento Zero-Knowledge cifrado E2E',
    description:
      'Almacenamiento privado donde nadie más puede leer tus archivos. Cifrado end-to-end, open source y self-hosteable.',
    url: BASE_URL,
    siteName: 'Noctcom',
    locale: 'es_ES',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    site: '@noctcom',
    title: 'Noctcom — Almacenamiento Zero-Knowledge cifrado E2E',
    description:
      'Almacenamiento privado donde nadie más puede leer tus archivos. Cifrado end-to-end, open source y self-hosteable.',
  },
};

export default function Page() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify([
            {
              '@context': 'https://schema.org',
              '@type': 'Organization',
              name: 'Noctcom',
              url: BASE_URL,
              logo: `${BASE_URL}/logo.svg`,
              sameAs: ['https://x.com/noctcom', 'https://github.com/RedderLabs/noctcom'],
            },
            {
              '@context': 'https://schema.org',
              '@type': 'SoftwareApplication',
              name: 'Noctcom',
              applicationCategory: 'SecurityApplication',
              operatingSystem: 'Web, Docker',
              url: BASE_URL,
              offers: {
                '@type': 'Offer',
                price: '0',
                priceCurrency: 'EUR',
                description: '1 GB gratis con cifrado zero-knowledge',
              },
              description:
                'Almacenamiento zero-knowledge cifrado end-to-end con Argon2id + XChaCha20-Poly1305. Open source bajo AGPL-3.0.',
              license: 'https://www.gnu.org/licenses/agpl-3.0.html',
            },
          ]),
        }}
      />
      <LandingPage />
    </>
  );
}
