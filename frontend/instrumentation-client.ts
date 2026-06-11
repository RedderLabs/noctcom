// Error tracking del navegador (GlitchTip vía SDK de Sentry). Next 15 carga
// este archivo automáticamente en el cliente. Solo activo en producción.
import * as Sentry from '@sentry/nextjs';

// OPT-IN: sin DSN explícito no se inicializa. Una instancia self-host NO reporta
// telemetría a nadie (zero-knowledge también aquí). El DSN se hornea en build
// vía build-arg (ver frontend/Dockerfile y docker-compose.yml).
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn && process.env.NODE_ENV === 'production') {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV,
    release: process.env.NEXT_PUBLIC_APP_VERSION || undefined,
    tracesSampleRate: 0.01, // 1% — GlitchTip prioriza issues, no transacciones
    sendDefaultPii: false, // zero-knowledge también en la telemetría
  });
}

// Necesario para capturar errores de navegación (App Router).
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
