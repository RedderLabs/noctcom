'use client';

import { useState, useEffect } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { BookOpen } from 'lucide-react';
import { renderMarkdown } from '@/lib/markdown';

export default function ManualPage() {
  const t = useTranslations('manual');
  const locale = useLocale();
  const [html, setHtml] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(locale === 'en' ? '/manual.en.md' : '/manual.md')
      .then((r) => r.text())
      .then((md) => {
        setHtml(renderMarkdown(md));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [locale]);

  if (loading) {
    return (
      <div className="px-8 py-12 max-w-3xl mx-auto">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-bg-surface rounded w-64" />
          <div className="h-4 bg-bg-surface rounded w-full" />
          <div className="h-4 bg-bg-surface rounded w-3/4" />
        </div>
      </div>
    );
  }

  return (
    <div className="px-8 py-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="size-10 rounded-lg bg-violet-500/10 border border-violet-500/20 grid place-items-center">
          <BookOpen className="size-5 text-violet-300" />
        </div>
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">{t('title')}</h1>
          <p className="text-xs text-text-muted font-mono uppercase tracking-wider">
            {t('subtitle')}
          </p>
        </div>
      </div>
      <article
        className="prose-noctcom"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
