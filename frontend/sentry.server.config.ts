// Error tracking del runtime de servidor de Next (SSR/route handlers).
// GlitchTip vía SDK de Sentry. Solo activo en producción.
import * as Sentry from '@sentry/nextjs';

// OPT-IN: sin DSN explícito no se inicializa (self-host no reporta telemetría).
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn && process.env.NODE_ENV === 'production') {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV,
    release: process.env.NEXT_PUBLIC_APP_VERSION || undefined,
    tracesSampleRate: 0.01,
    sendDefaultPii: false,
  });
}
