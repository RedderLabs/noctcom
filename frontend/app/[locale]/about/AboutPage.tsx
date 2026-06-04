'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { Code2, Shield, Mail, Github, ExternalLink, Activity, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Navbar } from '@/components/ui/Navbar';

export default function AboutPage() {
  const t = useTranslations('about');
  return (
    <main className="min-h-screen flex flex-col">
      <Navbar variant="back" />

      <div className="flex-1 max-w-3xl mx-auto px-6 py-12 w-full">
        {/* ─── Header ─────────────────────────────────────────── */}
        <div className="mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-violet-500/20 bg-violet-500/5 mb-4">
            <span className="size-1.5 rounded-full bg-violet-400 animate-pulse" />
            <span className="text-xs text-violet-300 font-medium">{t('badge')}</span>
          </div>
          <h1 className="font-display text-4xl md:text-5xl font-light tracking-tight mb-4">
            {t.rich('title', { hl: (c) => <span className="text-gradient-violet font-normal">{c}</span> })}
          </h1>
          <p className="text-lg text-text-secondary leading-relaxed">
            {t.rich('intro', { strong: (c) => <strong className="text-text-primary font-medium">{c}</strong> })}
          </p>
        </div>

        {/* ─── Bio ────────────────────────────────────────────── */}
        <Section icon={Code2} title={t('bio.title')}>
          <p className="text-text-secondary leading-relaxed mb-4">
            {t('bio.p1')}
          </p>
          <blockquote className="border-l-2 border-violet-500/40 pl-4 py-1 text-text-secondary italic">
            {t('bio.quote')}
          </blockquote>
          <p className="text-text-tertiary text-sm leading-relaxed mt-4">
            {t('bio.p2')}
          </p>
        </Section>

        {/* ─── Filosofía ──────────────────────────────────────── */}
        <Section icon={Shield} title={t('philosophy.title')}>
          <p className="text-text-secondary leading-relaxed mb-4">
            {t('philosophy.p1')}
          </p>
          <p className="text-text-secondary leading-relaxed">
            {t('philosophy.p2')}
          </p>
        </Section>

        {/* ─── Redder Labs / otros proyectos ──────────────────── */}
        <Section icon={Activity} title={t('projects.title')}>
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
                {t('projects.xeroTrace')}
              </p>
            </div>
          </a>
        </Section>

        {/* ─── Contacto ───────────────────────────────────────── */}
        <Section icon={Mail} title={t('contact.title')}>
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
                <span className="text-sm font-medium block">{t('contact.email')}</span>
                <span className="text-[10px] text-text-tertiary font-mono">hello@noctcom.com</span>
              </div>
            </a>
          </div>
          <p className="text-xs text-text-tertiary leading-relaxed mt-4">
            {t.rich('contact.security', {
              link: (c) => (
                <a
                  href="https://github.com/RedderLabs/noctcom/blob/main/SECURITY.md"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-violet-300 hover:text-violet-200"
                >
                  {c}
                </a>
              ),
            })}
          </p>
        </Section>

        {/* ─── CTA ────────────────────────────────────────────── */}
        <div className="mt-12 p-6 rounded-xl border border-border-subtle bg-bg-surface text-center">
          <h3 className="font-display text-lg font-medium mb-2">{t('cta.title')}</h3>
          <p className="text-sm text-text-tertiary mb-4 max-w-lg mx-auto">
            {t('cta.subtitle')}
          </p>
          <Link href="/signup">
            <Button variant="primary" size="md" rightIcon={<ArrowRight className="size-4" />}>
              {t('cta.button')}
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
