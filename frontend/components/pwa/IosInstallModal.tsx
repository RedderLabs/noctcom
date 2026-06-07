'use client';

import { Share, SquarePlus, X } from 'lucide-react';
import { useTranslations } from 'next-intl';

// Pasos de instalación en iOS (Safari no expone prompt nativo). Compartido
// por el botón del sidebar del vault y el hint del hero de la landing.
export function IosInstallModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTranslations('pwa');
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm grid place-items-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-sm rounded-xl border border-border-subtle bg-bg-surface p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-3">
          <h2 className="text-sm font-medium">{t('iosTitle')}</h2>
          <button
            onClick={onClose}
            aria-label={t('close')}
            className="p-1 rounded-md hover:bg-bg-surface-2 text-text-tertiary hover:text-text-primary transition-colors"
          >
            <X className="size-4" />
          </button>
        </div>
        <ol className="space-y-3 text-sm text-text-secondary">
          <li className="flex items-center gap-3">
            <Share className="size-4 shrink-0 text-violet-400" />
            <span>{t('iosStep1')}</span>
          </li>
          <li className="flex items-center gap-3">
            <SquarePlus className="size-4 shrink-0 text-violet-400" />
            <span>{t('iosStep2')}</span>
          </li>
        </ol>
      </div>
    </div>
  );
}
