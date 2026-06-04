// Next 15 carga este archivo al arrancar cada runtime de servidor. Reexporta la
// init de Sentry según el runtime (Node SSR o Edge) y el hook de captura de
// errores de request. GlitchTip vía SDK de Sentry.
import * as Sentry from '@sentry/nextjs';

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }
  // (No usamos runtime edge; si se añadiera, su config iría aquí.)
}

export const onRequestError = Sentry.captureRequestError;
