import type { Metadata } from 'next';
import RoadmapPage from './RoadmapPage';

const BASE_URL = 'https://noctcom.com';

export const metadata: Metadata = {
  title: 'Hoja de ruta — qué funciona y qué viene | Noctcom',
  description:
    'El estado real de Noctcom: cifrado, cuentas, archivos, compartir y multi-dispositivo ya funcionan. Recuperación, WebAuthn, vista previa y auditoría externa, en camino. Todo en abierto.',
  alternates: { canonical: `${BASE_URL}/roadmap` },
  openGraph: {
    title: 'Hoja de ruta | Noctcom',
    description:
      'Lo que ya funciona, lo que estamos rematando y lo que viene. Desarrollo en abierto bajo AGPL-3.0.',
    url: `${BASE_URL}/roadmap`,
    siteName: 'Noctcom',
    locale: 'es_ES',
    type: 'article',
  },
  twitter: {
    card: 'summary_large_image',
    site: '@noctcom',
    title: 'Hoja de ruta | Noctcom',
    description: 'Lo que ya funciona y lo que viene. Desarrollo en abierto.',
  },
};

export default function Page() {
  return <RoadmapPage />;
}
