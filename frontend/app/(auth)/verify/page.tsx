'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Mail, Shield, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { apiFetch } from '@/lib/api';

export default function VerifyPage() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [verified, setVerified] = useState(false);

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    if (code.length !== 6) return;
    setLoading(true);
    try {
      await apiFetch('/api/v1/auth/verify', {
        method: 'POST',
        body: JSON.stringify({ code }),
      });
      setVerified(true);
      toast.success('Email verificado');
    } catch (err: any) {
      toast.error(err.message ?? 'Código inválido o expirado');
    } finally {
      setLoading(false);
    }
  }

  if (verified) {
    return (
      <div className="space-y-6 animate-fade-in text-center">
        <div className="size-16 rounded-full bg-emerald-500/10 border border-emerald-500/30 grid place-items-center mx-auto">
          <svg className="size-7 text-emerald-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="font-display text-3xl font-light tracking-tight">Email verificado</h1>
        <p className="text-sm text-[var(--color-text-secondary)]">Tu cuenta está completamente activa.</p>
        <Button variant="primary" size="lg" className="w-full" onClick={() => router.push('/vault')}>
          Ir a mi bóveda
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="text-center space-y-2">
        <div className="size-14 rounded-full bg-violet-500/10 border border-violet-500/30 grid place-items-center mx-auto mb-4">
          <Mail className="size-6 text-violet-300" />
        </div>
        <h1 className="font-display text-3xl font-light tracking-tight">Verifica tu email</h1>
        <p className="text-sm text-[var(--color-text-secondary)] max-w-sm mx-auto">
          Te enviamos un código de 6 dígitos. Revisa tu bandeja de entrada.
        </p>
      </div>

      <form onSubmit={handleVerify} className="space-y-4">
        <Input
          label="Código de verificación"
          type="text"
          inputMode="numeric"
          pattern="[0-9]{6}"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
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
          disabled={code.length !== 6}
          rightIcon={!loading ? <ArrowRight className="size-4" /> : undefined}
        >
          Verificar
        </Button>
      </form>

      <div className="text-center">
        <button
          type="button"
          onClick={() => router.push('/vault')}
          className="text-sm text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] transition-colors"
        >
          Verificar más tarde →
        </button>
      </div>

      <div className="flex items-center justify-center gap-2 pt-4 border-t border-[var(--color-border-faint)]">
        <Shield className="size-3.5 text-violet-400" />
        <span className="text-[10px] font-mono uppercase tracking-widest text-[var(--color-text-tertiary)]">
          Tu email no se almacena en nuestros servidores
        </span>
      </div>
    </div>
  );
}
