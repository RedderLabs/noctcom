'use client';

import { Map, Check, Loader2, Sparkles, Github } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/Button';
import { Navbar } from '@/components/ui/Navbar';
import { cn } from '@/lib/utils';

type Status = 'done' | 'progress' | 'next';

const MILESTONES: { status: Status; key: string }[] = [
  // ─── Ya funciona ───
  { status: 'done', key: 'crypto-core' },
  { status: 'done', key: 'accounts-access' },
  { status: 'done', key: 'encrypted-files' },
  { status: 'done', key: 'file-preview' },
  { status: 'done', key: 'e2e-sharing' },
  { status: 'done', key: 'multi-device' },
  { status: 'done', key: 'realtime-sync' },
  { status: 'done', key: 'account-recovery' },
  { status: 'done', key: 'notifications' },
  { status: 'done', key: 'own-disks' },
  { status: 'done', key: 'ops-reliability' },
  { status: 'done', key: 'legal-privacy' },
  { status: 'done', key: 'light-dark-theme' },
  { status: 'done', key: 'i18n' },
  // ─── En marcha ───
  { status: 'progress', key: 'storage-plans' },
  // ─── Más adelante ───
  { status: 'next', key: 'independent-audit' },
  { status: 'next', key: 'evidence-mode' },
  { status: 'next', key: 'mobile-app' },
  { status: 'next', key: 'desktop-app' },
];

const GROUPS: { status: Status; icon: typeof Check; accent: string; iconBox: string; dot: string }[] = [
  { status: 'done', icon: Check, accent: 'text-emerald-300', iconBox: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300', dot: 'bg-emerald-400' },
  { status: 'progress', icon: Loader2, accent: 'text-amber-300', iconBox: 'bg-amber-500/10 border-amber-500/20 text-amber-300', dot: 'bg-amber-400' },
  { status: 'next', icon: Sparkles, accent: 'text-violet-300', iconBox: 'bg-violet-500/10 border-violet-500/20 text-violet-300', dot: 'bg-violet-400' },
];

export default function RoadmapPage() {
  const t = useTranslations('roadmap');
  return (
    <main className="min-h-screen flex flex-col">
      <Navbar variant="back" />

      <div className="flex-1 max-w-3xl mx-auto px-6 py-12 w-full">
        {/* Header */}
        <div className="mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-violet-500/20 bg-violet-500/5 mb-4">
            <Map className="size-3.5 text-violet-300" />
            <span className="text-xs text-violet-300 font-medium">{t('badge')}</span>
          </div>
          <h1 className="font-display text-4xl font-light tracking-tight mb-3">{t('heading')}</h1>
          <p className="text-text-secondary leading-relaxed max-w-2xl">
            {t('intro')}
          </p>
        </div>

        {/* Grupos */}
        <div className="space-y-10">
          {GROUPS.map((g) => {
            const items = MILESTONES.filter((m) => m.status === g.status);
            const GroupIcon = g.icon;
            return (
              <section key={g.status}>
                <div className="flex items-center gap-2.5 mb-4">
                  <span className={cn('size-2.5 rounded-full', g.dot)} />
                  <h2 className="text-sm font-semibold uppercase tracking-wider text-text-secondary">
                    {t(`status.${g.status}`)}
                  </h2>
                  <span className="text-xs text-text-muted font-mono">{items.length}</span>
                </div>

                <div className="grid sm:grid-cols-2 gap-3">
                  {items.map((m) => (
                    <div
                      key={m.key}
                      className="flex gap-3 p-4 rounded-xl border border-border-faint bg-bg-surface hover:border-border-subtle transition-colors"
                    >
                      <div className={cn('size-8 rounded-lg grid place-items-center shrink-0 border', g.iconBox)}>
                        <GroupIcon className="size-4" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-sm font-medium text-text-primary mb-0.5">{t(`items.${m.key}.title`)}</h3>
                        <p className="text-xs text-text-tertiary leading-relaxed">{t(`items.${m.key}.desc`)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
        </div>

        {/* CTA */}
        <div className="mt-12 p-6 rounded-xl border border-border-subtle bg-bg-surface text-center">
          <h3 className="font-display text-lg font-medium mb-2">{t('cta.title')}</h3>
          <p className="text-sm text-text-tertiary mb-4 max-w-lg mx-auto">
            {t('cta.desc')}
          </p>
          <a href="https://github.com/RedderLabs/noctcom" target="_blank" rel="noopener noreferrer">
            <Button variant="outline" size="md" leftIcon={<Github className="size-4" />}>
              {t('cta.button')}
            </Button>
          </a>
        </div>
      </div>
    </main>
  );
}
