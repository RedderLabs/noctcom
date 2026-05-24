'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Mail, KeyRound, ArrowRight, AlertTriangle, Shield, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { cn } from '@/lib/utils';

type Step = 'email' | 'mnemonic' | 'new_password' | 'done';

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
            i <= idx ? 'bg-amber-500' : 'bg-[var(--color-bg-surface-3)]',
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
        <p className="text-sm text-[var(--color-text-secondary)] max-w-sm mx-auto">
          {step === 'email' && 'Necesitarás tu frase de recuperación de 12 palabras'}
          {step === 'mnemonic' && 'En el orden exacto que la generaste'}
          {step === 'new_password' && 'Tu bóveda se re-cifrará con esta contraseña'}
          {step === 'done' && 'Tus archivos y claves siguen intactos'}
        </p>
      </div>

      {step === 'email' && (
        <form
          onSubmit={(e) => { e.preventDefault(); setStep('mnemonic'); }}
          className="space-y-4"
        >
          <div className="flex gap-2 p-3 rounded-lg bg-amber-500/5 border border-amber-500/20">
            <AlertTriangle className="size-4 text-amber-300 mt-0.5 shrink-0" />
            <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
              Recuperar tu cuenta revoca todas las sesiones activas y re-cifra tus claves.
              Necesitas tu frase de 12 palabras.
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

          <Button type="submit" variant="primary" size="lg" className="w-full" rightIcon={<ArrowRight className="size-4" />}>
            Continuar
          </Button>
        </form>
      )}

      {step === 'mnemonic' && (
        <form
          onSubmit={(e) => { e.preventDefault(); setStep('new_password'); }}
          className="space-y-5"
        >
          <div className="grid grid-cols-3 gap-2">
            {words.map((w, i) => (
              <div key={i} className="relative">
                <span className="absolute left-2 top-2.5 text-[10px] font-mono text-[var(--color-text-tertiary)]">{i + 1}</span>
                <input
                  type="text"
                  value={w}
                  onChange={(e) => {
                    const next = [...words];
                    next[i] = e.target.value.trim().toLowerCase();
                    setWords(next);
                  }}
                  className="w-full h-10 pl-7 pr-2 text-sm font-mono bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] rounded-md focus:outline-none focus:border-violet-500/60 focus:shadow-[0_0_0_3px_rgba(139,92,246,0.12)] text-[var(--color-text-primary)]"
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                />
              </div>
            ))}
          </div>

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
              rightIcon={<ArrowRight className="size-4" />}
            >
              Verificar frase
            </Button>
          </div>
        </form>
      )}

      {step === 'new_password' && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (newPassword !== newPasswordConfirm) {
              toast.error('Las contraseñas no coinciden');
              return;
            }
            setLoading(true);
            await new Promise((r) => setTimeout(r, 1500));
            setStep('done');
            setLoading(false);
          }}
          className="space-y-4"
        >
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
          <p className="text-sm text-[var(--color-text-secondary)]">
            Tu cuenta ha sido restaurada y tus claves re-cifradas con la nueva contraseña.
            Todas las sesiones anteriores han sido revocadas.
          </p>
          <Button variant="primary" size="lg" className="w-full" onClick={() => router.push('/login')}>
            Iniciar sesión
          </Button>
        </div>
      )}

      <div className="text-center text-sm text-[var(--color-text-tertiary)]">
        <Link href="/login" className="hover:text-[var(--color-text-secondary)] transition-colors">
          ← Volver a inicio de sesión
        </Link>
      </div>

      <div className="flex items-center justify-center gap-2 pt-4 border-t border-[var(--color-border-faint)]">
        <Shield className="size-3.5 text-amber-400" />
        <span className="text-[10px] font-mono uppercase tracking-widest text-[var(--color-text-tertiary)]">
          Recuperación Zero-Knowledge
        </span>
      </div>
    </div>
  );
}
