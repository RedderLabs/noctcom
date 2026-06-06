/**
 * Límite de registros por IP (anti-abuso del trial de la beta).
 *
 * Complementa el rate-limit por minuto de @fastify/rate-limit: aquel frena
 * ráfagas; este impide que una misma IP encadene cuentas para reusar el trial
 * (SIGNUP_MAX_PER_IP registros por ventana de SIGNUP_IP_WINDOW_S). Cuenta solo
 * registros COMPLETADOS, no intentos.
 *
 * Privacidad: la IP nunca se guarda en claro — solo su hash (mismo hashIp de
 * session.ts) como clave de Redis con TTL; caducada la ventana, no queda nada.
 *
 * Solo aplica en el cloud gestionado (con Stripe): en self-host/LAN muchas
 * personas legítimas comparten IP. Sin Redis es no-op (como login-lockout).
 */
import { redis } from './db/redis.js';
import { env } from './config.js';

const PREFIX = 'signup:ip:';

function enabled(): boolean {
  return !!env.STRIPE_SECRET_KEY;
}

/** ¿Esta IP (hasheada, base64url) ya agotó sus registros de la ventana? */
export async function signupBlocked(ipHashB64: string): Promise<boolean> {
  if (!enabled()) return false;
  const r = redis();
  if (!r) return false;
  try {
    const n = await r.get(`${PREFIX}${ipHashB64}`);
    return n !== null && Number(n) >= env.SIGNUP_MAX_PER_IP;
  } catch {
    return false; // Redis caído: no bloquear registros por ello
  }
}

/** Registro completado: anota la IP (hasheada) en la ventana. */
export async function recordSignup(ipHashB64: string): Promise<void> {
  if (!enabled()) return;
  const r = redis();
  if (!r) return;
  try {
    const key = `${PREFIX}${ipHashB64}`;
    const n = await r.incr(key);
    if (n === 1) await r.expire(key, env.SIGNUP_IP_WINDOW_S);
  } catch {
    /* ignore */
  }
}
