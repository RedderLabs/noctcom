'use client';

// Captura en GlitchTip los errores de renderizado de React del App Router.
// Next 15 usa este archivo como límite de error global.
import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="es">
      <body style={{ background: '#0f0f17', color: '#f0f0f6', fontFamily: 'system-ui, sans-serif' }}>
        <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24, textAlign: 'center' }}>
          <div>
            <h1 style={{ fontWeight: 300, fontSize: 28, marginBottom: 8 }}>Algo ha fallado</h1>
            <p style={{ color: '#a8a3c0', fontSize: 14, marginBottom: 20 }}>
              Hemos registrado el error. Prueba a recargar la página.
            </p>
            <button
              onClick={() => location.reload()}
              style={{ background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 20px', fontSize: 14, cursor: 'pointer' }}
            >
              Recargar
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
