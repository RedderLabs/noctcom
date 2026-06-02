'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Mail, Lock, Fingerprint, ArrowRight, Shield, KeyRound } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useAuth, getStoredDeviceId } from '@/lib/auth-store';
import { apiFetch, setTokens } from '@/lib/api';
import {
  initCrypto, deriveMasterKey, hashEmail, fromB64, toB64,
  decrypt, sign, deriveSubKey, wipe, encryptString, encrypt,
} from '@/lib/crypto';

interface SessionPayload {
  userId: string;
  deviceId: string | null;
  accessToken: string;
  refreshToken: string;
  identityPrivateKeyWrapped: string;
  identityPrivateKeyNonce: string;
  exchangePrivateKeyWrapped: string;
  exchangePrivateKeyNonce: string;
  exchangePublicKey: string;
}

interface FinalizeResponse extends Partial<SessionPayload> {
  requires2FA?: boolean;
  methods?: string[];
  pending2faToken?: string;
}

// Estado intermedio: la contraseña ya verificó y derivó la master key, pero
// falta el 2º factor. Retenemos la MK y la pubkey de identidad para descifrar
// las claves wrapped en cuanto el 2FA devuelva la sesión.
type Pending2FA = {
  token: string;
  methods: string[];
  mk: Uint8Array;
  identityPublicKey: Uint8Array;
};

