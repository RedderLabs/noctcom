import type { FastifyBaseLogger } from 'fastify';
import { db } from './db/pool.js';

// Barrido periódico de filas efímeras ya caducadas. Sin esto, tablas como
// password_reset_tokens, webauthn_challenges y login_attempts crecen sin
// límite (un atacante que martillee /recovery/init dejaría miles de tokens
// muertos). No es seguridad crítica — la validez ya se comprueba por
// expires_at en cada uso — pero evita que la BD se hinche con basura.

const HOUR = 60 * 60 * 1000;

async function sweep(log: FastifyBaseLogger): Promise<void> {
  try {
    const tokens = await db.query(
      `DELETE FROM password_reset_tokens WHERE expires_at < now() - interval '1 hour'`,
    );
    const challenges = await db.query(
      `DELETE FROM webauthn_challenges WHERE expires_at < now() - interval '1 hour'`,
    );
    // El log de intentos de login solo sirve para forense reciente: 30 días basta.
    const attempts = await db.query(
      `DELETE FROM login_attempts WHERE created_at < now() - interval '30 days'`,
    );
    const total = (tokens.rowCount ?? 0) + (challenges.rowCount ?? 0) + (attempts.rowCount ?? 0);
    if (total > 0) {
      log.info(
        { resetTokens: tokens.rowCount, challenges: challenges.rowCount, loginAttempts: attempts.rowCount },
        'janitor: filas efímeras caducadas purgadas',
      );
    }
  } catch (err) {
    log.warn({ err }, 'janitor: barrido falló (se reintentará)');
  }
}

// Arranca el barrido horario. Devuelve el handle para poder pararlo en shutdown.
export function startJanitor(log: FastifyBaseLogger): NodeJS.Timeout {
  void sweep(log); // uno al arrancar, sin esperar la primera hora
  const handle = setInterval(() => void sweep(log), HOUR);
  handle.unref?.(); // que no bloquee el cierre del proceso
  return handle;
}
