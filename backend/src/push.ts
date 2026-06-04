import admin from 'firebase-admin';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from './db/pool.js';
import { env } from './config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const serviceAccountPath = resolve(__dirname, '..', 'firebase-service-account.json');

let initialized = false;

// Credenciales del service account, por orden de preferencia:
//   1. FIREBASE_SERVICE_ACCOUNT_B64 (env var, JSON en base64) — la vía de prod:
//      en Render no hay archivo, se pega el base64 en Environment.
//   2. backend/firebase-service-account.json (gitignored) — la vía de dev.
function loadServiceAccount(): object | null {
  if (env.FIREBASE_SERVICE_ACCOUNT_B64) {
    try {
      return JSON.parse(Buffer.from(env.FIREBASE_SERVICE_ACCOUNT_B64, 'base64').toString('utf-8'));
    } catch (err) {
      console.warn('FIREBASE_SERVICE_ACCOUNT_B64 inválido (¿base64 del JSON completo?):', err);
      return null;
    }
  }
  if (existsSync(serviceAccountPath)) {
    return JSON.parse(readFileSync(serviceAccountPath, 'utf-8'));
  }
  return null;
}

export function initPush() {
  if (initialized) return;
  const serviceAccount = loadServiceAccount();
  if (!serviceAccount) {
    console.warn('push desactivado: ni FIREBASE_SERVICE_ACCOUNT_B64 ni firebase-service-account.json');
    return;
  }

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount as admin.ServiceAccount),
  });
  initialized = true;
  console.log('✓ push (FCM) inicializado');
}

export async function sendPushToUser(userId: string, title: string, body: string, data?: Record<string, string>) {
  if (!initialized) return;

  const r = await db.query(
    `SELECT token FROM push_tokens WHERE user_id = $1`,
    [userId],
  );
  if (r.rowCount === 0) return;

  const tokens = r.rows.map((row) => row.token as string);
  const message: admin.messaging.MulticastMessage = {
    tokens,
    notification: { title, body },
    data: data ?? {},
    webpush: {
      fcmOptions: { link: '/' },
      notification: {
        icon: '/icon-192.png',
        badge: '/icon-72.png',
      },
    },
  };

  try {
    const res = await admin.messaging().sendEachForMulticast(message);
    // Clean up invalid tokens
    const invalidIndices: number[] = [];
    res.responses.forEach((r, i) => {
      if (!r.success && (
        r.error?.code === 'messaging/invalid-registration-token' ||
        r.error?.code === 'messaging/registration-token-not-registered'
      )) {
        invalidIndices.push(i);
      }
    });
    if (invalidIndices.length > 0) {
      const invalidTokens = invalidIndices.map((i) => tokens[i]);
      for (const t of invalidTokens) {
        await db.query(`DELETE FROM push_tokens WHERE token = $1`, [t]);
      }
    }
  } catch (err) {
    console.warn('push notification failed:', err);
  }
}
