import type { Metadata } from 'next';
import SelfHostPage from './SelfHostPage';

const BASE_URL = 'https://noctcom.com';

export const metadata: Metadata = {
  title: 'Instalar Noctcom — Docker, Proxmox VE y self-host | Noctcom',
  description:
    'Guía de instalación de Noctcom en tu propio servidor: Docker en cualquier Linux o en localhost, contenedor LXC en Proxmox VE, o a mano. Self-host gratis (AGPL-3.0), mismo cifrado zero-knowledge.',
  alternates: { canonical: `${BASE_URL}/self-host` },
  openGraph: {
    title: 'Instalar Noctcom (self-host)',
    description: 'Docker en cualquier servidor o localhost, Proxmox VE o a mano. Self-host gratis y zero-knowledge.',
    url: `${BASE_URL}/self-host`,
    siteName: 'Noctcom',
    locale: 'es_ES',
    type: 'article',
  },
  twitter: {
    card: 'summary_large_image',
    site: '@noctcom',
    title: 'Instalar Noctcom (self-host)',
    description: 'Docker, Proxmox VE o a mano. Self-host gratis.',
  },
};

export default function Page() {
  return <SelfHostPage />;
}
