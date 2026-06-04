'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { Shield, X } from 'lucide-react';

const COOKIE_KEY = 'noctcom.cookies-accepted';

export function CookieBanner() {
  const t = useTranslations('cookieBanner');
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem(COOKIE_KEY)) setVisible(true);
  }, []);

  function accept() {
    localStorage.setItem(COOKIE_KEY, '1');
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 flex justify-center animate-fade-in">
      <div className="max-w-2xl w-full p-4 rounded-xl border border-border-subtle bg-bg-surface shadow-modal backdrop-blur-md flex items-start gap-4">
        <div className="size-9 rounded-lg bg-violet-500/10 border border-violet-500/20 grid place-items-center shrink-0 mt-0.5">
          <Shield className="size-4 text-violet-300" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-medium mb-1">{t('title')}</h3>
          <p className="text-xs text-text-tertiary leading-relaxed">
            {t.rich('description', {
              strong: (chunks) => <strong className="text-text-secondary">{chunks}</strong>,
              cfBm: () => <code className="text-[10px] bg-bg-surface-2 px-1 py-0.5 rounded">__cf_bm</code>,
              cfClearance: () => <code className="text-[10px] bg-bg-surface-2 px-1 py-0.5 rounded">cf_clearance</code>,
              link: (chunks) => (
                <Link href={'/cookies' as any} className="text-violet-300 hover:text-violet-200">{chunks}</Link>
              ),
            })}
          </p>
        </div>
        <button
          onClick={accept}
          className="shrink-0 px-4 h-8 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-medium transition-colors"
        >
          {t('accept')}
        </button>
        <button
          onClick={accept}
          className="shrink-0 p-1.5 rounded-md hover:bg-bg-surface-2 text-text-muted transition-colors"
          aria-label={t('close')}
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}
