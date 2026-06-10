'use client';

import { useState, useEffect, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { useRouter } from '@/i18n/navigation';
import { Mail, Lock, User, ArrowRight, Shield, Copy, Check, KeyRound } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useAuth } from '@/lib/auth-store';
import { apiFetch, setTokens } from '@/lib/api';
import { copyText, clearClipboard } from '@/lib/clipboard';
import {
  initCrypto, deriveMasterKey, hashEmail, fromB64, toB64,
  encrypt, encryptString, randomBytes, randomKey, DEFAULT_KDF, deriveSubKey, wipe,
} from '@/lib/crypto';
import { cn, sanitizeUsername, sanitizeEmail, sanitizeErrorMessage } from '@/lib/utils';
import {
  generateRecoveryMnemonic, deriveRecoverySeed,
  deriveRecoverySignKeypair, deriveRecoveryBoxKeypair, sealToRecovery,
} from '@/lib/recovery';

type Step = 'form' | 'mnemonic' | 'confirm';

function StepIndicator({ current }: { current: Step }) {
  const steps: Step[] = ['form', 'mnemonic', 'confirm'];
  const idx = steps.indexOf(current);
  return (
    <div className="flex gap-1.5 mb-8">
      {steps.map((_, i) => (
        <div
          key={i}
          className={cn(
            'h-0.5 flex-1 rounded-full transition-colors duration-300',
            i <= idx ? 'bg-violet-500' : 'bg-bg-surface-3',
          )}
        />
      ))}
    </div>
  );
}

