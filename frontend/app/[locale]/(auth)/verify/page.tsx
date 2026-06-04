'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { Mail, Shield, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { apiFetch } from '@/lib/api';

export default function VerifyPage() {
  const t = useTranslations('verify');
  const router = useRouter();
  const [code, setCode] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
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
      toast.success(t('toast.verifiedSuccess'));
    } catch (err: any) {
      toast.error(err.message ?? t('toast.invalidCode'));
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
        <h1 className="font-display text-3xl font-light tracking-tight">{t('success.title')}</h1>
        <p className="text-sm text-text-secondary">{t('success.description')}</p>
        <Button variant="primary" size="lg" className="w-full" onClick={() => router.push('/vault')}>
          {t('success.goToVault')}
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
        <h1 className="font-display text-3xl font-light tracking-tight">{t('title')}</h1>
        <p className="text-sm text-text-secondary max-w-sm mx-auto">
          {t('subtitle')}
        </p>
      </div>

      <form onSubmit={handleVerify} className="space-y-4">
        <Input
          label={t('codeLabel')}
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
          {t('verifyButton')}
        </Button>
      </form>

      <div className="space-y-3 text-center">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t('emailPlaceholder')}
          className="w-full px-3 py-2 rounded-lg border border-border-faint
                     bg-bg-deep text-sm text-text-primary
                     placeholder:text-text-muted text-center
                     focus:outline-none focus:border-violet-500/50"
        />
        <button
          type="button"
          disabled={resending || !email}
          onClick={async () => {
            setResending(true);
            try {
              if (!email) {
                toast.error(t('toast.emailRequired'));
                return;
              }
              await apiFetch('/api/v1/auth/resend-verification', {
                method: 'POST',
                body: JSON.stringify({ email }),
              });
              toast.success(t('toast.resentSuccess'));
            } catch (err: any) {
              toast.error(err.message ?? t('toast.resendError'));
            } finally {
              setResending(false);
            }
          }}
          className="text-sm text-violet-400 hover:text-violet-300 transition-colors disabled:opacity-50"
        >
          {resending ? t('resending') : t('resendButton')}
        </button>
        <br />
        <button
          type="button"
          onClick={() => router.push('/vault')}
          className="text-sm text-text-tertiary hover:text-text-secondary transition-colors"
        >
          {t('verifyLater')}
        </button>
      </div>

      <div className="flex items-center justify-center gap-2 pt-4 border-t border-border-faint">
        <Shield className="size-3.5 text-violet-400" />
        <span className="text-[10px] font-mono uppercase tracking-widest text-text-tertiary">
          {t('emailNotStored')}
        </span>
      </div>
    </div>
  );
}