export default function LoginPage() {
  const router = useRouter();
  const setIdentity = useAuth((s) => s.setIdentity);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const [pending2fa, setPending2fa] = useState<Pending2FA | null>(null);
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState('');

  useEffect(() => { initCrypto(); }, []);

  // Completa el login con el payload de sesión (venga del finalize directo o
  // tras el 2FA). Descifra las claves con la MK y registra el dispositivo.
  async function completeLogin(payload: SessionPayload, mk: Uint8Array, identityPublicKey: Uint8Array) {
    const sodium = (await import('libsodium-wrappers-sumo')).default;

    const idPriv = decrypt(
      fromB64(payload.identityPrivateKeyWrapped),
      fromB64(payload.identityPrivateKeyNonce),
      mk,
    );
    const exPriv = decrypt(
      fromB64(payload.exchangePrivateKeyWrapped),
      fromB64(payload.exchangePrivateKeyNonce),
      mk,
    );

    let accessToken = payload.accessToken;
    let deviceId = payload.deviceId;

    // Dispositivo nuevo — registrarlo
    if (!deviceId) {
      setTokens(payload.accessToken, payload.refreshToken);
      const deviceName = encryptString(navigator.userAgent.slice(0, 64), mk);
      const deviceKp = sodium.crypto_box_keypair();
      const devicePrivWrapped = encrypt(deviceKp.privateKey, mk);
      const reg = await apiFetch<{ deviceId: string; accessToken: string }>(
        '/api/v1/auth/devices',
        {
          method: 'POST',
          body: JSON.stringify({
            devicePublicKey: toB64(deviceKp.publicKey),
            deviceNameEncrypted: toB64(deviceName.ciphertext),
            deviceNameNonce: toB64(deviceName.nonce),
          }),
        },
      );
      deviceId = reg.deviceId;
      accessToken = reg.accessToken;
      localStorage.setItem('noctcom.devicePrivKey', toB64(devicePrivWrapped.ciphertext));
    }

    setTokens(accessToken, payload.refreshToken);
    setIdentity({
      userId: payload.userId,
      username: email.split('@')[0]!,
      deviceId,
      masterKey: mk,
      identityPrivateKey: idPriv,
      identityPublicKey,
      exchangePrivateKey: exPriv,
      exchangePublicKey: fromB64(payload.exchangePublicKey),
    });
    router.push('/vault');
  }

  async function handleCredentials(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await initCrypto();

      const emailHash = hashEmail(email);

      const init = await apiFetch<{
        kdfSalt: string;
        kdfOpsLimit: number;
        kdfMemLimit: number;
        challenge: string;
        opaqueRecord?: string;
      }>('/api/v1/auth/login/init', {
        method: 'POST',
        body: JSON.stringify({ emailHash: toB64(emailHash) }),
        skipAuth: true,
      });

      const salt = fromB64(init.kdfSalt);
      const mk = deriveMasterKey(password, salt, init.kdfOpsLimit, init.kdfMemLimit);

      const challenge = fromB64(init.challenge);
      const signingKeySeed = deriveSubKey(mk, 'noctcom.login.sign');
      const sodium = (await import('libsodium-wrappers-sumo')).default;
      const kp = sodium.crypto_sign_seed_keypair(signingKeySeed);
      const signature = sign(challenge, kp.privateKey);

      const storedDeviceId = getStoredDeviceId();

      const finalize = await apiFetch<FinalizeResponse>('/api/v1/auth/login/finalize', {
        method: 'POST',
        body: JSON.stringify({
          emailHash: toB64(emailHash),
          challenge: init.challenge,
          signature: toB64(signature),
          deviceId: storedDeviceId ?? undefined,
        }),
        skipAuth: true,
      });

      wipe(challenge, signingKeySeed);

      // ¿Hace falta segundo factor? Retenemos la MK y mostramos el paso 2FA.
      if (finalize.requires2FA && finalize.pending2faToken) {
        setPending2fa({
          token: finalize.pending2faToken,
          methods: finalize.methods ?? [],
          mk,
          identityPublicKey: kp.publicKey,
        });
        setLoading(false);
        return;
      }

      await completeLogin(finalize as SessionPayload, mk, kp.publicKey);
    } catch (err: any) {
      toast.error(err.message ?? 'Error al iniciar sesión');
      setLoading(false);
    }
  }

  async function handlePasskey2FA() {
    if (!pending2fa) return;
    setLoading(true);
    try {
      const emailHash = hashEmail(email);
      const options = await apiFetch('/api/v1/2fa/webauthn/authenticate/begin', {
        method: 'POST',
        body: JSON.stringify({ emailHash: toB64(emailHash) }),
        skipAuth: true,
      });
      const { startAuthentication } = await import('@simplewebauthn/browser');

      let asseResp;
      try {
        asseResp = await startAuthentication({ optionsJSON: options as any });
      } catch (err: any) {
        if (err?.name === 'NotAllowedError' || err?.name === 'AbortError') {
          toast.info('Autenticación cancelada');
          setLoading(false);
          return;
        }
        throw err;
      }

      const payload = await apiFetch<SessionPayload>('/api/v1/2fa/login/passkey/finish', {
        method: 'POST',
        body: JSON.stringify({ pending2faToken: pending2fa.token, response: asseResp }),
        skipAuth: true,
      });
      await completeLogin(payload, pending2fa.mk, pending2fa.identityPublicKey);
    } catch (err: any) {
      toast.error(err.message ?? 'No se pudo verificar la passkey');
      setLoading(false);
    }
  }

  async function handleSendOtp() {
    if (!pending2fa) return;
    setLoading(true);
    try {
      await apiFetch('/api/v1/2fa/login/email/send', {
        method: 'POST',
        body: JSON.stringify({ pending2faToken: pending2fa.token, email }),
        skipAuth: true,
      });
      setOtpSent(true);
      toast.success('Código enviado a tu email');
    } catch (err: any) {
      toast.error(err.message ?? 'No se pudo enviar el código');
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOtp() {
    if (!pending2fa) return;
    setLoading(true);
    try {
      const payload = await apiFetch<SessionPayload>('/api/v1/2fa/login/email/verify', {
        method: 'POST',
        body: JSON.stringify({ pending2faToken: pending2fa.token, code: otpCode }),
        skipAuth: true,
      });
      await completeLogin(payload, pending2fa.mk, pending2fa.identityPublicKey);
    } catch (err: any) {
      toast.error(err.message ?? 'Código incorrecto');
      setLoading(false);
    }
  }

  function cancel2FA() {
    setPending2fa(null);
    setOtpSent(false);
    setOtpCode('');
    setLoading(false);
  }

  // ─── Paso de verificación en dos pasos ──────────────────────
  if (pending2fa) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="text-center space-y-2">
          <h1 className="font-display text-3xl font-light tracking-tight">
            Verificación en dos pasos
          </h1>
          <p className="text-sm text-[var(--color-text-secondary)]">
            Tu contraseña es correcta. Confirma tu identidad para desbloquear.
          </p>
        </div>

        <div className="space-y-4">
          {pending2fa.methods.includes('passkey') && (
            <Button
              type="button"
              variant="primary"
              size="lg"
              className="w-full"
              loading={loading}
              leftIcon={!loading ? <Fingerprint className="size-4" /> : undefined}
              onClick={handlePasskey2FA}
            >
              Usar passkey
            </Button>
          )}

          {pending2fa.methods.includes('passkey') && pending2fa.methods.includes('email') && (
            <div className="relative my-2">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-[var(--color-border-faint)]" />
              </div>
              <div className="relative flex justify-center">
                <span className="bg-[var(--color-bg-base)] px-3 text-xs text-[var(--color-text-tertiary)] uppercase tracking-widest">o</span>
              </div>
            </div>
          )}

          {pending2fa.methods.includes('email') && (
            otpSent ? (
              <div className="space-y-4">
                <Input
                  label="Código de acceso (6 dígitos)"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                  leftIcon={<KeyRound className="size-4" />}
                  placeholder="123456"
                />
                <Button
                  type="button"
                  variant="primary"
                  size="lg"
                  className="w-full"
                  loading={loading}
                  disabled={otpCode.length !== 6}
                  rightIcon={!loading ? <ArrowRight className="size-4" /> : undefined}
                  onClick={handleVerifyOtp}
                >
                  Verificar código
                </Button>
                <button
                  type="button"
                  className="w-full text-xs text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] transition-colors"
                  onClick={handleSendOtp}
                >
                  Reenviar código
                </button>
              </div>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="lg"
                className="w-full"
                loading={loading}
                leftIcon={!loading ? <Mail className="size-4" /> : undefined}
                onClick={handleSendOtp}
              >
                Enviar código a mi email
              </Button>
            )
          )}

          <button
            type="button"
            className="w-full text-sm text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] transition-colors pt-2"
            onClick={cancel2FA}
          >
            Cancelar
          </button>
        </div>

        <div className="flex items-center justify-center gap-2 pt-4 border-t border-[var(--color-border-faint)]">
          <Shield className="size-3.5 text-violet-400" />
          <span className="text-[10px] font-mono uppercase tracking-widest text-[var(--color-text-tertiary)]">
            Cifrado local · Zero-Knowledge
          </span>
        </div>
      </div>
    );
  }

  // ─── Paso de credenciales ───────────────────────────────────
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="text-center space-y-2">
        <h1 className="font-display text-3xl font-light tracking-tight">
          Bienvenido de nuevo
        </h1>
        <p className="text-sm text-[var(--color-text-secondary)]">
          Desbloquea tu bóveda
        </p>
      </div>

      <form onSubmit={handleCredentials} className="space-y-4">
          <Input
            label="Correo electrónico"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            leftIcon={<Mail className="size-4" />}
            placeholder="tu@email.com"
            required
          />
          <Input
            label="Contraseña maestra"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            leftIcon={<Lock className="size-4" />}
            placeholder="••••••••••••"
            required
          />

          <Button
            type="submit"
            variant="primary"
            size="lg"
            className="w-full"
            loading={loading}
            rightIcon={!loading ? <ArrowRight className="size-4" /> : undefined}
          >
            {loading ? 'Descifrando localmente…' : 'Desbloquear bóveda'}
          </Button>
        </form>

      <div className="text-center space-y-2 text-sm">
        <Link href="/recovery" className="text-violet-300 hover:text-violet-200 transition-colors">
          ¿Olvidaste tu contraseña?
        </Link>
        <div className="text-[var(--color-text-tertiary)]">
          ¿No tienes cuenta?{' '}
          <Link href="/signup" className="text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors">
            Crear una
          </Link>
        </div>
      </div>

      <div className="flex items-center justify-center gap-2 pt-4 border-t border-[var(--color-border-faint)]">
        <Shield className="size-3.5 text-violet-400" />
        <span className="text-[10px] font-mono uppercase tracking-widest text-[var(--color-text-tertiary)]">
          Cifrado local · Zero-Knowledge
        </span>
      </div>
    </div>
  );
}
