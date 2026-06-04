import type { Metadata } from 'next';
import SecurityPage from './SecurityPage';

const BASE_URL = 'https://noctcom.com';

export const metadata: Metadata = {
  title: 'Seguridad y criptografía — Argon2id, XChaCha20, Ed25519 | Noctcom',
  description:
    'Especificación criptográfica y modelo de amenazas de Noctcom. Argon2id para KDF, XChaCha20-Poly1305 para AEAD, Ed25519 para firmas. Código 100% auditable.',
  alternates: { canonical: `${BASE_URL}/security` },
  openGraph: {
    title: 'Seguridad y criptografía | Noctcom',
    description:
      'Argon2id + XChaCha20-Poly1305 + Ed25519. Especificación criptográfica completa y modelo de amenazas. Código abierto y auditable.',
    url: `${BASE_URL}/security`,
    siteName: 'Noctcom',
    locale: 'es_ES',
    type: 'article',
  },
  twitter: {
    card: 'summary_large_image',
    site: '@noctcom',
    title: 'Seguridad y criptografía | Noctcom',
    description:
      'Argon2id + XChaCha20-Poly1305 + Ed25519. Especificación criptográfica completa y modelo de amenazas.',
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
            '@type': 'TechArticle',
            headline: 'Seguridad y criptografía de Noctcom',
            description:
              'Especificación criptográfica y modelo de amenazas. Argon2id para derivación de claves, XChaCha20-Poly1305 para cifrado, Ed25519 para firmas digitales.',
            url: `${BASE_URL}/security`,
            publisher: {
              '@type': 'Organization',
              name: 'Noctcom',
              url: BASE_URL,
            },
            proficiencyLevel: 'Advanced',
            inLanguage: 'es',
          }),
        }}
      />
      <SecurityPage />
    </>
  );
}
