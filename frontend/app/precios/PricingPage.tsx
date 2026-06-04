'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Check, ArrowRight, Server, Lock, EyeOff, Share2, Smartphone,
  Download, Github, ShieldCheck, Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { Navbar } from '@/components/ui/Navbar';
import { useAuth } from '@/lib/auth-store';
import { fetchPlans, startCheckout, formatBytes, type PublicPlan } from '@/lib/billing';
import { cn } from '@/lib/utils';

// Plan destacado visualmente (mejor relación espacio/precio).
const FEATURED = 'pro';

// Todo lo que incluye CUALQUIER plan (el cifrado no cambia, solo el espacio).
const INCLUDED = [
  { icon: Lock, text: 'Cifrado zero-knowledge de extremo a extremo' },
  { icon: EyeOff, text: 'Nombres y metadatos también cifrados' },
  { icon: Share2, text: 'Compartir cifrado: solo el destinatario abre' },
  { icon: Smartphone, text: 'Multidispositivo y sincronización en tiempo real' },
  { icon: Download, text: 'Exporta tu bóveda completa cuando quieras' },
  { icon: ShieldCheck, text: '2FA: passkeys y código por email' },
];

const FAQ = [
  {
    q: '¿Puedo cambiar de plan cuando quiera?',
    a: 'Sí, al instante. Stripe prorratea la diferencia automáticamente, sin penalizaciones.',
  },
  {
    q: '¿Qué pasa si cancelo?',
    a: 'Vuelves al plan gratuito de 1 GB. No borramos nada: conservas tus archivos y puedes descargarlos o exportarlos. Si superas la cuota gratuita, la cuenta queda en solo lectura hasta que liberes espacio.',
  },
  {
    q: '¿El espacio es de mis archivos o del cifrado?',
    a: 'Medimos el tamaño cifrado almacenado, que es prácticamente igual al original (el cifrado añade unos pocos bytes por bloque).',
  },
  {
    q: '¿Es seguro pagar?',
    a: 'El pago lo gestiona Stripe de principio a fin; Noctcom nunca ve los datos de tu tarjeta. Y como siempre, tus archivos siguen siendo ilegibles para nosotros.',
  },
  {
    q: '¿Y si prefiero mi propio servidor?',
    a: 'El self-host es gratis para siempre bajo AGPL-3.0: mismo cifrado, capacidad ilimitada, cero coste. Pagas solo si usas nuestra infraestructura gestionada.',
  },
];

