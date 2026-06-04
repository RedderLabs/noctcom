import { ImageResponse } from 'next/og';
import { routing } from '@/i18n/routing';

// Imagen Open Graph (la que se ve al compartir la URL en redes/chats). Next la
// genera en build (1200×630 PNG) y la inyecta sola en la metadata de todas las
// páginas bajo [locale], así que vale para og:image y para la tarjeta de Twitter/X.
export const alt = 'Noctcom — almacenamiento cifrado zero-knowledge';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

// Prerenderiza la imagen para ambos idiomas.
export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

const COPY = {
  es: {
    tagline: 'Tu bóveda privada. Cifrada antes de salir de tu dispositivo.',
    sub: 'Zero-Knowledge real · Open Source · AGPL-3.0',
  },
  en: {
    tagline: 'Your private vault. Encrypted before it leaves your device.',
    sub: 'Real zero-knowledge · Open source · AGPL-3.0',
  },
} as const;

export default async function OpengraphImage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const c = COPY[locale === 'en' ? 'en' : 'es'];

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #0a0a0f 0%, #14111f 58%, #1c1533 100%)',
          padding: '96px',
          color: '#f0f0f6',
          fontFamily: 'sans-serif',
        }}
      >
        {/* barra de acento superior */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: '10px',
            background: 'linear-gradient(90deg, #8b5cf6 0%, #7c3aed 100%)',
            display: 'flex',
          }}
        />
        {/* marca */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '30px' }}>
          <div
            style={{
              width: '108px',
              height: '108px',
              borderRadius: '28px',
              background: 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '66px',
              fontWeight: 700,
              color: '#ffffff',
            }}
          >
            N
          </div>
          <div style={{ fontSize: '80px', fontWeight: 700, letterSpacing: '-2px' }}>Noctcom</div>
        </div>
        {/* tagline */}
        <div
          style={{
            fontSize: '42px',
            color: '#c4b5fd',
            marginTop: '46px',
            maxWidth: '1000px',
            lineHeight: 1.25,
            display: 'flex',
          }}
        >
          {c.tagline}
        </div>
        {/* pie */}
        <div style={{ fontSize: '27px', color: '#8e8ea8', marginTop: '40px', display: 'flex' }}>
          noctcom.com   ·   {c.sub}
        </div>
      </div>
    ),
    { ...size },
  );
}
