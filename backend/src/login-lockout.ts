/**
 * Lockout por CUENTA tras logins fallidos.
 *
 * Complementa el rate-limit por IP (@fastify/rate-limit en las rutas de auth):
 * un atacante distribuido rota IPs y el límite por IP no lo ve; este contador
 * va por email_hash, así que frena la adivinación de contraseña contra UNA
 * cuenta venga de donde venga. Se aplica igual a cuentas inexistentes (mismo
 * comportamiento → no revela si el email existe).
 *
 * Política: tras LOGIN_LOCKOUT_MAX_FAILS fallos dentro de la ventana, bloqueo
 * temporal que se DUPLICA con cada bloqueo consecutivo (backoff exponencial)
 * hasta el máximo. El login correcto limpia contador y racha. El bloqueo es
 * siempre temporal: un atacante no puede dejar una cuenta inutilizada para
 * siempre (DoS), solo ralentizada.
 *
 * Sin Redis (self-host mínimo) es no-op y queda el rate-limit por IP.
 * Prometido en la propuesta de auditoría (NLnet 2026-08-018, punto 3 de "Use").
 */
import { redis } from './db/redis.js';
import { env } from './config.js';

const PREFIX = 'lockout:';

/** Segundos de bloqueo restantes para esta cuenta (0 = no bloqueada). */
export async function lockedSeconds(emailHashB64: string): Promise<number> {
  const r = redis();
  if (!r) return 0;
  try {
    const ttl = await r.ttl(`${PREFIX}lock:${emailHashB64}`);
    return ttl > 0 ? ttl : 0;
  } catch {
    return 0; // Redis caído: no bloquear el login por ello.
  }
}

/**
 * Registra un fallo de login. Si con este fallo se alcanza el umbral, activa
 * el bloqueo y devuelve su duración; si no, null.
 */
export async function recordLoginFailure(
  emailHashB64: string,
): Promise<{ lockedFor: number } | null> {
  const r = redis();
  if (!r) return null;
  try {
    const failsKey = `${PREFIX}fails:${emailHashB64}`;
    const fails = await r.incr(failsKey);
    if (fails === 1) await r.expire(failsKey, env.LOGIN_LOCKOUT_WINDOW_S);
    if (fails < env.LOGIN_LOCKOUT_MAX_FAILS) return null;

    // Umbral alcanzado: bloqueo con backoff exponencial según la racha de
    // bloqueos consecutivos. La racha caduca sola al doble del bloqueo máximo.
    const strikesKey = `${PREFIX}strikes:${emailHashB64}`;
    const strikes = await r.incr(strikesKey);
    await r.expire(strikesKey, env.LOGIN_LOCKOUT_MAX_LOCK_S * 2);
    const lockedFor = Math.min(
      env.LOGIN_LOCKOUT_BASE_LOCK_S * 2 ** (strikes - 1),
      env.LOGIN_LOCKOUT_MAX_LOCK_S,
    );
    await r.set(`${PREFIX}lock:${emailHashB64}`, '1', { EX: lockedFor });
    await r.del(failsKey);
    return { lockedFor };
  } catch {
    return null;
  }
}

/** Login correcto: limpia el contador de fallos y la racha de bloqueos. */
export async function clearLoginFailures(emailHashB64: string): Promise<void> {
  const r = redis();
  if (!r) return;
  try {
    await r.del([`${PREFIX}fails:${emailHashB64}`, `${PREFIX}strikes:${emailHashB64}`]);
  } catch {
    /* ignore */
  }
}