export default function PricingPage() {
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
      await startCheckout(plan.id);
    } catch (err: any) {
      toast.error(err?.message ?? 'No se pudo iniciar el pago');
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
            <span className="text-xs text-violet-300 font-medium">Mismo cifrado en todos los planes</span>
          </div>
          <h1 className="font-display text-4xl md:text-6xl font-light tracking-tight mb-5 leading-[1.05]">
            Pagas por <span className="text-gradient-violet font-normal">espacio</span>,<br />
            nunca por tus datos.
          </h1>
          <p className="text-lg text-text-secondary max-w-xl mx-auto leading-relaxed">
            El cifrado zero-knowledge es idéntico en cada plan. Solo cambia cuánto guardas.
            Empieza gratis con 1 GB; amplía cuando lo necesites. Cancela cuando quieras.
          </p>
        </section>

        {/* ─── Planes ───────────────────────────────────────── */}
        <section className="max-w-6xl mx-auto px-6 pb-10">
          {loading ? (
            <div className="grid place-items-center py-20">
              <div className="size-6 rounded-full border-2 border-border-subtle border-t-violet-500 animate-spin" />
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3 items-stretch">
              {plans.map((plan) => {
                const free = plan.priceEurMonth === 0;
                const soon = !free && !plan.available;
                const featured = plan.id === FEATURED;
                return (
                  <div
                    key={plan.id}
                    className={cn(
                      'relative flex flex-col p-5 rounded-2xl border bg-bg-surface transition-all duration-200',
                      featured
                        ? 'border-violet-500/50 shadow-[0_0_0_1px_rgba(139,92,246,0.2),0_18px_50px_-12px_rgba(139,92,246,0.35)] lg:-translate-y-2 lg:scale-[1.03] z-10'
                        : 'border-border-faint hover:border-border-subtle hover:-translate-y-0.5',
                    )}
                  >
                    {featured && (
                      <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-2.5 py-0.5 rounded-full bg-violet-500 text-white text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap">
                        Recomendado
                      </div>
                    )}
                    <div className="mb-4">
                      <h3 className="text-xs font-medium text-text-tertiary uppercase tracking-wide">{plan.label}</h3>
                      <div className="mt-2 flex items-baseline gap-1">
                        <span className={cn('font-display text-3xl font-light', featured && 'text-violet-200')}>
                          {free ? '0€' : `${plan.priceEurMonth}€`}
                        </span>
                        <span className="text-xs text-text-tertiary">/mes</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 text-sm font-medium mb-1">
                      <Check className={cn('size-4 shrink-0', featured ? 'text-violet-300' : 'text-emerald-400')} />
                      {formatBytes(plan.quotaBytes)}
                    </div>
                    <p className="text-xs text-text-tertiary mb-5 pl-6">cifrados zero-knowledge</p>

                    <div className="mt-auto">
                      <Button
                        variant={free || featured ? 'primary' : 'outline'}
                        size="sm"
                        className="w-full"
                        disabled={soon}
                        loading={busy === plan.id}
                        onClick={() => choose(plan)}
                      >
                        {free ? 'Empezar gratis' : soon ? 'Próximamente' : 'Elegir plan'}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {!loading && !billingEnabled && (
            <p className="text-center text-xs text-text-tertiary mt-6">
              Los planes de pago se activan en breve. Mientras tanto, empieza gratis con 1 GB.
            </p>
          )}
          <p className="text-center text-xs text-text-tertiary mt-6">
            Sin permanencia · Cambia o cancela cuando quieras · Impuestos aplicables según tu país
          </p>
        </section>

        {/* ─── Incluido en todos los planes ─────────────────── */}
        <section className="max-w-4xl mx-auto px-6 py-12">
          <div className="rounded-2xl border border-border-faint bg-bg-surface p-7 md:p-9">
            <h2 className="font-display text-2xl font-light tracking-tight text-center mb-2">
              Incluido en <span className="text-gradient-violet font-normal">todos</span> los planes
            </h2>
            <p className="text-sm text-text-tertiary text-center mb-8 max-w-md mx-auto">
              La privacidad no es un extra que se paga aparte. Es la base, igual para todos.
            </p>
            <div className="grid sm:grid-cols-2 gap-x-8 gap-y-4">
              {INCLUDED.map((f) => (
                <div key={f.text} className="flex items-center gap-3">
                  <div className="size-8 rounded-lg bg-violet-500/10 border border-violet-500/20 grid place-items-center shrink-0">
                    <f.icon className="size-4 text-violet-300" />
                  </div>
                  <span className="text-sm text-text-secondary">{f.text}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ─── Self-host ────────────────────────────────────── */}
        <section className="max-w-4xl mx-auto px-6 pb-12">
          <div className="relative overflow-hidden rounded-2xl border border-emerald-500/20 bg-bg-surface p-7 md:p-8">
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 via-transparent to-transparent pointer-events-none" />
            <div className="relative flex flex-col md:flex-row items-start md:items-center gap-5">
              <div className="size-11 rounded-xl bg-emerald-500/10 border border-emerald-500/20 grid place-items-center shrink-0">
                <Server className="size-5 text-emerald-300" />
              </div>
              <div className="flex-1">
                <h3 className="font-medium tracking-tight text-lg">¿Prefieres tu propio servidor? Es gratis.</h3>
                <p className="text-sm text-text-tertiary leading-relaxed mt-1">
                  Noctcom es open source (AGPL-3.0). Despliégalo en tu hardware con un comando Docker:
                  mismo cifrado, capacidad ilimitada, cero coste. Tu nube, tus reglas.
                </p>
              </div>
              <a href="https://github.com/RedderLabs/noctcom" target="_blank" rel="noopener noreferrer">
                <Button variant="outline" size="sm" leftIcon={<Github className="size-4" />}>Ver en GitHub</Button>
              </a>
            </div>
          </div>
        </section>

        {/* ─── FAQ ──────────────────────────────────────────── */}
        <section className="max-w-3xl mx-auto px-6 pb-16">
          <h2 className="font-display text-2xl font-light tracking-tight text-center mb-8">
            Preguntas frecuentes
          </h2>
          <div className="space-y-3">
            {FAQ.map((item) => (
              <details
                key={item.q}
                className="group rounded-xl border border-border-faint bg-bg-surface p-4 open:border-border-subtle transition-colors"
              >
                <summary className="flex items-center justify-between cursor-pointer list-none text-sm font-medium">
                  {item.q}
                  <span className="text-text-tertiary group-open:rotate-45 transition-transform text-lg leading-none">+</span>
                </summary>
                <p className="text-sm text-text-tertiary leading-relaxed mt-3">{item.a}</p>
              </details>
            ))}
          </div>

          <div className="mt-10 text-center">
            <Link href="/signup">
              <Button variant="primary" size="lg" rightIcon={<ArrowRight className="size-4" />}>
                Empezar gratis con 1 GB
              </Button>
            </Link>
            <p className="text-xs text-text-tertiary mt-3">
              Sin tarjeta. Lee los{' '}
              <Link href={'/terminos' as any} className="text-violet-300 hover:text-violet-200">Términos</Link>{' '}y la{' '}
              <Link href={'/privacidad' as any} className="text-violet-300 hover:text-violet-200">Privacidad</Link>.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
