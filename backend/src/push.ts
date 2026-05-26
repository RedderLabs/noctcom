import admin from 'firebase-admin';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from './db/pool.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const serviceAccountPath = resolve(__dirname, '..', 'firebase-service-account.json');

let initialized = false;

export function initPush() {
  if (initialized) return;
  if (!existsSync(serviceAccountPath)) {
    console.warn('firebase-service-account.json not found, push disabled');
    return;
  }

  const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf-8'));
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
  initialized = true;
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
