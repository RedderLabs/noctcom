import type { Metadata } from 'next';
import { redirect } from '@/i18n/navigation';
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

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  // En self-host no hay landing de marketing: el operador ya instaló. '/' va
  // directo al login (que es también el desbloqueo de la bóveda). El flag se
  // inlinea en build, así que en la nube esta rama desaparece y se sirve la landing.
  if (process.env.NEXT_PUBLIC_SELF_HOST === 'true') {
    const { locale } = await params;
    redirect({ href: '/login', locale });
  }
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
              logo: `${BASE_URL}/logo.png`,
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
