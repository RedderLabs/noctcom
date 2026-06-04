import type { Metadata } from 'next';
import PricingPage from './PricingPage';

const BASE_URL = 'https://noctcom.com';

export const metadata: Metadata = {
  title: 'Precios · Noctcom',
  description:
    'Almacenamiento cifrado zero-knowledge. 1 GB gratis; planes desde 1€/mes. Pagas por espacio, nunca por tus datos. El self-host es siempre gratis (AGPL-3.0).',
  alternates: { canonical: `${BASE_URL}/precios` },
  openGraph: {
    title: 'Precios · Noctcom',
    description: 'Pagas por espacio, nunca por tus datos. 1 GB gratis; self-host siempre gratis.',
    url: `${BASE_URL}/precios`,
    siteName: 'Noctcom',
    locale: 'es_ES',
    type: 'website',
  },
};

export default function Page() {
  return <PricingPage />;
}
