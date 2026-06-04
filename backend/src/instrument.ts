// Inicialización de error tracking (GlitchTip vía SDK de Sentry).
//
// Se importa LO PRIMERO en server.ts para que la instrumentación parchee http/pg
// antes de que se carguen. Si no hay DSN configurado (dev, o prod sin la env),
// Sentry.init no hace nada: queda inactivo sin romper el arranque.
//
// GlitchTip es compatible con el protocolo de Sentry, así que el DSN es el de tu
// instancia GlitchTip. Variable: SENTRY_DSN (o GLITCHTIP_DSN como alias).
import * as Sentry from '@sentry/node';

// DSN del proyecto noctcom-api en GlitchTip. Es público por naturaleza (solo
// permite ENVIAR eventos, no leerlos), así que puede ir en el repo; aun así
// SENTRY_DSN en el entorno lo sobrescribe (p.ej. para apuntar a otra instancia
// o desactivarlo poniéndolo a vacío).
const DEFAULT_DSN = 'https://7a49671484a245eaa01c10b061601511@app.glitchtip.com/24347';
const dsn = process.env.SENTRY_DSN ?? process.env.GLITCHTIP_DSN ?? DEFAULT_DSN;

// En dev no queremos mandar el ruido de desarrollo a GlitchTip: solo se activa
// en producción (o si fuerzas SENTRY_DSN a mano).
const enabled = !!dsn && (process.env.NODE_ENV === 'production' || !!process.env.SENTRY_DSN);

if (enabled) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? 'development',
    release: process.env.APP_VERSION || undefined,
    tracesSampleRate: 0.01, // 1% — GlitchTip prioriza issues, no transacciones
    sendDefaultPii: false, // zero-knowledge también en la telemetría
  });
  // eslint-disable-next-line no-console
  console.log('✓ error tracking (GlitchTip) inicializado');
}

export { Sentry };
