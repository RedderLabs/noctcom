'use client';

import { Link } from '@/i18n/navigation';
import { Code2, Shield, Mail, Github, ExternalLink, Activity, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Navbar } from '@/components/ui/Navbar';

export default function AboutPage() {
  return (
    <main className="min-h-screen flex flex-col">
      <Navbar variant="back" />

      <div className="flex-1 max-w-3xl mx-auto px-6 py-12 w-full">
        {/* ─── Header ─────────────────────────────────────────── */}
        <div className="mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-violet-500/20 bg-violet-500/5 mb-4">
            <span className="size-1.5 rounded-full bg-violet-400 animate-pulse" />
            <span className="text-xs text-violet-300 font-medium">Redder Labs · Independiente · Privacidad por diseño</span>
          </div>
          <h1 className="font-display text-4xl md:text-5xl font-light tracking-tight mb-4">
            Detrás de Noctcom hay <span className="text-gradient-violet font-normal">una persona</span>, no una corporación.
          </h1>
          <p className="text-lg text-text-secondary leading-relaxed">
            Noctcom lo construye <strong className="text-text-primary font-medium">Julián Rodríguez</strong>,
            desarrollador autodidacta, bajo la marca <strong className="text-text-primary font-medium">Redder Labs</strong>.
            Sin inversores, sin equipo de marketing, sin reuniones. Solo código y una idea fija:
            que tus datos no sean el producto.
          </p>
        </div>

        {/* ─── Bio ────────────────────────────────────────────── */}
        <Section icon={Code2} title="Cómo llegué aquí">
          <p className="text-text-secondary leading-relaxed mb-4">
            Empecé a programar con 7 años, montando ordenadores por mi cuenta. A los 16 hice mis
            primeras webs. Todo lo demás vino igual: leyendo el código de otros y rompiendo cosas
            hasta entender por qué se rompían.
          </p>
          <blockquote className="border-l-2 border-violet-500/40 pl-4 py-1 text-text-secondary italic">
            «Todo lo que sé lo aprendí leyendo código de otros, rompiendo cosas hasta entender
            por qué se rompían.»
          </blockquote>
          <p className="text-text-tertiary text-sm leading-relaxed mt-4">
            Trabajo en solitario, en mis horas, y me autofinancio. Eso marca el producto: nada
            depende de vender tu atención ni tus datos, porque no hay nadie a quien rendir esas
            cuentas más que a quien lo usa.
          </p>
        </Section>

        {/* ─── Filosofía ──────────────────────────────────────── */}
        <Section icon={Shield} title="Por qué Noctcom funciona así">
          <p className="text-text-secondary leading-relaxed mb-4">
            Todas las herramientas que hago comparten un principio: el procesamiento ocurre en tu
            dispositivo, no en un servidor que te observa. En Xero Trace eso significa que tu
            ubicación es privada, no un producto. En Noctcom significa que tus archivos se cifran
            antes de salir de tu equipo y al servidor solo le llega algo que no sabe abrir.
          </p>
          <p className="text-text-secondary leading-relaxed">
            No es una opción que activas: es la única forma en que está construido. Y como todo lo
            que hago, el código es abierto (AGPL-3.0) para que no tengas que creerme: puedes
            comprobarlo línea a línea.
          </p>
        </Section>

        {/* ─── Redder Labs / otros proyectos ──────────────────── */}
        <Section icon={Activity} title="Otros proyectos de Redder Labs">
          <a
            href="https://xero-trace.com"
            target="_blank"
            rel="noopener noreferrer"
            className="group flex items-start gap-4 p-5 rounded-xl border border-border-faint bg-bg-surface hover:border-border-subtle transition-all"
          >
            <div className="size-10 rounded-lg bg-emerald-500/10 border border-emerald-500/20 grid place-items-center shrink-0">
              <Activity className="size-4 text-emerald-300" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-medium tracking-tight">Xero Trace</h3>
                <ExternalLink className="size-3.5 text-text-muted group-hover:text-text-secondary" />
              </div>
              <p className="text-sm text-text-tertiary leading-relaxed mt-1">
                App de seguridad personal que detecta caídas y accidentes analizando el acelerómetro,
                procesando todo en el dispositivo. «Cuando importan los segundos, no las grabaciones».
              </p>
            </div>
          </a>
        </Section>

        {/* ─── Contacto ───────────────────────────────────────── */}
        <Section icon={Mail} title="Hablemos">
          <div className="grid sm:grid-cols-3 gap-3">
            <a
              href="https://github.com/RedderLabs"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 p-4 rounded-xl border border-border-faint bg-bg-surface hover:border-border-subtle transition-all group"
            >
              <Github className="size-4 text-text-secondary" />
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium block">GitHub</span>
                <span className="text-[10px] text-text-tertiary font-mono">RedderLabs</span>
              </div>
            </a>
            <a
              href="https://x.com/noctcom"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 p-4 rounded-xl border border-border-faint bg-bg-surface hover:border-border-subtle transition-all group"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" className="size-3.5 text-text-secondary">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium block">X</span>
                <span className="text-[10px] text-text-tertiary font-mono">@noctcom</span>
              </div>
            </a>
            <a
              href="mailto:hello@noctcom.com"
              className="flex items-center gap-3 p-4 rounded-xl border border-border-faint bg-bg-surface hover:border-border-subtle transition-all group"
            >
              <Mail className="size-4 text-text-secondary" />
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium block">Email</span>
                <span className="text-[10px] text-text-tertiary font-mono">hello@noctcom.com</span>
              </div>
            </a>
          </div>
          <p className="text-xs text-text-tertiary leading-relaxed mt-4">
            ¿Has encontrado un fallo de seguridad? Repórtalo de forma responsable siguiendo{' '}
            <a
              href="https://github.com/RedderLabs/noctcom/blob/main/SECURITY.md"
              target="_blank"
              rel="noopener noreferrer"
              className="text-violet-300 hover:text-violet-200"
            >
              SECURITY.md
            </a>.
          </p>
        </Section>

        {/* ─── CTA ────────────────────────────────────────────── */}
        <div className="mt-12 p-6 rounded-xl border border-border-subtle bg-bg-surface text-center">
          <h3 className="font-display text-lg font-medium mb-2">Prueba la idea, no la promesa</h3>
          <p className="text-sm text-text-tertiary mb-4 max-w-lg mx-auto">
            1 GB gratis con cifrado zero-knowledge. Sin tarjeta, sin trucos.
          </p>
          <Link href="/signup">
            <Button variant="primary" size="md" rightIcon={<ArrowRight className="size-4" />}>
              Empezar gratis
            </Button>
          </Link>
        </div>
      </div>
    </main>
  );
}

function Section({ icon: Icon, title, children }: { icon: typeof Code2; title: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-text-secondary mb-4">
        <Icon className="size-4 text-violet-300" />
        {title}
      </h2>
      {children}
    </section>
  );
}
