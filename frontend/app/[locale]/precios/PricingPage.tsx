'use client';

import { useEffect, useState } from 'react';
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

// Descriptores cortos por plan (neutros, sin claims sin datos).
const TAGLINE: Record<string, string> = {
  starter: 'Uso personal',
  plus: 'El día a día',
  pro: 'Profesional',
  max: 'Sin pensar en el espacio',
};

// Todo lo que incluye CUALQUIER plan (el cifrado no cambia, solo el espacio).
const INCLUDED = [
  { icon: Lock, text: 'Cifrado zero-knowledge de extremo a extremo' },
  { icon: EyeOff, text: 'Nombres y metadatos también cifrados' },
  { icon: Share2, text: 'Compartir cifrado: solo el destinatario abre' },
  { icon: Smartphone, text: 'Multidispositivo y sincronización en tiempo real' },
  { icon: Download, text: 'Exporta tu bóveda completa cuando quieras' },
  { icon: ShieldCheck, text: '2FA: passkeys y código por email' },
];

// Franja de confianza — solo afirmaciones verdaderas.
const TRUST = [
  { icon: Code2, label: 'Open Source · AGPL-3.0' },
  { icon: Lock, label: 'XChaCha20-Poly1305' },
  { icon: Fingerprint, label: 'Argon2id' },
  { icon: ShieldCheck, label: 'Zero-Knowledge' },
];

// Especificaciones técnicas — IDÉNTICAS en todos los planes (ese es el punto).
const SPECS: [string, string][] = [
  ['Derivación de clave', 'Argon2id · 256 MiB'],
  ['Cifrado de archivos', 'XChaCha20-Poly1305 (AEAD)'],
  ['Firmas', 'Ed25519'],
  ['Compartir', 'X25519 · sealed boxes'],
  ['Hash', 'BLAKE2b-256'],
  ['Recuperación', 'Frase BIP39 (128 bits)'],
  ['2FA', 'Passkeys (WebAuthn) + email'],
  ['Licencia', 'AGPL-3.0 · auditable'],
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
      const res = await startCheckout(plan.id);
      // Cambio de plan sobre una suscripción ya activa (sin redirección a Stripe).
      if (res.updated) {
        toast.success(res.unchanged ? 'Ya tienes este plan' : `Plan actualizado a ${plan.label}`);
        router.push('/vault/settings');
        return;
      }
      // Si había url, el navegador ya está redirigiendo a Stripe.
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

        {/* ─── Planes (solo de pago: el gratis es el punto de partida) ─ */}
        <section className="max-w-5xl mx-auto px-6 pb-4">
          <div className="flex justify-center mb-7">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/5">
              <Check className="size-3.5 text-emerald-400" />
              <span className="text-xs text-text-secondary">Todas las cuentas empiezan con <strong className="text-text-primary">1 GB gratis</strong>. Amplía cuando lo necesites.</span>
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
                        Recomendado
                      </div>
                    )}

                    {/* Cabecera */}
                    <div className="flex items-baseline justify-between mb-1">
                      <h3 className="text-sm font-semibold text-text-primary">{plan.label}</h3>
                    </div>
                    <p className="text-[11px] text-text-tertiary mb-4">{TAGLINE[plan.id] ?? 'Almacenamiento cifrado'}</p>

                    {/* Precio */}
                    <div className="flex items-baseline gap-1 mb-5">
                      <span className={cn('font-mono text-4xl font-bold tracking-tight', featured ? 'text-violet-200' : 'text-text-primary')}>
                        {plan.priceEurMonth}€
                      </span>
                      <span className="text-xs text-text-tertiary">/mes</span>
                    </div>

                    {/* Indicador de almacenamiento */}
                    <div className={cn(
                      'mb-5 p-3 rounded-xl border',
                      featured ? 'bg-violet-500/[0.06] border-violet-500/20' : 'bg-bg-surface-2 border-border-faint',
                    )}>
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-[10px] font-mono uppercase tracking-wider text-text-tertiary">Espacio</span>
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
                      Cifrado zero-knowledge
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
                        {soon ? 'Próximamente' : 'Elegir plan'}
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
          <p className="text-center text-xs text-text-tertiary mt-7">
            Facturación mensual · Sin permanencia · Impuestos aplicables según tu país
          </p>
        </section>

        {/* ─── Franja de confianza ──────────────────────────── */}
        <section className="max-w-5xl mx-auto px-6 py-10">
          <p className="text-center text-sm text-text-tertiary mb-6">
            Tus claves nunca salen de tu dispositivo. Todo el código es público y verificable.
          </p>
          <div className="flex flex-wrap justify-center items-center gap-x-10 gap-y-4">
            {TRUST.map((t) => (
              <div key={t.label} className="flex items-center gap-2 text-text-secondary">
                <t.icon className="size-4 text-violet-300" />
                <span className="text-xs font-mono uppercase tracking-wider">{t.label}</span>
              </div>
            ))}
          </div>
        </section>

        {/* ─── Incluido en todos los planes ─────────────────── */}
        <section className="max-w-4xl mx-auto px-6 py-8">
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

        {/* ─── Especificaciones técnicas (iguales para todos) ─ */}
        <section className="max-w-3xl mx-auto px-6 py-8">
          <h2 className="font-display text-2xl font-light tracking-tight text-center mb-2">
            Especificaciones técnicas
          </h2>
          <p className="text-sm text-text-tertiary text-center mb-7">
            La misma criptografía, pagues lo que pagues.{' '}
            <Link href="/security" className="text-violet-300 hover:text-violet-200">Ver la spec completa</Link>.
          </p>
          <div className="overflow-hidden rounded-xl border border-border-faint bg-bg-surface">
            {SPECS.map(([k, v], i) => (
              <div
                key={k}
                className={cn(
                  'flex items-center justify-between gap-4 px-5 py-3.5 hover:bg-bg-surface-2 transition-colors',
                  i !== SPECS.length - 1 && 'border-b border-border-faint',
                )}
              >
                <span className="text-sm text-text-secondary">{k}</span>
                <span className="text-xs font-mono text-violet-200 text-right">{v}</span>
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
        <section className="max-w-3xl mx-auto px-6 py-8">
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
                Empieza hoy con <span className="text-gradient-violet font-normal">1 GB gratis</span>.
              </h3>
              <p className="text-text-secondary mb-8 max-w-lg mx-auto">
                Sin tarjeta, sin trucos. Cifrado en tu dispositivo desde el primer archivo.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Link href="/signup">
                  <Button variant="primary" size="lg" rightIcon={<ArrowRight className="size-4" />}>
                    Crear cuenta gratis
                  </Button>
                </Link>
                <Link href="/security">
                  <Button variant="outline" size="lg" leftIcon={<KeyRound className="size-4" />}>
                    Cómo funciona el cifrado
                  </Button>
                </Link>
              </div>
              <p className="text-xs text-text-tertiary mt-5">
                Al crear la cuenta aceptas los{' '}
                <Link href={'/terminos' as any} className="text-violet-300 hover:text-violet-200">Términos</Link>{' '}y la{' '}
                <Link href={'/privacidad' as any} className="text-violet-300 hover:text-violet-200">Privacidad</Link>.
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
