'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { useRouter } from '@/i18n/navigation';
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
  const t = useTranslations('login');
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
      // Lockout por cuenta (429 del backend): mensaje claro con el tiempo restante.
      if (err?.status === 429 && err?.detail?.error === 'account_locked') {
        const minutes = Math.max(1, Math.ceil((err.detail.retryAfterSeconds ?? 60) / 60));
        toast.error(t('errors.locked', { minutes }));
      } else {
        toast.error(err.message ?? t('errors.login'));
      }
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
          toast.info(t('toasts.authCancelled'));
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
      toast.error(err.message ?? t('errors.passkey'));
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
      toast.success(t('toasts.codeSent'));
    } catch (err: any) {
      toast.error(err.message ?? t('errors.sendCode'));
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
      toast.error(err.message ?? t('errors.wrongCode'));
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
            {t('twoFactor.title')}
          </h1>
          <p className="text-sm text-text-secondary">
            {t('twoFactor.subtitle')}
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
              {t('twoFactor.usePasskey')}
            </Button>
          )}

          {pending2fa.methods.includes('passkey') && pending2fa.methods.includes('email') && (
            <div className="relative my-2">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-border-faint" />
              </div>
              <div className="relative flex justify-center">
                <span className="bg-bg-base px-3 text-xs text-text-tertiary uppercase tracking-widest">{t('twoFactor.or')}</span>
              </div>
            </div>
          )}

          {pending2fa.methods.includes('email') && (
            otpSent ? (
              <div className="space-y-4">
                <Input
                  label={t('twoFactor.otpLabel')}
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
                  {t('twoFactor.verifyCode')}
                </Button>
                <button
                  type="button"
                  className="w-full text-xs text-text-tertiary hover:text-text-secondary transition-colors"
                  onClick={handleSendOtp}
                >
                  {t('twoFactor.resendCode')}
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
                {t('twoFactor.sendCodeEmail')}
              </Button>
            )
          )}

          <button
            type="button"
            className="w-full text-sm text-text-tertiary hover:text-text-secondary transition-colors pt-2"
            onClick={cancel2FA}
          >
            {t('twoFactor.cancel')}
          </button>
        </div>

        <div className="flex items-center justify-center gap-2 pt-4 border-t border-border-faint">
          <Shield className="size-3.5 text-violet-400" />
          <span className="text-[10px] font-mono uppercase tracking-widest text-text-tertiary">
            {t('footer.security')}
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
          {t('credentials.title')}
        </h1>
        <p className="text-sm text-text-secondary">
          {t('credentials.subtitle')}
        </p>
      </div>

      <form onSubmit={handleCredentials} className="space-y-4">
          <Input
            label={t('credentials.emailLabel')}
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            leftIcon={<Mail className="size-4" />}
            placeholder={t('credentials.emailPlaceholder')}
            required
          />
          <Input
            label={t('credentials.passwordLabel')}
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
            {loading ? t('credentials.decrypting') : t('credentials.unlock')}
          </Button>
        </form>

      <div className="text-center space-y-2 text-sm">
        <Link href="/recovery" className="text-violet-300 hover:text-violet-200 transition-colors">
          {t('credentials.forgotPassword')}
        </Link>
        <div className="text-text-tertiary">
          {t.rich('credentials.noAccount', {
            signup: (chunks) => (
              <Link href="/signup" className="text-text-secondary hover:text-text-primary transition-colors">
                {chunks}
              </Link>
            ),
          })}
        </div>
      </div>

      <div className="flex items-center justify-center gap-2 pt-4 border-t border-border-faint">
        <Shield className="size-3.5 text-violet-400" />
        <span className="text-[10px] font-mono uppercase tracking-widest text-text-tertiary">
          Cifrado local · Zero-Knowledge
        </span>
      </div>
    </div>
  );
}
