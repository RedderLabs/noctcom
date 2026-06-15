import type { Metadata } from 'next';
import { redirect } from '@/i18n/navigation';
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

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  // En self-host no se cobra (AGPL, gratis): no hay página de precios. El flag se
  // inlinea en build, así que en la nube esta rama desaparece y se sirve /precios.
  if (process.env.NEXT_PUBLIC_SELF_HOST === 'true') {
    const { locale } = await params;
    redirect({ href: '/login', locale });
  }
  return <PricingPage />;
}
