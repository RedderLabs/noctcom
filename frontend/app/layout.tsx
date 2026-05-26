import './globals.css';
import { Toaster } from 'sonner';
import { CookieBanner } from '@/components/ui/CookieBanner';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Noctcom — Zero-Knowledge Storage',
  description: 'Tu bóveda privada. Cifrada en tu dispositivo. Nadie más puede abrirla.',
  icons: { icon: '/favicon.svg' },
  other: {
    'referrer': 'no-referrer',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning>
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
