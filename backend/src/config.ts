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

  SMTP_HOST: z.string().min(1).optional().or(z.literal('')),
  SMTP_PORT: z.coerce.number().default(2525),
  SMTP_USER: z.string().min(1).optional().or(z.literal('')),
  SMTP_PASS: z.string().min(1).optional().or(z.literal('')),
  SMTP_FROM: z.string().default('noreply@noctcom.app'),

  MAX_UPLOAD_BYTES: z.coerce.number().default(5 * 1024 * 1024 * 1024),
  USER_QUOTA_BYTES: z.coerce.number().default(10 * 1024 * 1024 * 1024),
});

export const env = envSchema.parse(process.env);
export type Env = z.infer<typeof envSchema>;
