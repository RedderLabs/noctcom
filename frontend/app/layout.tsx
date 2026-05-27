import './globals.css';
import { Toaster } from 'sonner';
import { CookieBanner } from '@/components/ui/CookieBanner';
import { GoogleTagManagerHead, GoogleTagManagerBody } from '@/components/GoogleTagManager';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  metadataBase: new URL('https://noctcom.com'),
  title: {
    default: 'Noctcom — Zero-Knowledge Storage',
    template: '%s | Noctcom',
  },
  description: 'Tu bóveda privada. Cifrada en tu dispositivo. Nadie más puede abrirla.',
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
    'alternativa Proton Drive',
    'AGPL-3.0',
  ],
  authors: [{ name: 'Noctcom', url: 'https://noctcom.com' }],
  creator: 'Noctcom',
  publisher: 'Noctcom',
  icons: { icon: '/favicon.svg' },
  openGraph: {
    siteName: 'Noctcom',
    locale: 'es_ES',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    site: '@noctcom',
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
        <GoogleTagManagerHead />
        <meta name="google-site-verification" content="zI45FHf6c5bM5siv6QHQEEPvYqjwfZ4tan65XOzaq4E" />
      </head>
      <body className="grain">
        <GoogleTagManagerBody />
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
