'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { Lock, Shield, EyeOff, AtSign, Share2, ArrowRight, Server, Download, Github, Newspaper, Megaphone, Scale, FileSignature } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Navbar } from '@/components/ui/Navbar';
import { SecurityDemo } from '@/components/landing/SecurityDemo';

// Renderers compartidos para los textos con énfasis (t.rich).
const strong = (c: ReactNode) => <strong className="text-text-primary font-medium">{c}</strong>;
const em = (c: ReactNode) => <em>{c}</em>;
const hl = (c: ReactNode) => <span className="text-gradient-violet font-normal">{c}</span>;

const FEATURES = [
  { key: 'zk', icon: Lock },
  { key: 'metadata', icon: EyeOff },
  { key: 'email', icon: AtSign },
  { key: 'share', icon: Share2 },
] as const;

const AUDIENCE = [
  { key: 'journalism', icon: Newspaper },
  { key: 'sources', icon: Megaphone },
  { key: 'professional', icon: FileSignature },
  { key: 'jurisdiction', icon: Scale },
] as const;

const WHY_SELFHOST = [
  { key: 'control', icon: Server },
  { key: 'auditable', icon: Shield },
  { key: 'sameCrypto', icon: Lock },
] as const;

export default function LandingPage() {
  const t = useTranslations('landing');
  const tf = useTranslations('footer');
  const version = process.env.NEXT_PUBLIC_APP_VERSION ?? '';
  const builtAt = process.env.NEXT_PUBLIC_BUILT_AT ?? '';

  return (
    <main className="relative min-h-screen flex flex-col">
      <Navbar variant="landing" />

      {/* ─── Hero ───────────────────────────────────────────── */}
      <section className="flex-1 flex items-center px-6 py-24">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-violet-500/20 bg-violet-500/5 mb-8">
            <span className="size-1.5 rounded-full bg-violet-400 animate-pulse" />
            <span className="text-xs text-violet-300 font-medium">{t('hero.badge')}</span>
          </div>

          <h1 className="font-display text-6xl md:text-7xl font-light tracking-tight mb-6 leading-[1.05]">
            {t('hero.titleLine1')}
            <br />
            <span className="text-gradient-violet font-normal">{t('hero.titleLine2')}</span>
          </h1>

          <p className="text-lg text-text-secondary max-w-xl mx-auto mb-10 leading-relaxed">
            {t.rich('hero.subtitle', { strong })}
          </p>

          <div className="flex items-center justify-center gap-3 flex-wrap">
            <Link href="/signup">
              <Button variant="primary" size="lg" rightIcon={<ArrowRight className="size-4" />}>
                {t('hero.ctaStart')}
              </Button>
            </Link>
            <Link href="/login">
              <Button variant="outline" size="lg">{t('hero.ctaHaveAccount')}</Button>
            </Link>
          </div>
        </div>
      </section>

      {/* ─── Features ───────────────────────────────────────── */}
      <section className="px-6 pb-24">
        <div className="max-w-5xl mx-auto grid md:grid-cols-2 lg:grid-cols-4 gap-4">
          {FEATURES.map(({ key, icon: Icon }) => (
            <div
              key={key}
              className="group relative p-5 rounded-xl border border-border-faint bg-bg-surface hover:border-border-subtle transition-all duration-200"
            >
              <div className="size-9 rounded-lg bg-violet-500/10 border border-violet-500/20 grid place-items-center mb-4 group-hover:bg-violet-500/15 transition-colors">
                <Icon className="size-4 text-violet-300" />
              </div>
              <h3 className="font-medium mb-1.5 tracking-tight">{t(`features.${key}.title`)}</h3>
              <p className="text-sm text-text-tertiary leading-relaxed">{t(`features.${key}.body`)}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ─── Demo en vídeo: la prueba de seguridad ──────────── */}
      <section className="px-6 pb-24">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-8">
            <h2 className="font-display text-2xl md:text-3xl font-light tracking-tight mb-3">
              {t.rich('demo.title', { hl })}
            </h2>
            <p className="text-text-secondary max-w-2xl mx-auto leading-relaxed">
              {t('demo.subtitle')}
            </p>
          </div>
          <SecurityDemo />
        </div>
      </section>

      {/* ─── Foco: lo que no hacemos ────────────────────────── */}
      <section className="px-6 pb-24">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="font-display text-2xl md:text-3xl font-light tracking-tight mb-4">
            {t.rich('notDo.title', { hl })}
          </h2>
          <p className="text-text-secondary leading-relaxed">
            {t.rich('notDo.body', { strong, em })}
          </p>
          <p className="text-sm text-text-tertiary leading-relaxed mt-5">
            {t('notDo.note')}
          </p>
        </div>
      </section>

      {/* ─── ¿Para quién? ───────────────────────────────────── */}
      <section className="px-6 pb-24">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="font-display text-2xl md:text-3xl font-light tracking-tight mb-4">
              {t.rich('audience.title', { hl })}
            </h2>
            <p className="text-text-secondary max-w-2xl mx-auto leading-relaxed">
              {t.rich('audience.subtitle', { strong })}
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
            {AUDIENCE.map(({ key, icon: Icon }) => (
              <div
                key={key}
                className="group relative p-5 rounded-xl border border-border-faint bg-bg-surface hover:border-border-subtle transition-all duration-200"
              >
                <div className="size-9 rounded-lg bg-violet-500/10 border border-violet-500/20 grid place-items-center mb-4 group-hover:bg-violet-500/15 transition-colors">
                  <Icon className="size-4 text-violet-300" />
                </div>
                <h3 className="font-medium mb-1.5 tracking-tight">{t(`audience.cards.${key}.title`)}</h3>
                <p className="text-sm text-text-tertiary leading-relaxed">{t(`audience.cards.${key}.body`)}</p>
              </div>
            ))}
          </div>

          {/* Nota honesta: lo que viene + el modelo de amenaza real */}
          <div className="mt-6 rounded-xl border border-border-faint bg-bg-surface p-5 md:p-6">
            <p className="text-sm text-text-secondary leading-relaxed">
              {t.rich('audience.roadmapNote', {
                hl: (c) => <span className="text-violet-300 font-medium">{c}</span>,
                em,
              })}
            </p>
            <p className="text-xs text-text-tertiary leading-relaxed mt-3">
              {t.rich('audience.honestyNote', { em })}
            </p>
          </div>
        </div>
      </section>

      {/* ─── Self-Host ──────────────────────────────────────── */}
      <section className="px-6 pb-24">
        <div className="max-w-4xl mx-auto">
          <div className="relative overflow-hidden rounded-2xl border border-border-subtle bg-bg-surface p-8 md:p-12">
            <div className="absolute inset-0 bg-gradient-to-br from-violet-500/5 via-transparent to-violet-500/5 pointer-events-none" />
            <div className="relative flex flex-col md:flex-row gap-8 items-center">
              <div className="flex-1">
                <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md bg-violet-500/10 border border-violet-500/20 mb-4">
                  <Server className="size-3.5 text-violet-300" />
                  <span className="text-xs text-violet-300 font-medium">{t('selfhost.badge')}</span>
                </div>
                <h2 className="font-display text-2xl md:text-3xl font-light tracking-tight mb-3">
                  {t('selfhost.title')}
                </h2>
                <p className="text-text-secondary leading-relaxed mb-6">
                  {t('selfhost.body')}
                </p>
                <div className="flex flex-wrap gap-3">
                  <Button
                    variant="primary"
                    size="md"
                    leftIcon={<Download className="size-4" />}
                    onClick={() => {}}
                  >
                    {t('selfhost.download', { version })}
                  </Button>
                  <Button
                    variant="outline"
                    size="md"
                    leftIcon={<Github className="size-4" />}
                    onClick={() => {}}
                  >
                    {t('selfhost.github')}
                  </Button>
                </div>
              </div>
              <div className="w-full md:w-80 shrink-0">
                <div className="rounded-lg bg-bg-deep border border-border-faint p-4 font-mono text-xs leading-relaxed">
                  <p className="text-text-muted">{t('selfhost.deployComment')}</p>
                  <p className="text-violet-300 mt-1">git clone https://github.com/</p>
                  <p className="text-violet-300">  RedderLabs/noctcom.git</p>
                  <p className="text-text-secondary mt-2">cd noctcom</p>
                  <p className="text-text-secondary">cp .env.example .env</p>
                  <p className="text-violet-300 mt-2">docker compose up -d</p>
                  <p className="text-text-muted mt-2">{t('selfhost.readyComment')}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Self-host features ─────────────────────────────── */}
      <section className="px-6 pb-24">
        <div className="max-w-5xl mx-auto">
          <h2 className="font-display text-2xl font-light tracking-tight text-center mb-8">
            {t('whySelfhost.title')}
          </h2>
          <div className="grid md:grid-cols-3 gap-4">
            {WHY_SELFHOST.map(({ key, icon: Icon }) => (
              <div
                key={key}
                className="p-5 rounded-xl border border-border-faint bg-bg-surface hover:border-border-subtle transition-all"
              >
                <div className="size-9 rounded-lg bg-violet-500/10 border border-violet-500/20 grid place-items-center mb-4">
                  <Icon className="size-4 text-violet-300" />
                </div>
                <h3 className="font-medium mb-1.5 tracking-tight">{t(`whySelfhost.cards.${key}.title`)}</h3>
                <p className="text-sm text-text-tertiary leading-relaxed">{t(`whySelfhost.cards.${key}.body`)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t border-border-faint py-6">
        <div className="max-w-6xl mx-auto px-6 text-xs text-text-tertiary flex justify-between items-center">
          <div className="flex items-center gap-4">
            <span>© {new Date().getFullYear()} Noctcom · AGPL-3.0</span>
            <Link href="/about" className="hover:text-text-secondary transition-colors">
              {tf('about')}
            </Link>
            <Link href="/security" className="hover:text-text-secondary transition-colors">
              {tf('security')}
            </Link>
            <Link href="/roadmap" className="hover:text-text-secondary transition-colors">
              {tf('roadmap')}
            </Link>
            <Link href={'/precios' as any} className="hover:text-text-secondary transition-colors">
              {tf('pricing')}
            </Link>
            <Link href={'/terminos' as any} className="hover:text-text-secondary transition-colors">
              {tf('terms')}
            </Link>
            <Link href={'/privacidad' as any} className="hover:text-text-secondary transition-colors">
              {tf('privacy')}
            </Link>
            <Link href={'/cookies' as any} className="hover:text-text-secondary transition-colors">
              {tf('cookies')}
            </Link>
            <a
              href="https://x.com/noctcom"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-text-secondary transition-colors"
              aria-label={tf('xLabel')}
            >
              <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
            </a>
          </div>
          <span className="font-mono text-[10px]">
            {tf('version', { version, builtAt })}
          </span>
        </div>
      </footer>
    </main>
  );
}
