'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Check, ArrowRight, Server } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { Navbar } from '@/components/ui/Navbar';
import { useAuth } from '@/lib/auth-store';
import { fetchPlans, startCheckout, formatBytes, type PublicPlan } from '@/lib/billing';
import { cn } from '@/lib/utils';

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

      <div className="flex-1 max-w-5xl mx-auto px-6 py-12 w-full">
        <div className="text-center mb-12">
          <h1 className="font-display text-4xl md:text-5xl font-light tracking-tight mb-4">
            Pagas por <span className="text-gradient-violet font-normal">espacio</span>, nunca por tus datos.
          </h1>
          <p className="text-lg text-text-secondary max-w-2xl mx-auto leading-relaxed">
            El cifrado zero-knowledge es el mismo en todos los planes. Solo cambia cuánto guardas.
            Y el <strong className="text-text-primary">self-host es siempre gratis</strong>.
          </p>
        </div>

        {loading ? (
          <div className="grid place-items-center py-20">
            <div className="size-6 rounded-full border-2 border-border-subtle border-t-violet-500 animate-spin" />
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {plans.map((plan) => {
              const free = plan.priceEurMonth === 0;
              const soon = !free && !plan.available;
              return (
                <div
                  key={plan.id}
                  className={cn(
                    'flex flex-col p-5 rounded-2xl border bg-bg-surface transition-all',
                    free ? 'border-violet-500/30' : 'border-border-faint hover:border-border-subtle',
                  )}
                >
                  <div className="mb-4">
                    <h3 className="text-sm font-medium text-text-tertiary uppercase tracking-wide">{plan.label}</h3>
                    <div className="mt-2 flex items-baseline gap-1">
                      <span className="font-display text-3xl font-light">
                        {free ? '0€' : `${plan.priceEurMonth}€`}
                      </span>
                      <span className="text-xs text-text-tertiary">/mes</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-text-secondary mb-5">
                    <Check className="size-4 text-violet-300 shrink-0" />
                    {formatBytes(plan.quotaBytes)} cifrados
                  </div>
                  <div className="mt-auto">
                    <Button
                      variant={free ? 'primary' : 'outline'}
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

        {/* Self-host */}
        <div className="mt-12 p-6 rounded-2xl border border-border-subtle bg-bg-surface">
          <div className="flex flex-col md:flex-row items-start md:items-center gap-4">
            <div className="size-10 rounded-lg bg-emerald-500/10 border border-emerald-500/20 grid place-items-center shrink-0">
              <Server className="size-4 text-emerald-300" />
            </div>
            <div className="flex-1">
              <h3 className="font-medium tracking-tight">¿Prefieres tu propio servidor?</h3>
              <p className="text-sm text-text-tertiary leading-relaxed mt-1">
                Noctcom es open source (AGPL-3.0). Despliégalo en tu hardware con un comando Docker:
                mismo cifrado, capacidad ilimitada, cero coste. Tu nube, tus reglas.
              </p>
            </div>
            <Link href="/about">
              <Button variant="ghost" size="sm" rightIcon={<ArrowRight className="size-4" />}>Saber más</Button>
            </Link>
          </div>
        </div>

        <p className="text-center text-xs text-text-tertiary mt-8">
          Precios con impuestos aplicables según tu país. Consulta los{' '}
          <Link href={'/terminos' as any} className="text-violet-300 hover:text-violet-200">Términos</Link>.
        </p>
      </div>
    </main>
  );
}
