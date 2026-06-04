// Error tracking del navegador (GlitchTip vía SDK de Sentry). Next 15 carga
// este archivo automáticamente en el cliente. Solo activo en producción.
import * as Sentry from '@sentry/nextjs';

const DEFAULT_DSN = 'https://3d687198b7a142b289b32839792a2e92@app.glitchtip.com/24348';
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN ?? DEFAULT_DSN;

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