export default function SignupPage() {
  const t = useTranslations('signup');
  const router = useRouter();
  const setIdentity = useAuth((s) => s.setIdentity);
  const [step, setStep] = useState<Step>('form');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [mnemonic, setMnemonic] = useState<string[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [submitCooldown, setSubmitCooldown] = useState(false);

  // Step 3: verification
  const [verifyIndices, setVerifyIndices] = useState<number[]>([]);
  const [verifyInputs, setVerifyInputs] = useState<string[]>(['', '', '']);

  useEffect(() => { initCrypto(); }, []);

  function passwordStrength(p: string): { score: number; label: string; color: string } {
    let score = 0;
    if (p.length >= 8) score++;
    if (p.length >= 12) score++;
    if (p.length >= 16) score++;
    if (/[A-Z]/.test(p) && /[a-z]/.test(p)) score++;
    if (/\d/.test(p) && /[^\w\s]/.test(p)) score++;
    const colors = ['bg-red-500', 'bg-orange-500', 'bg-yellow-500', 'bg-lime-500', 'bg-emerald-500', 'bg-violet-500'];
    return { score, label: t(`strength.${score}` as any), color: colors[score]! };
  }

  const strength = passwordStrength(password);

  function handleNext(e: React.FormEvent) {
    e.preventDefault();
    if (submitCooldown) return;

    const cleanUsername = sanitizeUsername(username);
    const cleanEmail = sanitizeEmail(email);

    if (cleanUsername.length < 3) {
      toast.error(t('errors.usernameTooShort'));
      return;
    }
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      toast.error(t('errors.invalidEmail'));
      return;
    }
    if (password.length > 128) {
      toast.error(t('errors.passwordTooLong'));
      return;
    }
    if (password !== passwordConfirm) {
      toast.error(t('errors.passwordMismatch'));
      return;
    }
    if (strength.score < 3) {
      toast.error(t('errors.passwordTooWeak'));
      return;
    }

    setUsername(cleanUsername);
    setEmail(cleanEmail);
    setSubmitCooldown(true);
    setTimeout(() => setSubmitCooldown(false), 2000);
    setMnemonic(generateRecoveryMnemonic());
    setStep('mnemonic');
  }

  function handleGoToConfirm() {
    const indices: number[] = [];
    while (indices.length < 3) {
      const r = Math.floor(Math.random() * 12);
      if (!indices.includes(r)) indices.push(r);
    }
    indices.sort((a, b) => a - b);
    setVerifyIndices(indices);
    setVerifyInputs(['', '', '']);
    setStep('confirm');
  }

  const verifyCorrect = useMemo(() => {
    if (verifyIndices.length !== 3) return false;
    return verifyIndices.every((idx, i) =>
      verifyInputs[i]?.trim().toLowerCase() === mnemonic[idx]?.toLowerCase()
    );
  }, [verifyIndices, verifyInputs, mnemonic]);

  async function handleFinalize() {
    if (!verifyCorrect) {
      toast.error(t('errors.wordsMismatch'));
      return;
    }
    setLoading(true);
    try {
      await initCrypto();
      const sodium = (await import('libsodium-wrappers-sumo')).default;

      const emailHash = hashEmail(email);
      const salt = randomBytes(DEFAULT_KDF.saltBytes());
      const opsLimit = DEFAULT_KDF.opsLimit();
      const memLimit = DEFAULT_KDF.memLimit();
      const mk = deriveMasterKey(password, salt, opsLimit, memLimit);

      const signSeed = deriveSubKey(mk, 'noctcom.login.sign');
      const identityKp = sodium.crypto_sign_seed_keypair(signSeed);
      const exchangeKp = sodium.crypto_box_keypair();

      const idWrapped = encrypt(identityKp.privateKey, mk);
      const exWrapped = encrypt(exchangeKp.privateKey, mk);

      const vaultKey = randomKey();
      const vaultName = encryptString(t('defaultVaultName'), vaultKey);
      const vaultWrapKey = deriveSubKey(mk, 'noctcom.vault.wrap');
      const vaultKeyWrapped = encrypt(vaultKey, vaultWrapKey);

      const deviceName = encryptString(navigator.userAgent.slice(0, 64), mk);
      const deviceKp = sodium.crypto_box_keypair();
      const devicePrivWrapped = encrypt(deviceKp.privateKey, mk);
      const opaqueRecord = randomBytes(64);

      // Recovery v2: de la mnemónica salen el par de firma (challenge) y el
      // par box (X25519). Con la box pública sellamos la vault key y la
      // sk_exchange: si un día se recupera la cuenta con la frase, los
      // archivos y los shares recibidos siguen siendo accesibles.
      const recoverySeed = deriveRecoverySeed(mnemonic);
      const recoveryKp = deriveRecoverySignKeypair(recoverySeed);
      const recoveryBoxKp = deriveRecoveryBoxKeypair(recoverySeed);
      const vaultKeySealedRecovery = sealToRecovery(vaultKey, recoveryBoxKp.publicKey);
      const exchangeSkSealedRecovery = sealToRecovery(exchangeKp.privateKey, recoveryBoxKp.publicKey);

      const payload = {
        username,
        email,
        emailHash: toB64(emailHash),
        kdfSalt: toB64(salt),
        kdfOpsLimit: opsLimit,
        kdfMemLimit: memLimit,
        opaqueRecord: toB64(opaqueRecord),
        identityPublicKey: toB64(identityKp.publicKey),
        identityPrivateKeyWrapped: toB64(idWrapped.ciphertext),
        identityPrivateKeyNonce: toB64(idWrapped.nonce),
        exchangePublicKey: toB64(exchangeKp.publicKey),
        exchangePrivateKeyWrapped: toB64(exWrapped.ciphertext),
        exchangePrivateKeyNonce: toB64(exWrapped.nonce),
        recoveryPublicKey: toB64(recoveryKp.publicKey),
        recoveryBoxPublicKey: toB64(recoveryBoxKp.publicKey),
        exchangePrivateKeySealedRecovery: toB64(exchangeSkSealedRecovery),
        initialVault: {
          nameEncrypted: toB64(vaultName.ciphertext),
          nameNonce: toB64(vaultName.nonce),
          vaultKeyWrapped: toB64(vaultKeyWrapped.ciphertext),
          vaultKeyNonce: toB64(vaultKeyWrapped.nonce),
          vaultKeySealedRecovery: toB64(vaultKeySealedRecovery),
        },
        deviceNameEncrypted: toB64(deviceName.ciphertext),
        deviceNameNonce: toB64(deviceName.nonce),
        devicePublicKey: toB64(deviceKp.publicKey),
      };

      const res = await apiFetch<{
        userId: string;
        deviceId: string;
        vaultId: string;
        accessToken: string;
        refreshToken: string;
      }>('/api/v1/auth/signup', {
        method: 'POST',
        body: JSON.stringify(payload),
        skipAuth: true,
      });

      wipe(recoverySeed, recoveryKp.privateKey, recoveryBoxKp.privateKey);

      setTokens(res.accessToken, res.refreshToken);
      localStorage.setItem('noctcom.devicePrivKey', toB64(devicePrivWrapped.ciphertext));
      setIdentity({
        userId: res.userId,
        username,
        deviceId: res.deviceId,
        masterKey: mk,
        identityPrivateKey: identityKp.privateKey,
        identityPublicKey: identityKp.publicKey,
        exchangePrivateKey: exchangeKp.privateKey,
        exchangePublicKey: exchangeKp.publicKey,
      });

      setMnemonic([]);
      setPassword('');
      setPasswordConfirm('');
      clearClipboard();
      toast.success(t('toasts.accountCreated'));
      router.push('/verify');
    } catch (err: unknown) {
      // Tope de cuentas por IP (anti-abuso del trial): mensaje claro, no el crudo.
      if (String((err as Error)?.message ?? '').includes('too-many-signups')) {
        toast.error(t('toasts.tooManySignups'));
      } else {
        toast.error(sanitizeErrorMessage(err));
      }
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <StepIndicator current={step} />

      <div className="text-center space-y-2">
        <h1 className="font-display text-3xl font-light tracking-tight">
          {step === 'form' && t('form.title')}
          {step === 'mnemonic' && t('mnemonic.title')}
          {step === 'confirm' && t('confirm.title')}
        </h1>
        <p className="text-sm text-text-primary opacity-80">
          {step === 'form' && t('form.subtitle')}
          {step === 'mnemonic' && t('mnemonic.subtitle')}
          {step === 'confirm' && t('confirm.subtitle')}
        </p>
      </div>

      {/* ─── Paso 1: Formulario ─────────────────────────────── */}
      {step === 'form' && (
        <form onSubmit={handleNext} className="space-y-4">
          <Input
            label={t('form.usernameLabel')}
            type="text"
            value={username}
            onChange={(e) => setUsername(sanitizeUsername(e.target.value))}
            leftIcon={<User className="size-4" />}
            placeholder={t('form.usernamePlaceholder')}
            pattern="[a-zA-Z0-9_.\-]{3,64}"
            maxLength={64}
            required
            autoFocus
          />
          <Input
            label={t('form.emailLabel')}
            type="email"
            value={email}
            onChange={(e) => setEmail(sanitizeEmail(e.target.value))}
            leftIcon={<Mail className="size-4" />}
            placeholder={t('form.emailPlaceholder')}
            hint={t('form.emailHint')}
            maxLength={254}
            required
          />
          <div className="space-y-2">
            <Input
              label={t('form.passwordLabel')}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value.slice(0, 128))}
              leftIcon={<Lock className="size-4" />}
              placeholder="••••••••••••"
              maxLength={128}
              required
            />
            {password.length > 0 && (
              <div className="space-y-1">
                <div className="flex gap-1">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <div
                      key={i}
                      className={cn(
                        'h-1 flex-1 rounded-full transition-colors',
                        i < strength.score ? strength.color : 'bg-bg-surface-3',
                      )}
                    />
                  ))}
                </div>
                <p className="text-xs text-text-tertiary">{strength.label}</p>
              </div>
            )}
          </div>
          <Input
            label={t('form.passwordConfirmLabel')}
            type="password"
            value={passwordConfirm}
            onChange={(e) => setPasswordConfirm(e.target.value.slice(0, 128))}
            leftIcon={<Lock className="size-4" />}
            placeholder="••••••••••••"
            maxLength={128}
            required
            error={passwordConfirm.length > 0 && password !== passwordConfirm ? t('form.noMatch') : undefined}
          />

          <div className="flex gap-2 p-3 rounded-lg bg-violet-500/5 border border-violet-500/20">
            <Shield className="size-4 text-violet-300 mt-0.5 shrink-0" />
            <p className="text-xs text-text-secondary leading-relaxed">
              {t.rich('form.important', {
                strong: (chunks) => <strong className="text-text-primary">{chunks}</strong>,
              })}
            </p>
          </div>

          <Button type="submit" variant="primary" size="lg" className="w-full" rightIcon={<ArrowRight className="size-4" />}>
            {t('form.continue')}
          </Button>

          <p className="text-[11px] text-text-tertiary text-center leading-relaxed">
            {t.rich('form.legal', {
              terms: (chunks) => (
                <Link href={'/terminos' as any} className="text-violet-300 hover:text-violet-200">{chunks}</Link>
              ),
              privacy: (chunks) => (
                <Link href={'/privacidad' as any} className="text-violet-300 hover:text-violet-200">{chunks}</Link>
              ),
            })}
          </p>
        </form>
      )}

      {/* ─── Paso 2: Frase mnemónica ──────────────────────────── */}
      {step === 'mnemonic' && (
        <div className="space-y-5">
          <div className="grid grid-cols-3 gap-2.5 p-5 rounded-xl bg-bg-surface border border-border-subtle">
            {mnemonic.map((word, i) => (
              <div
                key={i}
                className="flex items-center gap-2.5 p-3 rounded-lg bg-bg-surface-2 border border-border-faint hover:border-violet-500/30 transition-colors"
              >
                <span className="text-xs font-mono text-text-secondary w-5 text-right">{i + 1}</span>
                <span className="text-base font-mono text-violet-200 font-medium">{word}</span>
              </div>
            ))}
          </div>

          <Button
            variant="secondary"
            size="md"
            className="w-full"
            leftIcon={copied ? <Check className="size-4" /> : <Copy className="size-4" />}
            onClick={async () => {
              const ok = await copyText(mnemonic.join(' '));
              if (!ok) { toast.error(t('mnemonic.copyFailed')); return; }
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
              setTimeout(() => clearClipboard(), 60_000);
              toast.success(t('toasts.copied'));
            }}
          >
            {copied ? t('mnemonic.copied') : t('mnemonic.copy')}
          </Button>

          <label className="flex items-start gap-2 text-sm cursor-pointer p-3 rounded-lg hover:bg-bg-surface transition-colors">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="mt-0.5 size-4 accent-violet-500"
            />
            <span className="text-text-primary opacity-80">
              {t('mnemonic.confirmCheckbox')}
            </span>
          </label>

          <Button
            variant="primary"
            size="lg"
            className="w-full"
            disabled={!confirmed}
            onClick={handleGoToConfirm}
            rightIcon={<ArrowRight className="size-4" />}
          >
            {t('mnemonic.continue')}
          </Button>
        </div>
      )}

      {/* ─── Paso 3: Verificación ─────────────────────────────── */}
      {step === 'confirm' && (
        <div className="space-y-5">
          <div className="space-y-5">
            {verifyIndices.map((wordIdx, i) => (
              <div key={wordIdx}>
                <label className="flex items-center gap-2 mb-2">
                  <span className="inline-flex items-center justify-center size-6 rounded bg-violet-500/15 text-violet-200 text-sm font-mono font-semibold">
                    {wordIdx + 1}
                  </span>
                  <span className="text-sm text-text-primary">
                    {t('confirm.wordLabel', { n: wordIdx + 1 })}
                  </span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={verifyInputs[i]}
                    onChange={(e) => {
                      const val = e.target.value.replace(/[^a-z]/g, '').slice(0, 20);
                      const next = [...verifyInputs];
                      next[i] = val;
                      setVerifyInputs(next);
                    }}
                    onDrop={(e) => e.preventDefault()}
                    placeholder={t('confirm.wordPlaceholder', { n: wordIdx + 1 })}
                    className="w-full h-12 pl-4 pr-10 font-mono text-base bg-bg-surface border border-border-subtle rounded-lg text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-violet-500/60 focus:shadow-[0_0_0_3px_rgba(139,92,246,0.12)] transition-all"
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    autoFocus={i === 0}
                  />
                  <KeyRound className={cn(
                    'absolute right-3 top-1/2 -translate-y-1/2 size-5 transition-colors',
                    verifyInputs[i] && verifyInputs[i] === mnemonic[wordIdx]
                      ? 'text-emerald-400'
                      : 'text-text-tertiary',
                  )} />
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-2 pt-2">
            <Button
              variant="primary"
              size="lg"
              className="w-full"
              disabled={!verifyCorrect}
              loading={loading}
              onClick={handleFinalize}
              rightIcon={!loading ? <ArrowRight className="size-4" /> : undefined}
            >
              {loading ? t('confirm.creating') : t('confirm.finalize')}
            </Button>
            <Button
              variant="ghost"
              size="md"
              className="w-full"
              onClick={() => setStep('mnemonic')}
            >
              {t('confirm.back')}
            </Button>
          </div>

          <div className="flex items-center justify-center gap-2 pt-3 border-t border-border-faint">
            <Shield className="size-3.5 text-violet-400" />
            <span className="text-xs font-mono uppercase tracking-widest text-text-secondary">
              Zero-Knowledge Verification Active
            </span>
          </div>
        </div>
      )}

      <div className="text-center text-sm text-text-secondary">
        {t.rich('haveAccount', {
          login: (chunks) => (
            <Link href="/login" className="text-violet-300 hover:text-violet-200 transition-colors">{chunks}</Link>
          ),
        })}
      </div>
    </div>
  );
}
