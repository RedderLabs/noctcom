'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { useRouter } from '@/i18n/navigation';
import {
  Check, ArrowRight, Server, Lock, EyeOff, Share2, Smartphone,
  Download, Github, ShieldCheck, Sparkles, Code2, Fingerprint, KeyRound,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { Navbar } from '@/components/ui/Navbar';
import { useAuth } from '@/lib/auth-store';
import { fetchPlans, startCheckout, formatBytes, type PublicPlan } from '@/lib/billing';
import { cn } from '@/lib/utils';

// Plan destacado visualmente (mejor relación espacio/precio).
const FEATURED = 'pro';

// Slugs de plan con tagline traducible (las claves viven en pricing.tagline.*).
const TAGLINE_KEYS = ['starter', 'plus', 'pro', 'max'] as const;

// Todo lo que incluye CUALQUIER plan (el cifrado no cambia, solo el espacio).
const INCLUDED = [
  { icon: Lock, key: 'e2e' },
  { icon: EyeOff, key: 'metadata' },
  { icon: Share2, key: 'share' },
  { icon: Smartphone, key: 'multidevice' },
  { icon: Download, key: 'export' },
  { icon: ShieldCheck, key: '2fa' },
];

// Franja de confianza — solo afirmaciones verdaderas. Etiquetas técnicas, no se traducen.
const TRUST = [
  { icon: Code2, label: 'Open Source · AGPL-3.0' },
  { icon: Lock, label: 'XChaCha20-Poly1305' },
  { icon: Fingerprint, label: 'Argon2id' },
  { icon: ShieldCheck, label: 'Zero-Knowledge' },
];

// Especificaciones técnicas — IDÉNTICAS en todos los planes (ese es el punto).
// Solo se traduce la etiqueta (label); el valor técnico se mantiene literal.
const SPECS: { key: string; value: string }[] = [
  { key: 'kdf', value: 'Argon2id · 256 MiB' },
  { key: 'fileEncryption', value: 'XChaCha20-Poly1305 (AEAD)' },
  { key: 'signatures', value: 'Ed25519' },
  { key: 'sharing', value: 'X25519 · sealed boxes' },
  { key: 'hash', value: 'BLAKE2b-256' },
  { key: 'recovery', value: 'BIP39 (128 bits)' },
  { key: '2fa', value: 'Passkeys (WebAuthn) + email' },
  { key: 'license', value: 'AGPL-3.0 · auditable' },
];

const FAQ_KEYS = ['plan-change', 'cancel', 'space', 'payment', 'self-host'] as const;

export default function PricingPage() {
  const t = useTranslations('pricing');
  const router = useRouter();
  const isAuthenticated = useAuth((s) => s.isAuthenticated);
  const [plans, setPlans] = useState<PublicPlan[]>([]);
  const [billingEnabled, setBillingEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    fetchPlans()
      .then((r) => { setPlans(r.plans); setBillingEnabled(r.billingEnabled); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function choose(plan: PublicPlan) {
    if (plan.priceEurMonth === 0) { router.push('/signup'); return; }
    if (!isAuthenticated) { router.push('/signup'); return; }
    setBusy(plan.id);
    try {
      const res = await startCheckout(plan.id);
      // Cambio de plan sobre una suscripción ya activa (sin redirección a Stripe).
      if (res.updated) {
        toast.success(res.unchanged ? t('toast.unchanged') : t('toast.updated', { plan: plan.label }));
        router.push('/vault/settings');
        return;
      }
      // Si había url, el navegador ya está redirigiendo a Stripe.
    } catch (err: any) {
      toast.error(err?.message ?? t('toast.error'));
      setBusy(null);
    }
  }

  return (
    <main className="min-h-screen flex flex-col">
      <Navbar variant="back" />

      <div className="flex-1 w-full">
        {/* ─── Hero ─────────────────────────────────────────── */}
        <section className="max-w-4xl mx-auto px-6 pt-16 pb-10 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-violet-500/20 bg-violet-500/5 mb-6">
            <Sparkles className="size-3.5 text-violet-300" />
            <span className="text-xs text-violet-300 font-medium">{t('hero.badge')}</span>
          </div>
          <h1 className="font-display text-4xl md:text-6xl font-light tracking-tight mb-5 leading-[1.05]">
            {t.rich('hero.title', {
              emph: (chunks) => <span className="text-gradient-violet font-normal">{chunks}</span>,
              br: () => <br />,
            })}
          </h1>
          <p className="text-lg text-text-secondary max-w-xl mx-auto leading-relaxed">
            {t('hero.subtitle')}
          </p>
        </section>

        {/* ─── Planes (solo de pago: el gratis es el punto de partida) ─ */}
        <section className="max-w-5xl mx-auto px-6 pb-4">
          <div className="flex justify-center mb-7">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/5">
              <Check className="size-3.5 text-emerald-400" />
              <span className="text-xs text-text-secondary">
                {t.rich('startFree', {
                  strong: (chunks) => <strong className="text-text-primary">{chunks}</strong>,
                })}
              </span>
            </div>
          </div>

          {loading ? (
            <div className="grid place-items-center py-20">
              <div className="size-6 rounded-full border-2 border-border-subtle border-t-violet-500 animate-spin" />
            </div>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 items-stretch">
              {plans.filter((p) => p.priceEurMonth > 0).map((plan, i, arr) => {
                const soon = !plan.available;
                const featured = plan.id === FEATURED;
                // Relleno de la barra: escalera visual por nivel (no literal).
                const fill = Math.round(((i + 1) / arr.length) * 100);
                const tagline = (TAGLINE_KEYS as readonly string[]).includes(plan.id)
                  ? t(`tagline.${plan.id}` as any)
                  : t('tagline.default');
                return (
                  <div
                    key={plan.id}
                    className={cn(
                      'group relative flex flex-col p-5 sm:p-6 rounded-2xl border transition-all duration-200',
                      featured
                        ? 'border-violet-500/50 bg-gradient-to-b from-violet-500/[0.08] to-bg-surface shadow-[0_0_0_1px_rgba(139,92,246,0.2),0_20px_50px_-12px_rgba(139,92,246,0.35)] lg:-translate-y-3 lg:scale-[1.04] z-10'
                        : 'border-border-faint bg-bg-surface hover:border-violet-500/30 hover:-translate-y-1 hover:shadow-[0_12px_30px_-12px_rgba(0,0,0,0.5)]',
                    )}
                  >
                    {featured && (
                      <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-violet-500 text-white text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap shadow-lg shadow-violet-500/30">
                        {t('recommended')}
                      </div>
                    )}

                    {/* Cabecera */}
                    <div className="flex items-baseline justify-between mb-1">
                      <h3 className="text-sm font-semibold text-text-primary">{plan.label}</h3>
                    </div>
                    <p className="text-[11px] text-text-tertiary mb-4">{tagline}</p>

                    {/* Precio */}
                    <div className="flex items-baseline gap-1 mb-5">
                      <span className={cn('font-mono text-4xl font-bold tracking-tight', featured ? 'text-violet-200' : 'text-text-primary')}>
                        {plan.priceEurMonth}€
                      </span>
                      <span className="text-xs text-text-tertiary">{t('perMonth')}</span>
                    </div>

                    {/* Indicador de almacenamiento */}
                    <div className={cn(
                      'mb-5 p-3 rounded-xl border',
                      featured ? 'bg-violet-500/[0.06] border-violet-500/20' : 'bg-bg-surface-2 border-border-faint',
                    )}>
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-[10px] font-mono uppercase tracking-wider text-text-tertiary">{t('space')}</span>
                        <span className={cn('text-sm font-mono font-bold', featured ? 'text-violet-200' : 'text-text-primary')}>
                          {formatBytes(plan.quotaBytes)}
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full bg-bg-surface-3 overflow-hidden">
                        <div
                          className={cn('h-full rounded-full', featured ? 'bg-violet-400' : 'bg-violet-600/70')}
                          style={{ width: `${fill}%` }}
                        />
                      </div>
                    </div>

                    <div className="flex items-center gap-2 text-xs text-text-tertiary mb-5">
                      <Check className="size-3.5 text-emerald-400 shrink-0" />
                      {t('zeroKnowledge')}
                    </div>

                    <div className="mt-auto">
                      <Button
                        variant={featured ? 'primary' : 'outline'}
                        size="sm"
                        className="w-full"
                        disabled={soon}
                        loading={busy === plan.id}
                        onClick={() => choose(plan)}
                      >
                        {soon ? t('soon') : t('choosePlan')}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {!loading && !billingEnabled && (
            <p className="text-center text-xs text-text-tertiary mt-6">
              {t('billingSoon')}
            </p>
          )}
          <p className="text-center text-xs text-text-tertiary mt-7">
            {t('billingNote')}
          </p>
        </section>

        {/* ─── Franja de confianza ──────────────────────────── */}
        <section className="max-w-5xl mx-auto px-6 py-10">
          <p className="text-center text-sm text-text-tertiary mb-6">
            {t('trust.intro')}
          </p>
          <div className="flex flex-wrap justify-center items-center gap-x-10 gap-y-4">
            {TRUST.map((item) => (
              <div key={item.label} className="flex items-center gap-2 text-text-secondary">
                <item.icon className="size-4 text-violet-300" />
                <span className="text-xs font-mono uppercase tracking-wider">{item.label}</span>
              </div>
            ))}
          </div>
        </section>

        {/* ─── Incluido en todos los planes ─────────────────── */}
        <section className="max-w-4xl mx-auto px-6 py-8">
          <div className="rounded-2xl border border-border-faint bg-bg-surface p-7 md:p-9">
            <h2 className="font-display text-2xl font-light tracking-tight text-center mb-2">
              {t.rich('included.title', {
                emph: (chunks) => <span className="text-gradient-violet font-normal">{chunks}</span>,
              })}
            </h2>
            <p className="text-sm text-text-tertiary text-center mb-8 max-w-md mx-auto">
              {t('included.subtitle')}
            </p>
            <div className="grid sm:grid-cols-2 gap-x-8 gap-y-4">
              {INCLUDED.map((f) => (
                <div key={f.key} className="flex items-center gap-3">
                  <div className="size-8 rounded-lg bg-violet-500/10 border border-violet-500/20 grid place-items-center shrink-0">
                    <f.icon className="size-4 text-violet-300" />
                  </div>
                  <span className="text-sm text-text-secondary">{t(`included.items.${f.key}` as any)}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ─── Especificaciones técnicas (iguales para todos) ─ */}
        <section className="max-w-3xl mx-auto px-6 py-8">
          <h2 className="font-display text-2xl font-light tracking-tight text-center mb-2">
            {t('specs.title')}
          </h2>
          <p className="text-sm text-text-tertiary text-center mb-7">
            {t('specs.subtitle')}{' '}
            <Link href="/security" className="text-violet-300 hover:text-violet-200">{t('specs.viewFull')}</Link>.
          </p>
          <div className="overflow-hidden rounded-xl border border-border-faint bg-bg-surface">
            {SPECS.map((spec, i) => (
              <div
                key={spec.key}
                className={cn(
                  'flex items-center justify-between gap-4 px-5 py-3.5 hover:bg-bg-surface-2 transition-colors',
                  i !== SPECS.length - 1 && 'border-b border-border-faint',
                )}
              >
                <span className="text-sm text-text-secondary">{t(`specs.labels.${spec.key}` as any)}</span>
                <span className="text-xs font-mono text-violet-200 text-right">{spec.value}</span>
              </div>
            ))}
          </div>
        </section>

        {/* ─── Self-host ────────────────────────────────────── */}
        <section className="max-w-4xl mx-auto px-6 py-8">
          <div className="relative overflow-hidden rounded-2xl border border-violet-500/20 bg-bg-surface p-7 md:p-8">
            <div className="absolute inset-0 bg-gradient-to-br from-violet-500/5 via-transparent to-transparent pointer-events-none" />
            <div className="relative flex flex-col md:flex-row items-start md:items-center gap-5">
              <div className="size-11 rounded-xl bg-violet-500/10 border border-violet-500/20 grid place-items-center shrink-0">
                <Server className="size-5 text-violet-300" />
              </div>
              <div className="flex-1">
                <h3 className="font-medium tracking-tight text-lg">{t('selfHost.title')}</h3>
                <p className="text-sm text-text-tertiary leading-relaxed mt-1">
                  {t('selfHost.body')}
                </p>
              </div>
              <a href="https://github.com/RedderLabs/noctcom" target="_blank" rel="noopener noreferrer">
                <Button variant="outline" size="sm" leftIcon={<Github className="size-4" />}>{t('selfHost.cta')}</Button>
              </a>
            </div>
          </div>
        </section>

        {/* ─── FAQ ──────────────────────────────────────────── */}
        <section className="max-w-3xl mx-auto px-6 py-8">
          <h2 className="font-display text-2xl font-light tracking-tight text-center mb-8">
            {t('faq.title')}
          </h2>
          <div className="space-y-3">
            {FAQ_KEYS.map((key) => (
              <details
                key={key}
                className="group rounded-xl border border-border-faint bg-bg-surface p-4 open:border-border-subtle transition-colors"
              >
                <summary className="flex items-center justify-between cursor-pointer list-none text-sm font-medium">
                  {t(`faq.items.${key}.q` as any)}
                  <span className="text-text-tertiary group-open:rotate-45 transition-transform text-lg leading-none">+</span>
                </summary>
                <p className="text-sm text-text-tertiary leading-relaxed mt-3">{t(`faq.items.${key}.a` as any)}</p>
              </details>
            ))}
          </div>
        </section>

        {/* ─── CTA final ────────────────────────────────────── */}
        <section className="max-w-5xl mx-auto px-6 pb-16">
          <div className="relative overflow-hidden rounded-2xl border border-violet-500/20 p-10 md:p-14 text-center">
            <div className="absolute inset-0 pointer-events-none" style={{
              background:
                'radial-gradient(ellipse 60% 60% at 50% 0%, rgba(139,92,246,0.18), transparent 70%),' +
                'radial-gradient(ellipse 50% 50% at 80% 100%, rgba(124,58,237,0.12), transparent 70%),' +
                'var(--color-bg-surface)',
            }} />
            <div className="relative">
              <h3 className="font-display text-3xl md:text-4xl font-light tracking-tight mb-4">
                {t.rich('cta.title', {
                  emph: (chunks) => <span className="text-gradient-violet font-normal">{chunks}</span>,
                })}
              </h3>
              <p className="text-text-secondary mb-8 max-w-lg mx-auto">
                {t('cta.subtitle')}
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Link href="/signup">
                  <Button variant="primary" size="lg" rightIcon={<ArrowRight className="size-4" />}>
                    {t('cta.createAccount')}
                  </Button>
                </Link>
                <Link href="/security">
                  <Button variant="outline" size="lg" leftIcon={<KeyRound className="size-4" />}>
                    {t('cta.howItWorks')}
                  </Button>
                </Link>
              </div>
              <p className="text-xs text-text-tertiary mt-5">
                {t.rich('cta.legal', {
                  terms: (chunks) => <Link href={'/terminos' as any} className="text-violet-300 hover:text-violet-200">{chunks}</Link>,
                  privacy: (chunks) => <Link href={'/privacidad' as any} className="text-violet-300 hover:text-violet-200">{chunks}</Link>,
                })}
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
