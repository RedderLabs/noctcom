'use client';

import { useState } from 'react';
import { Link } from '@/i18n/navigation';
import { useRouter } from '@/i18n/navigation';
import { Mail, KeyRound, ArrowRight, AlertTriangle, Shield, ArrowLeft, FileKey2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { apiFetch } from '@/lib/api';
import {
  initCrypto, deriveMasterKey, hashEmail, encrypt, sign,
  randomBytes, deriveSubKey, DEFAULT_KDF,
  fromB64, toB64, wipe, type Bytes,
} from '@/lib/crypto';
import {
  deriveRecoverySeed, deriveRecoverySignKeypair,
  deriveRecoveryBoxKeypair, openRecoverySeal,
} from '@/lib/recovery';
import { cn, sanitizeEmail } from '@/lib/utils';

type Step = 'email' | 'mnemonic' | 'new_password' | 'done';

// Respuesta de /recovery/unlock: el material sellado a la recovery box key.
// Si recoveryBoxPublicKey es null la cuenta es pre-v2: se puede recuperar el
// acceso pero las vault keys viejas son irrecuperables (lo avisamos).
interface UnlockResponse {
  recoveryBoxPublicKey: string | null;
  exchangePublicKey: string;
  exchangePrivateKeySealedRecovery: string | null;
  vaults: { id: string; vaultKeySealedRecovery: string }[];
}

function StepIndicator({ current }: { current: Step }) {
  const steps: Step[] = ['email', 'mnemonic', 'new_password', 'done'];
  const idx = steps.indexOf(current);
  return (
    <div className="flex gap-1.5 mb-8">
      {steps.map((_, i) => (
        <div
          key={i}
          className={cn(
            'h-0.5 flex-1 rounded-full transition-colors duration-300',
            i <= idx ? 'bg-amber-500' : 'bg-bg-surface-3',
          )}
        />
      ))}
    </div>
  );
}

export default function RecoveryPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [words, setWords] = useState<string[]>(Array(12).fill(''));
  const [newPassword, setNewPassword] = useState('');
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [challenge, setChallenge] = useState('');
  const [unlock, setUnlock] = useState<UnlockResponse | null>(null);

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await initCrypto();
      const emailHash = hashEmail(sanitizeEmail(email));
      const res = await apiFetch<{ challenge: string; recoveryKdfSalt: string }>(
        '/api/v1/2fa/recovery/init',
        {
          method: 'POST',
          body: JSON.stringify({ emailHash: toB64(emailHash) }),
          skipAuth: true,
        },
      );
      setChallenge(res.challenge);
      setStep('mnemonic');
    } catch (err: any) {
      toast.error(err.message ?? 'Error al iniciar recuperación');
    } finally {
      setLoading(false);
    }
  }

  // Paso 2: la frase firma el challenge y /unlock devuelve el material
  // sellado. Verifica la frase AQUÍ (mejor UX que fallar al final) y nos
  // dice si la cuenta tiene kit v2 antes de pedir la nueva contraseña.
  async function handleMnemonicSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await initCrypto();
      const emailHash = hashEmail(sanitizeEmail(email));

      const seed = deriveRecoverySeed(words);
      const signKp = deriveRecoverySignKeypair(seed);
      const signature = sign(fromB64(challenge), signKp.privateKey);
      wipe(seed, signKp.privateKey);

      const res = await apiFetch<UnlockResponse>('/api/v1/2fa/recovery/unlock', {
        method: 'POST',
        body: JSON.stringify({
          emailHash: toB64(emailHash),
          challenge,
          signature: toB64(signature),
        }),
        skipAuth: true,
      });

      setUnlock(res);
      setStep('new_password');
    } catch {
      toast.error('La frase no corresponde a esta cuenta. Revisa las palabras y el orden.');
    } finally {
      setLoading(false);
    }
  }

  async function handleRecovery(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword !== newPasswordConfirm) {
      toast.error('Las contraseñas no coinciden');
      return;
    }
    if (newPassword.length < 8) {
      toast.error('La contraseña debe tener al menos 8 caracteres');
      return;
    }
    setLoading(true);
    try {
      await initCrypto();
      const sodium = (await import('libsodium-wrappers-sumo')).default;
      await sodium.ready;

      const emailHash = hashEmail(sanitizeEmail(email));

      // Firma del challenge (misma frase, misma firma que en /unlock)
      const seed = deriveRecoverySeed(words);
      const signKp = deriveRecoverySignKeypair(seed);
      const challengeBytes = fromB64(challenge);
      const signature = sign(challengeBytes, signKp.privateKey);

      // Nuevas claves con la nueva contraseña
      const salt = randomBytes(DEFAULT_KDF.saltBytes());
      const opsLimit = DEFAULT_KDF.opsLimit();
      const memLimit = DEFAULT_KDF.memLimit();
      const mk = deriveMasterKey(newPassword, salt, opsLimit, memLimit);

      const signSeed = deriveSubKey(mk, 'noctcom.login.sign');
      const identityKp = sodium.crypto_sign_seed_keypair(signSeed);

      // Recovery v2: abrir los seals con la privada derivada de la mnemónica
      // y re-wrappear con la nueva MK. El par exchange se CONSERVA (misma
      // pública) para que los archivos compartidos contigo sigan abriéndose.
      let exchangePublicKey: Bytes;
      let exchangePrivateKey: Bytes;
      const rewrappedVaults: { id: string; vaultKeyWrapped: string; vaultKeyNonce: string }[] = [];

      if (unlock?.recoveryBoxPublicKey) {
        const boxKp = deriveRecoveryBoxKeypair(seed);
        const newVaultWrapKey = deriveSubKey(mk, 'noctcom.vault.wrap');

        for (const v of unlock.vaults) {
          const vaultKey = openRecoverySeal(fromB64(v.vaultKeySealedRecovery), boxKp);
          const w = encrypt(vaultKey, newVaultWrapKey);
          rewrappedVaults.push({
            id: v.id,
            vaultKeyWrapped: toB64(w.ciphertext),
            vaultKeyNonce: toB64(w.nonce),
          });
          wipe(vaultKey);
        }

        if (unlock.exchangePrivateKeySealedRecovery) {
          exchangePrivateKey = openRecoverySeal(
            fromB64(unlock.exchangePrivateKeySealedRecovery), boxKp,
          );
          exchangePublicKey = fromB64(unlock.exchangePublicKey);
        } else {
          const kp = sodium.crypto_box_keypair();
          exchangePublicKey = kp.publicKey;
          exchangePrivateKey = kp.privateKey;
        }

        wipe(boxKp.privateKey, newVaultWrapKey);
      } else {
        // Cuenta pre-v2: no hay seals que abrir. Par exchange nuevo.
        const kp = sodium.crypto_box_keypair();
        exchangePublicKey = kp.publicKey;
        exchangePrivateKey = kp.privateKey;
      }

      const idWrapped = encrypt(identityKp.privateKey, mk);
      const exWrapped = encrypt(exchangePrivateKey, mk);
      const opaqueRecord = randomBytes(64);

      await apiFetch('/api/v1/2fa/recovery/finalize', {
        method: 'POST',
        body: JSON.stringify({
          emailHash: toB64(emailHash),
          challenge,
          signature: toB64(signature),
          newOpaqueRecord: toB64(opaqueRecord),
          newKdfSalt: toB64(salt),
          newKdfOpsLimit: opsLimit,
          newKdfMemLimit: memLimit,
          newIdentityPublicKey: toB64(identityKp.publicKey),
          newIdentityPrivateKeyWrapped: toB64(idWrapped.ciphertext),
          newIdentityPrivateKeyNonce: toB64(idWrapped.nonce),
          newExchangePublicKey: toB64(exchangePublicKey),
          newExchangePrivateKeyWrapped: toB64(exWrapped.ciphertext),
          newExchangePrivateKeyNonce: toB64(exWrapped.nonce),
          vaults: rewrappedVaults,
        }),
        skipAuth: true,
      });

      wipe(mk, seed, signKp.privateKey, identityKp.privateKey, exchangePrivateKey);
      setStep('done');
    } catch (err: any) {
      toast.error(err.message ?? 'Error al recuperar la cuenta');
    } finally {
      setLoading(false);
    }
  }

  const hasKit = !!unlock?.recoveryBoxPublicKey;

  return (
    <div className="space-y-6 animate-fade-in">
      <StepIndicator current={step} />

      <div className="text-center space-y-2">
        <h1 className="font-display text-3xl font-light tracking-tight">
          {step === 'email' && 'Recuperar cuenta'}
          {step === 'mnemonic' && 'Ingresa tu frase'}
          {step === 'new_password' && 'Nueva contraseña'}
          {step === 'done' && 'Cuenta restaurada'}
        </h1>
        <p className="text-sm text-text-secondary max-w-sm mx-auto">
          {step === 'email' && 'Necesitarás tu frase de recuperación de 12 palabras'}
          {step === 'mnemonic' && 'En el orden exacto que la generaste'}
          {step === 'new_password' && 'Tu bóveda se re-cifrará con esta contraseña'}
          {step === 'done' && (hasKit
            ? 'Tus claves y tus archivos siguen contigo'
            : 'Tus claves han sido regeneradas con la nueva contraseña')}
        </p>
      </div>

      {step === 'email' && (
        <form onSubmit={handleEmailSubmit} className="space-y-4">
          <div className="flex gap-2 p-3 rounded-lg bg-amber-500/5 border border-amber-500/20">
            <AlertTriangle className="size-4 text-amber-300 mt-0.5 shrink-0" />
            <p className="text-xs text-text-secondary leading-relaxed">
              Recuperar tu cuenta revoca todas las sesiones activas. Si tu cuenta tiene el
              kit de recuperación completo, tus archivos y compartidos se conservan.
            </p>
          </div>

          <Input
            label="Correo electrónico"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            leftIcon={<Mail className="size-4" />}
            placeholder="tu@email.com"
            required
            autoFocus
          />

          <Button type="submit" variant="primary" size="lg" className="w-full" loading={loading} rightIcon={!loading ? <ArrowRight className="size-4" /> : undefined}>
            Continuar
          </Button>
        </form>
      )}

      {step === 'mnemonic' && (
        <form onSubmit={handleMnemonicSubmit} className="space-y-5">
          <div className="grid grid-cols-3 gap-2">
            {words.map((w, i) => (
              <div key={i} className="relative">
                <span className="absolute left-2 top-2.5 text-[10px] font-mono text-text-tertiary">{i + 1}</span>
                <input
                  type="text"
                  value={w}
                  onChange={(e) => {
                    const next = [...words];
                    next[i] = e.target.value.trim().toLowerCase();
                    setWords(next);
                  }}
                  onPaste={(e) => {
                    const text = e.clipboardData.getData('text').trim();
                    const parts = text.split(/[\s,]+/).filter(Boolean);
                    if (parts.length > 1) {
                      e.preventDefault();
                      const next = [...words];
                      for (let j = 0; j < 12; j++) {
                        next[j] = (parts[j] ?? '').toLowerCase();
                      }
                      setWords(next);
                    }
                  }}
                  className="w-full h-10 pl-7 pr-2 text-sm font-mono bg-bg-surface border border-border-subtle rounded-md focus:outline-none focus:border-violet-500/60 focus:shadow-[0_0_0_3px_rgba(139,92,246,0.12)] text-text-primary"
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                />
              </div>
            ))}
          </div>
          <p className="text-[10px] text-text-muted text-center">
            Pega la frase completa en cualquier campo para rellenar todos automáticamente
          </p>

          <div className="flex gap-2">
            <Button
              type="button"
              variant="ghost"
              size="lg"
              className="flex-1"
              leftIcon={<ArrowLeft className="size-4" />}
              onClick={() => setStep('email')}
            >
              Atrás
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="lg"
              className="flex-1"
              disabled={words.some((w) => !w)}
              loading={loading}
              rightIcon={!loading ? <ArrowRight className="size-4" /> : undefined}
            >
              Verificar frase
            </Button>
          </div>
        </form>
      )}

      {step === 'new_password' && (
        <form onSubmit={handleRecovery} className="space-y-4">
          {hasKit ? (
            <div className="flex gap-2 p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
              <FileKey2 className="size-4 text-emerald-300 mt-0.5 shrink-0" />
              <p className="text-xs text-text-secondary leading-relaxed">
                <strong className="text-emerald-200">Kit de recuperación verificado.</strong>{' '}
                Tus bóvedas{unlock!.vaults.length > 1 ? ` (${unlock!.vaults.length})` : ''} se
                re-cifrarán con la nueva contraseña: archivos y compartidos siguen accesibles.
              </p>
            </div>
          ) : (
            <div className="flex gap-2 p-3 rounded-lg bg-amber-500/5 border border-amber-500/20">
              <AlertTriangle className="size-4 text-amber-300 mt-0.5 shrink-0" />
              <p className="text-xs text-text-secondary leading-relaxed">
                <strong className="text-amber-200">Esta cuenta no tiene el kit de recuperación completo.</strong>{' '}
                Recuperarás el acceso, pero los archivos cifrados con tu contraseña anterior
                no podrán descifrarse. Tras entrar, activa el kit en Ajustes → Seguridad
                para que no vuelva a pasar.
              </p>
            </div>
          )}

          <Input
            label="Nueva contraseña maestra"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            leftIcon={<KeyRound className="size-4" />}
            placeholder="••••••••••••"
            required
            autoFocus
          />
          <Input
            label="Repetir contraseña"
            type="password"
            value={newPasswordConfirm}
            onChange={(e) => setNewPasswordConfirm(e.target.value)}
            leftIcon={<KeyRound className="size-4" />}
            placeholder="••••••••••••"
            required
            error={newPasswordConfirm.length > 0 && newPassword !== newPasswordConfirm ? 'No coincide' : undefined}
          />

          <div className="flex gap-2">
            <Button
              type="button"
              variant="ghost"
              size="lg"
              leftIcon={<ArrowLeft className="size-4" />}
              onClick={() => setStep('mnemonic')}
            >
              Atrás
            </Button>
            <Button type="submit" variant="primary" size="lg" className="flex-1" loading={loading}>
              Restaurar cuenta
            </Button>
          </div>
        </form>
      )}

      {step === 'done' && (
        <div className="space-y-5 text-center">
          <div className="size-16 rounded-full bg-emerald-500/10 border border-emerald-500/30 grid place-items-center mx-auto">
            <svg className="size-7 text-emerald-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p className="text-sm text-text-secondary">
            {hasKit
              ? 'Tu cuenta ha sido restaurada: tus bóvedas se re-cifraron con la nueva contraseña y tus archivos siguen accesibles. Todas las sesiones anteriores han sido revocadas.'
              : 'Tu cuenta ha sido restaurada y tus claves re-generadas con la nueva contraseña. Todas las sesiones anteriores han sido revocadas.'}
          </p>
          <Button variant="primary" size="lg" className="w-full" onClick={() => router.push('/login')}>
            Iniciar sesión
          </Button>
        </div>
      )}

      <div className="text-center text-sm text-text-tertiary">
        <Link href="/login" className="hover:text-text-secondary transition-colors">
          ← Volver a inicio de sesión
        </Link>
      </div>

      <div className="flex items-center justify-center gap-2 pt-4 border-t border-border-faint">
        <Shield className="size-3.5 text-amber-400" />
        <span className="text-[10px] font-mono uppercase tracking-widest text-text-tertiary">
          Recuperación Zero-Knowledge
        </span>
      </div>
    </div>
  );
}
