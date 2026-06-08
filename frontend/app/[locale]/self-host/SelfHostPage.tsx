'use client';

import { useState, useEffect } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Server } from 'lucide-react';
import { Navbar } from '@/components/ui/Navbar';
import { renderMarkdown } from '@/lib/markdown';

export default function SelfHostPage() {
  const t = useTranslations('selfhostGuide');
  const locale = useLocale();
  const [html, setHtml] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(locale === 'en' ? '/install.en.md' : '/install.md')
      .then((r) => r.text())
      .then((md) => { setHtml(renderMarkdown(md)); setLoading(false); })
      .catch(() => setLoading(false));
  }, [locale]);

  return (
    <main className="min-h-screen flex flex-col">
      <Navbar variant="back" />

      <div className="flex-1 max-w-3xl mx-auto px-6 py-12 w-full">
        <div className="flex items-center gap-3 mb-8">
          <div className="size-10 rounded-lg bg-violet-500/10 border border-violet-500/20 grid place-items-center">
            <Server className="size-5 text-violet-300" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-semibold tracking-tight">{t('title')}</h1>
            <p className="text-xs text-text-muted font-mono uppercase tracking-wider">{t('subtitle')}</p>
          </div>
        </div>

        {loading ? (
          <div className="animate-pulse space-y-4">
            <div className="h-4 bg-bg-surface rounded w-full" />
            <div className="h-4 bg-bg-surface rounded w-3/4" />
            <div className="h-4 bg-bg-surface rounded w-5/6" />
          </div>
        ) : (
          <article className="prose-noctcom" dangerouslySetInnerHTML={{ __html: html }} />
        )}
      </div>
    </main>
  );
}
