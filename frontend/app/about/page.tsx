import type { Metadata } from 'next';
import AboutPage from './AboutPage';

const BASE_URL = 'https://noctcom.com';

export const metadata: Metadata = {
  title: 'Sobre Noctcom — Redder Labs',
  description:
    'Quién está detrás de Noctcom: Julián Rodríguez (Redder Labs), desarrollador autodidacta que construye herramientas donde tus datos no son el producto. Privacidad por diseño, en solitario y sin inversores.',
  alternates: { canonical: `${BASE_URL}/about` },
  openGraph: {
    title: 'Sobre Noctcom — Redder Labs',
    description:
      'Quién está detrás de Noctcom: Redder Labs, herramientas privadas donde el procesamiento ocurre en tu dispositivo y tus datos no son el producto.',
    url: `${BASE_URL}/about`,
    siteName: 'Noctcom',
    locale: 'es_ES',
    type: 'profile',
  },
};

export default function Page() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'AboutPage',
            name: 'Sobre Noctcom',
            url: `${BASE_URL}/about`,
            mainEntity: {
              '@type': 'Person',
              name: 'Julián Rodríguez',
              jobTitle: 'Fundador y desarrollador',
              worksFor: { '@type': 'Organization', name: 'Redder Labs' },
              url: BASE_URL,
              sameAs: ['https://github.com/RedderLabs', 'https://x.com/noctcom', 'https://xero-trace.com'],
            },
          }),
        }}
      />
      <AboutPage />
    </>
  );
}
