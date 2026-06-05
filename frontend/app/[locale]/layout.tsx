import '../globals.css';
import { NextIntlClientProvider, hasLocale } from 'next-intl';
import { getMessages, getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { routing } from '@/i18n/routing';
import { CookieBanner } from '@/components/ui/CookieBanner';
import { ThemedToaster } from '@/components/ui/ThemedToaster';
import type { Metadata } from 'next';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'meta' });
  return {
    ...baseMetadata,
    description: t('description'),
    openGraph: {
      ...baseMetadata.openGraph,
      locale: locale === 'en' ? 'en_US' : 'es_ES',
    },
  };
}

const baseMetadata: Metadata = {
  // www: es el host canónico real (el apex hace 301 a www). Los bots de
  // WhatsApp/Telegram/X no siguen redirects para og:image — la URL de la
  // imagen debe responder 200 a la primera.
  metadataBase: new URL('https://www.noctcom.com'),
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

// Pre-renderiza ambos idiomas en build.
export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

// Anti-FOUC: fija la clase de tema en <html> ANTES del primer pintado, leyendo
// la preferencia guardada o, si no hay, la del sistema. Así no hay parpadeo
// claro→oscuro al cargar. Se mantiene minificado y a prueba de fallos (try/catch).
const themeScript = `(function(){try{var t=localStorage.getItem('noctcom.theme');if(t!=='light'&&t!=='dark'){t=window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';}var e=document.documentElement;e.classList.add(t);e.style.colorScheme=t;}catch(e){}})();`;

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();

  // Habilita el render estático para este locale y carga sus mensajes.
  setRequestLocale(locale);
  const messages = await getMessages();

  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        <meta name="google-site-verification" content="zI45FHf6c5bM5siv6QHQEEPvYqjwfZ4tan65XOzaq4E" />
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="grain">
        <NextIntlClientProvider messages={messages}>
          {children}
          <CookieBanner />
          <ThemedToaster />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
