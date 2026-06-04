import './globals.css';
import { Toaster } from 'sonner';
import { CookieBanner } from '@/components/ui/CookieBanner';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  metadataBase: new URL('https://noctcom.com'),
  title: {
    default: 'Noctcom — Zero-Knowledge Storage',
    template: '%s | Noctcom',
  },
  description: 'Tu bóveda privada. Cifrada en tu dispositivo. Nadie más puede abrirla. Open source y self-hosteable, hecho por Redder Labs.',
  keywords: [
    'zero-knowledge storage',
    'almacenamiento cifrado',
    'cifrado end-to-end',
    'E2E encryption',
    'cloud storage privado',
    'almacenamiento zero-knowledge',
    'Argon2id',
    'XChaCha20-Poly1305',
    'open source cloud storage',
    'self-hosted storage',
    'almacenamiento self-hosted',
    'bóveda cifrada',
    'encrypted vault',
    'privacidad digital',
    'alternativa Drive',
    'almacenamiento privado para periodistas',
    'privacidad para investigación',
    'Redder Labs',
    'AGPL-3.0',
  ],
  authors: [
    { name: 'Julián Rodríguez', url: 'https://noctcom.com/about' },
    { name: 'Redder Labs', url: 'https://github.com/RedderLabs' },
  ],
  creator: 'Redder Labs',
  publisher: 'Redder Labs',
  category: 'technology',
  icons: { icon: '/logo.png', apple: '/logo.png' },
  openGraph: {
    siteName: 'Noctcom',
    locale: 'es_ES',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    site: '@noctcom',
    creator: '@noctcom',
  },
  robots: {
    index: true,
    follow: true,
  },
  other: {
    'referrer': 'no-referrer',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <meta name="google-site-verification" content="zI45FHf6c5bM5siv6QHQEEPvYqjwfZ4tan65XOzaq4E" />
      </head>
      <body className="grain">
        {children}
        <CookieBanner />
        <Toaster
          theme="dark"
          position="bottom-right"
          toastOptions={{
            style: {
              background: 'var(--color-bg-surface-2)',
              border: '1px solid var(--color-border-subtle)',
              color: 'var(--color-text-primary)',
            },
          }}
        />
      </body>
    </html>
  );
}
