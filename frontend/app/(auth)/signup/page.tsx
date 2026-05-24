'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Mail, Lock, User, ArrowRight, Shield, Copy, Check, KeyRound } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useAuth } from '@/lib/auth-store';
import { apiFetch, setTokens } from '@/lib/api';
import {
  initCrypto, deriveMasterKey, hashEmail, fromB64, toB64,
  encrypt, encryptString, randomBytes, randomKey, DEFAULT_KDF, deriveSubKey,
} from '@/lib/crypto';
import { cn } from '@/lib/utils';

type Step = 'form' | 'mnemonic' | 'confirm';

const WORDLIST = [
  'abandon', 'ability', 'able', 'about', 'above', 'absent', 'absorb', 'abstract',
  'absurd', 'abuse', 'access', 'accident', 'account', 'accuse', 'achieve', 'acid',
  'acoustic', 'acquire', 'across', 'act', 'action', 'actor', 'actress', 'actual',
];

function generateMnemonic(): string[] {
  const words: string[] = [];
  const rand = randomBytes(12);
  for (let i = 0; i < 12; i++) {
    words.push(WORDLIST[rand[i]! % WORDLIST.length]!);
  }
  return words;
}

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
            i <= idx ? 'bg-violet-500' : 'bg-[var(--color-bg-surface-3)]',
          )}
        />
      ))}
    </div>
  );
}

