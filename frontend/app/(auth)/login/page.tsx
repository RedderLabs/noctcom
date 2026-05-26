'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Mail, Lock, KeyRound, Fingerprint, ArrowRight, Shield } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useAuth, getStoredDeviceId } from '@/lib/auth-store';
import { apiFetch, setTokens } from '@/lib/api';
import {
  initCrypto, deriveMasterKey, hashEmail, fromB64, toB64,
  decrypt, sign, deriveSubKey, wipe, encryptString, encrypt,
} from '@/lib/crypto';

type Step = 'credentials' | 'totp' | 'passkey';

export default function LoginPage() {
  const router = useRouter();
  const setIdentity = useAuth((s) => s.setIdentity);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [step, setStep] = useState<Step>('credentials');
  const [loading, setLoading] = useState(false);
  const [partial, setPartial] = useState<any>(null);

  useEffect(() => { initCrypto(); }, []);

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

      const finalize = await apiFetch<{
        userId: string;
        deviceId: string | null;
        accessToken: string;
        refreshToken: string;
        identityPrivateKeyWrapped: string;
        identityPrivateKeyNonce: string;
        exchangePrivateKeyWrapped: string;
        exchangePrivateKeyNonce: string;
        exchangePublicKey: string;
        totpRequired?: boolean;
      }>('/api/v1/auth/login/finalize', {
        method: 'POST',
        body: JSON.stringify({
          emailHash: toB64(emailHash),
          challenge: init.challenge,
          signature: toB64(signature),
          deviceId: storedDeviceId ?? undefined,
        }),
        skipAuth: true,
      });

      const idPriv = decrypt(
        fromB64(finalize.identityPrivateKeyWrapped),
        fromB64(finalize.identityPrivateKeyNonce),
        mk,
      );
      const exPriv = decrypt(
        fromB64(finalize.exchangePrivateKeyWrapped),
        fromB64(finalize.exchangePrivateKeyNonce),
        mk,
      );

      let { accessToken } = finalize;
      let deviceId = finalize.deviceId;

      // New device — register it
      if (!deviceId) {
        setTokens(finalize.accessToken, finalize.refreshToken);
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

      const sessionData = {
        userId: finalize.userId,
        username: email.split('@')[0]!,
        deviceId,
        masterKey: mk,
        identityPrivateKey: idPriv,
        identityPublicKey: kp.publicKey,
        exchangePrivateKey: exPriv,
        exchangePublicKey: fromB64(finalize.exchangePublicKey),
      };

      if (finalize.totpRequired) {
        setPartial({ ...sessionData, accessToken, refreshToken: finalize.refreshToken });
        setStep('totp');
        setLoading(false);
        return;
      }

      setTokens(accessToken, finalize.refreshToken);
      setIdentity(sessionData);
      wipe(challenge, signingKeySeed);
      router.push('/vault');
    } catch (err: any) {
      toast.error(err.message ?? 'Error al iniciar sesión');
      setLoading(false);
    }
  }

  async function handleTotp(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const unwrapKey = deriveSubKey(partial.masterKey, 'noctcom.totp.v1');
      await apiFetch('/api/v1/2fa/totp/verify', {
        method: 'POST',
        body: JSON.stringify({
          userId: partial.userId,
          code: totpCode,
          unwrapKey: toB64(unwrapKey),
        }),
        skipAuth: true,
      });
      wipe(unwrapKey);

      setTokens(partial.accessToken, partial.refreshToken);
      setIdentity(partial);
      router.push('/vault');
    } catch (err: any) {
      toast.error('Código incorrecto');
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="text-center space-y-2">
        <h1 className="font-display text-3xl font-light tracking-tight">
          {step === 'credentials' ? 'Bienvenido de nuevo' : 'Verificación 2FA'}
        </h1>
        <p className="text-sm text-[var(--color-text-secondary)]">
          {step === 'credentials' ? 'Desbloquea tu bóveda' : 'Ingresa el código de tu app autenticadora'}
        </p>
      </div>

      {step === 'credentials' && (
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

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-[var(--color-border-faint)]" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-[var(--color-bg-base)] px-3 text-xs text-[var(--color-text-tertiary)] uppercase tracking-widest">o</span>
            </div>
          </div>

          <Button
            type="button"
            variant="outline"
            size="lg"
            className="w-full"
            leftIcon={<Fingerprint className="size-4" />}
            onClick={() => toast.info('Iniciando passkey…')}
          >
            Iniciar con Passkey
          </Button>
        </form>
      )}

      {step === 'totp' && (
        <form onSubmit={handleTotp} className="space-y-4">
          <Input
            label="Código de 6 dígitos"
            type="text"
            inputMode="numeric"
            pattern="[0-9]{6}"
            maxLength={6}
            value={totpCode}
            onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
            leftIcon={<KeyRound className="size-4" />}
            placeholder="000000"
            className="text-center font-mono text-lg tracking-[0.5em]"
            required
            autoFocus
          />
          <Button
            type="submit"
            variant="primary"
            size="lg"
            className="w-full"
            loading={loading}
          >
            Verificar
          </Button>
        </form>
      )}

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
