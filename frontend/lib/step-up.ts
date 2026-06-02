import { apiFetch } from './api';
import { useAuth } from './auth-store';
import { sign, fromB64, toB64, initCrypto } from './crypto';

// Obtiene un token de step-up (re-autenticación reciente) para operaciones
// destructivas. Firma un challenge del servidor con la identity key (que el
// cliente solo posee si tiene la master key), probando posesión + presencia.
// El token se adjunta como cabecera `x-step-up-token` en la operación sensible.
export async function getStepUpToken(): Promise<string> {
  await initCrypto();
  const identityPriv = useAuth.getState().identityPrivateKey;
  if (!identityPriv) throw new Error('sesión no inicializada');

  const { challenge } = await apiFetch<{ challenge: string }>(
    '/api/v1/2fa/step-up/begin',
    { method: 'POST' },
  );
  const signature = sign(fromB64(challenge), identityPriv);
  const { stepUpToken } = await apiFetch<{ stepUpToken: string }>(
    '/api/v1/2fa/step-up/finish',
    {
      method: 'POST',
      body: JSON.stringify({ challenge, signature: toB64(signature) }),
    },
  );
  return stepUpToken;
}