export default function SignupPage() {
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
    const labels = ['Muy débil', 'Débil', 'Aceptable', 'Buena', 'Fuerte', 'Excelente'];
    const colors = ['bg-red-500', 'bg-orange-500', 'bg-yellow-500', 'bg-lime-500', 'bg-emerald-500', 'bg-violet-500'];
    return { score, label: labels[score]!, color: colors[score]! };
  }

  const strength = passwordStrength(password);

  function handleNext(e: React.FormEvent) {
    e.preventDefault();
    if (password !== passwordConfirm) {
      toast.error('Las contraseñas no coinciden');
      return;
    }
    if (strength.score < 3) {
      toast.error('Tu contraseña es demasiado débil. Usa al menos 12 caracteres con números y símbolos.');
      return;
    }
    setMnemonic(generateMnemonic());
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
      toast.error('Las palabras no coinciden. Revisa tu frase de recuperación.');
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
      const vaultName = encryptString('Mi bóveda', vaultKey);
      const vaultWrapKey = deriveSubKey(mk, 'noctcom.vault.wrap');
      const vaultKeyWrapped = encrypt(vaultKey, vaultWrapKey);

      const deviceName = encryptString(navigator.userAgent.slice(0, 64), mk);
      const deviceKp = sodium.crypto_box_keypair();
      const opaqueRecord = randomBytes(64);

      const payload = {
        username,
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
        initialVault: {
          nameEncrypted: toB64(vaultName.ciphertext),
          nameNonce: toB64(vaultName.nonce),
          vaultKeyWrapped: toB64(vaultKeyWrapped.ciphertext),
          vaultKeyNonce: toB64(vaultKeyWrapped.nonce),
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

      setTokens(res.accessToken, res.refreshToken);
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

      toast.success('Cuenta creada con éxito');
      router.push('/vault');
    } catch (err: any) {
      toast.error(err.message ?? 'Error al crear la cuenta');
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <StepIndicator current={step} />

      <div className="text-center space-y-2">
        <h1 className="font-display text-3xl font-light tracking-tight">
          {step === 'form' && 'Crear cuenta'}
          {step === 'mnemonic' && 'Tu frase de recuperación'}
          {step === 'confirm' && 'Casi listo'}
        </h1>
        <p className="text-sm text-[var(--color-text-secondary)]">
          {step === 'form' && 'Tu contraseña jamás se enviará a nuestros servidores'}
          {step === 'mnemonic' && 'Guárdala en lugar seguro. Es tu única forma de recuperar tu cuenta.'}
          {step === 'confirm' && 'Confirmamos algunas palabras al azar'}
        </p>
      </div>

      {/* ─── Paso 1: Formulario ─────────────────────────────── */}
      {step === 'form' && (
        <form onSubmit={handleNext} className="space-y-4">
          <Input
            label="Nombre de usuario"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            leftIcon={<User className="size-4" />}
            placeholder="alex"
            pattern="[a-zA-Z0-9_.-]{3,64}"
            required
            autoFocus
          />
          <Input
            label="Correo electrónico"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            leftIcon={<Mail className="size-4" />}
            placeholder="tu@email.com"
            hint="Solo guardamos un hash. Nunca verás spam."
            required
          />
          <div className="space-y-2">
            <Input
              label="Contraseña maestra"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              leftIcon={<Lock className="size-4" />}
              placeholder="••••••••••••"
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
                        i < strength.score ? strength.color : 'bg-[var(--color-bg-surface-3)]',
                      )}
                    />
                  ))}
                </div>
                <p className="text-xs text-[var(--color-text-tertiary)]">{strength.label}</p>
              </div>
            )}
          </div>
          <Input
            label="Repetir contraseña"
            type="password"
            value={passwordConfirm}
            onChange={(e) => setPasswordConfirm(e.target.value)}
            leftIcon={<Lock className="size-4" />}
            placeholder="••••••••••••"
            required
            error={passwordConfirm.length > 0 && password !== passwordConfirm ? 'No coincide' : undefined}
          />

          <div className="flex gap-2 p-3 rounded-lg bg-violet-500/5 border border-violet-500/20">
            <Shield className="size-4 text-violet-300 mt-0.5 shrink-0" />
            <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
              <strong className="text-[var(--color-text-primary)]">Importante:</strong>{' '}
              Si olvidas esta contraseña y pierdes tu frase de recuperación, tus datos serán
              irrecuperables. No tenemos forma de restaurarlos.
            </p>
          </div>

          <Button type="submit" variant="primary" size="lg" className="w-full" rightIcon={<ArrowRight className="size-4" />}>
            Continuar
          </Button>
        </form>
      )}

      {/* ─── Paso 2: Frase mnemónica ──────────────────────────── */}
      {step === 'mnemonic' && (
        <div className="space-y-5">
          <div className="grid grid-cols-3 gap-2 p-4 rounded-xl bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)]">
            {mnemonic.map((word, i) => (
              <div
                key={i}
                className="flex items-center gap-2 p-2.5 rounded-lg bg-[var(--color-bg-surface-2)] border border-[var(--color-border-faint)] hover:border-violet-500/30 transition-colors"
              >
                <span className="text-[10px] font-mono text-[var(--color-text-muted)] w-4 text-right">{i + 1}</span>
                <span className="text-sm font-mono text-violet-300">{word}</span>
              </div>
            ))}
          </div>

          <Button
            variant="secondary"
            size="md"
            className="w-full"
            leftIcon={copied ? <Check className="size-4" /> : <Copy className="size-4" />}
            onClick={() => {
              navigator.clipboard.writeText(mnemonic.join(' '));
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
              toast.success('Copiado al portapapeles');
            }}
          >
            {copied ? 'Copiado' : 'Copiar frase'}
          </Button>

          <label className="flex items-start gap-2 text-sm cursor-pointer p-3 rounded-lg hover:bg-[var(--color-bg-surface)] transition-colors">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="mt-0.5 size-4 accent-violet-500"
            />
            <span className="text-[var(--color-text-secondary)]">
              He guardado mi frase de recuperación en un lugar seguro y entiendo que es la
              única forma de recuperar mi cuenta.
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
            Continuar
          </Button>
        </div>
      )}

      {/* ─── Paso 3: Verificación ─────────────────────────────── */}
      {step === 'confirm' && (
        <div className="space-y-5">
          <div className="space-y-4">
            {verifyIndices.map((wordIdx, i) => (
              <div key={wordIdx}>
                <label className="block text-[10px] font-mono uppercase tracking-widest text-[var(--color-text-tertiary)] mb-1.5">
                  Palabra #{wordIdx + 1}
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={verifyInputs[i]}
                    onChange={(e) => {
                      const next = [...verifyInputs];
                      next[i] = e.target.value.trim().toLowerCase();
                      setVerifyInputs(next);
                    }}
                    placeholder={`Ingresa la palabra ${wordIdx + 1}`}
                    className="w-full h-11 pl-3.5 pr-10 font-mono text-sm bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] rounded-lg text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-violet-500/60 focus:shadow-[0_0_0_3px_rgba(139,92,246,0.12)] transition-all"
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    autoFocus={i === 0}
                  />
                  <KeyRound className={cn(
                    'absolute right-3 top-1/2 -translate-y-1/2 size-4 transition-colors',
                    verifyInputs[i] && verifyInputs[i] === mnemonic[wordIdx]
                      ? 'text-emerald-400'
                      : 'text-[var(--color-text-muted)]',
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
              {loading ? 'Creando bóveda…' : 'Confirmar y entrar'}
            </Button>
            <Button
              variant="ghost"
              size="md"
              className="w-full"
              onClick={() => setStep('mnemonic')}
            >
              Atrás
            </Button>
          </div>

          <div className="flex items-center justify-center gap-2 pt-3 border-t border-[var(--color-border-faint)]">
            <Shield className="size-3.5 text-violet-400" />
            <span className="text-[10px] font-mono uppercase tracking-widest text-[var(--color-text-tertiary)]">
              Zero-Knowledge Verification Active
            </span>
          </div>
        </div>
      )}

      <div className="text-center text-sm text-[var(--color-text-tertiary)]">
        ¿Ya tienes cuenta?{' '}
        <Link href="/login" className="text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors">
          Iniciar sesión
        </Link>
      </div>
    </div>
  );
}
