import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),

  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url().optional().or(z.literal('')),

  S3_ENDPOINT: z.string().url(),
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(1),
  S3_BUCKET: z.string().min(1),
  S3_REGION: z.string().default('us-east-1'),

  JWT_SECRET: z.string().min(32),
  PUBLIC_URL: z.string().url(),
  FRONTEND_URL: z.string().url().optional(),

  RESEND_API_KEY: z.string().min(1).optional().or(z.literal('')),
  SMTP_HOST: z.string().min(1).optional().or(z.literal('')),
  SMTP_PORT: z.coerce.number().default(2525),
  SMTP_USER: z.string().min(1).optional().or(z.literal('')),
  SMTP_PASS: z.string().min(1).optional().or(z.literal('')),
  SMTP_FROM: z.string().default('noreply@noctcom.com'),

  MAX_UPLOAD_BYTES: z.coerce.number().default(5 * 1024 * 1024 * 1024),
  USER_QUOTA_BYTES: z.coerce.number().default(1 * 1024 * 1024 * 1024),

  // Última versión publicada del agente "Noctcom Connector". Se incrementa al
  // subir un binario nuevo a B2 (scripts/upload-agent-release.ts) para que los
  // agentes ya instalados detecten que hay actualización.
  AGENT_LATEST_VERSION: z.string().default('0.1.0'),

  // Push (FCM): el service account de Firebase como JSON en base64 — la vía
  // para prod (Render no tiene el archivo). En dev se usa el archivo
  // backend/firebase-service-account.json (gitignored) y esto queda vacío.
  FIREBASE_SERVICE_ACCOUNT_B64: z.string().min(1).optional().or(z.literal('')),

  // Error tracking (GlitchTip, compatible con el SDK de Sentry). Vacío =
  // inactivo. Lo consume instrument.ts directamente desde process.env (debe
  // leerse antes que este módulo), aquí solo se declara para documentarlo.
  SENTRY_DSN: z.string().optional().or(z.literal('')),
});

export const env = envSchema.parse(process.env);
export type Env = z.infer<typeof envSchema>;
