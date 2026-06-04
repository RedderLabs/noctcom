// Error tracking del runtime de servidor de Next (SSR/route handlers).
// GlitchTip vía SDK de Sentry. Solo activo en producción.
import * as Sentry from '@sentry/nextjs';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN
  ?? 'https://3d687198b7a142b289b32839792a2e92@app.glitchtip.com/24348';

if (dsn && process.env.NODE_ENV === 'production') {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV,
    release: process.env.NEXT_PUBLIC_APP_VERSION || undefined,
    tracesSampleRate: 0.01,
    sendDefaultPii: false,
  });
}
