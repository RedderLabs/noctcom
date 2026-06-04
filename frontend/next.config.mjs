import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

const isDev = process.env.NODE_ENV !== 'production';

// La versión sale del package.json y la fecha se sella aquí, en el build.
// Como cada deploy reconstruye la imagen, esta marca es la hora del último deploy.
const { version } = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf8'));
const builtAt = new Intl.DateTimeFormat('es-ES', {
  day: 'numeric', month: 'short', year: 'numeric',
  hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid',
}).format(new Date());

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  // En Next 15.5 typedRoutes dejó de ser experimental y subió a nivel raíz.
  typedRoutes: true,
  env: {
    NEXT_PUBLIC_APP_VERSION: version,
    NEXT_PUBLIC_BUILT_AT: builtAt,
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              isDev
                ? "script-src 'self' 'unsafe-eval' 'unsafe-inline' 'wasm-unsafe-eval' https://www.gstatic.com https://www.googletagmanager.com"
                : "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://www.gstatic.com https://static.cloudflareinsights.com https://challenges.cloudflare.com https://www.googletagmanager.com https://www.google-analytics.com",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https://www.googletagmanager.com https://www.google-analytics.com",
              "media-src 'self' blob:",
              "frame-src blob:",
              "object-src blob:",
              `connect-src 'self' ${isDev ? 'http://localhost:3000 ws://localhost:3000 ws://localhost:3001' : 'https://api.noctcom.com wss://api.noctcom.com'} https://*.backblazeb2.com https://*.googleapis.com https://*.firebaseio.com https://fcmregistrations.googleapis.com https://app.glitchtip.com https://cloudflareinsights.com https://www.googletagmanager.com https://www.google-analytics.com https://analytics.google.com`,
              "frame-ancestors 'none'",
              "form-action 'self'",
              "base-uri 'self'",
            ].join('; '),
          },
        ],
      },
    ];
  },
  serverExternalPackages: ['libsodium-wrappers-sumo'],
  webpack: (config, { isServer }) => {
    config.experiments = { ...config.experiments, asyncWebAssembly: true, topLevelAwait: true };
    config.output = {
      ...config.output,
      environment: { ...config.output?.environment, asyncFunction: true, dynamicImport: true },
    };
    config.resolve.alias = {
      ...config.resolve.alias,
      'libsodium-sumo': resolve(__dirname, 'node_modules/libsodium-sumo/dist/modules-sumo-esm/libsodium-sumo.mjs'),
    };
    if (!isServer) {
      config.resolve.fallback = { ...config.resolve.fallback, fs: false, path: false };
    }
    return config;
  },
};

// Envuelve el config con Sentry/GlitchTip. No subimos sourcemaps (no requiere
// auth token de GlitchTip): solo queremos capturar errores, no des-minificar
// stack traces. silent evita ruido en el build.
import { withSentryConfig } from '@sentry/nextjs';

export default withSentryConfig(nextConfig, {
  silent: true,
  sourcemaps: { disable: true },
});
