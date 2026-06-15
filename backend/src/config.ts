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

  // Self-host: ruta DENTRO del contenedor backend donde guardar los blobs
  // cifrados en disco. Si está definida, el backend siembra al arrancar un
  // volumen local por defecto y las subidas van a disco (endpoint mismo-origen
  // /api/v1/uploads/chunk/, vía Caddy) en vez de a MinIO — cuyas URLs
  // prefirmadas (http://minio:9000) el navegador NO puede alcanzar en LAN.
  // Vacío en la nube (allí S3=Backblaze sí es público). docker-compose la pone
  // a /data (un named volume montado en el backend). Ver ensureDefaultVolume().
  BLOB_VOLUME_PATH: z.string().optional().or(z.literal('')).default(''),

  // Tope GLOBAL de almacenamiento cloud (suma de todos los usuarios). Protege el
  // bolsillo: si Backblaze/MinIO se acerca al gasto que aceptas, deja de admitir
  // subidas nuevas (HTTP 507) en vez de seguir creciendo. 0 = sin tope (default,
  // p. ej. self-host). Ponlo en Render para acotar el coste de B2.
  GLOBAL_STORAGE_CAP_BYTES: z.coerce.number().default(0),
  // % del tope a partir del cual el janitor avisa (log + GlitchTip). Default 80%.
  GLOBAL_STORAGE_ALERT_PCT: z.coerce.number().default(80),

  // Lockout por cuenta tras logins fallidos (ver login-lockout.ts). Tras
  // MAX_FAILS fallos en la ventana, bloqueo de BASE_LOCK_S segundos que se
  // duplica en bloqueos consecutivos hasta MAX_LOCK_S. Requiere Redis.
  LOGIN_LOCKOUT_MAX_FAILS: z.coerce.number().int().min(2).default(5),
  LOGIN_LOCKOUT_WINDOW_S: z.coerce.number().int().min(60).default(900),      // 15 min
  LOGIN_LOCKOUT_BASE_LOCK_S: z.coerce.number().int().min(60).default(900),   // 15 min
  LOGIN_LOCKOUT_MAX_LOCK_S: z.coerce.number().int().min(60).default(14400),  // 4 h

  // Última versión publicada del agente "Noctcom Connector". Se incrementa al
  // subir un binario nuevo a B2 (scripts/upload-agent-release.ts) para que los
  // agentes ya instalados detecten que hay actualización.
  AGENT_LATEST_VERSION: z.string().default('0.1.0'),

  // SHA256 (hex) del binario de Windows servido en B2. Lo imprime
  // scripts/upload-agent-release.ts al subir; se publica en la web para que el
  // usuario verifique la descarga y enlace al informe de VirusTotal. Vacío =
  // no se muestra nada (nunca un hash inventado).
  AGENT_WINDOWS_SHA256: z.string().regex(/^[a-f0-9]{64}$/i).optional().or(z.literal('')).default(''),

  // Push (FCM): el service account de Firebase como JSON en base64 — la vía
  // para prod (Render no tiene el archivo). En dev se usa el archivo
  // backend/firebase-service-account.json (gitignored) y esto queda vacío.
  FIREBASE_SERVICE_ACCOUNT_B64: z.string().min(1).optional().or(z.literal('')),

  // Error tracking (GlitchTip, compatible con el SDK de Sentry). Vacío =
  // inactivo. Lo consume instrument.ts directamente desde process.env (debe
  // leerse antes que este módulo), aquí solo se declara para documentarlo.
  SENTRY_DSN: z.string().optional().or(z.literal('')),

  // Beta: duración del periodo de prueba en días. El reloj arranca cuando el
  // usuario VE el modal de bienvenida del trial (users.trial_started_at), no al
  // registrarse. Cambiable en Render sin redesplegar código. El trial entero
  // (modal, cuota, contador) SOLO existe en el cloud gestionado (con Stripe);
  // en self-host /me devuelve trialExempt=true y nada de esto aplica.
  BETA_TRIAL_DAYS: z.coerce.number().int().min(1).default(30),
  // Cuota durante el trial (default 10 GiB). Al expirar, el janitor baja a los
  // free a USER_QUOTA_BYTES; lo que exceda queda en solo-lectura (el gate de
  // cuota de uploads.ts rechaza subidas, descargar/borrar sigue funcionando).
  BETA_TRIAL_QUOTA_BYTES: z.coerce.number().default(10 * 1024 * 1024 * 1024),

  // Anti-abuso del trial: máximo de registros por IP (hasheada, Redis) en la
  // ventana. Solo aplica en el cloud (con Stripe): en self-host/LAN muchas
  // personas legítimas comparten IP. Sin Redis es no-op (queda el rate-limit
  // por IP de @fastify/rate-limit).
  SIGNUP_MAX_PER_IP: z.coerce.number().int().min(1).default(2),
  SIGNUP_IP_WINDOW_S: z.coerce.number().int().min(60).default(604800), // 7 días

  // Billing (Stripe). Vacío = billing inactivo (el endpoint responde 503 y la
  // UI no ofrece upgrade). Los price IDs los lee plans.ts desde process.env.
  STRIPE_SECRET_KEY: z.string().optional().or(z.literal('')),
  STRIPE_WEBHOOK_SECRET: z.string().optional().or(z.literal('')),
  STRIPE_PRICE_STARTER: z.string().optional().or(z.literal('')),
  STRIPE_PRICE_PLUS: z.string().optional().or(z.literal('')),
  STRIPE_PRICE_PRO: z.string().optional().or(z.literal('')),
  STRIPE_PRICE_MAX: z.string().optional().or(z.literal('')),
  // Stripe Tax (IVA). 'true' lo activa en el Checkout. Apagado por defecto para
  // que el primer test no falle si los productos aún no tienen código de impuesto.
  STRIPE_AUTOMATIC_TAX: z.string().optional().or(z.literal('')),
});

export const env = envSchema.parse(process.env);
export type Env = z.infer<typeof envSchema>;
