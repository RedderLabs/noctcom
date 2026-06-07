'use client';

import { useState } from 'react';
import { MonitorDown, Share, SquarePlus, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { usePwa } from '@/lib/pwa';
import { cn } from '@/lib/utils';

// Fase 11 · PWA. Entrada "Instalar app" del sidebar:
// - Chromium (Android/desktop): dispara el prompt nativo capturado en
//   beforeinstallprompt (PwaProvider). Si no se capturó, no se muestra.
// - iOS Safari: no hay prompt — modal con los pasos de "Añadir a pantalla
//   de inicio".
// - Ya instalada (standalone): no se muestra nada.
export function InstallAppButton({ collapsed }: { collapsed: boolean }) {
  const t = useTranslations('pwa');
  const { deferredPrompt, isIos, isStandalone, promptInstall } = usePwa();
  const [iosOpen, setIosOpen] = useState(false);

  if (isStandalone || (!deferredPrompt && !isIos)) return null;

  const onClick = async () => {
    if (isIos) { setIosOpen(true); return; }
    const accepted = await promptInstall();
    if (accepted) toast.success(t('installed'));
  };

  return (
    <>
      <div className={cn('border-t border-border-faint', collapsed ? 'px-2 py-1' : 'px-3 py-1')}>
        <button
          type="button"
          onClick={onClick}
          title={collapsed ? t('install') : undefined}
          className={cn(
            'w-full flex items-center h-9 rounded-md text-sm transition-colors',
            'text-violet-300/70 hover:text-violet-200 hover:bg-violet-500/10',
            collapsed ? 'justify-center px-0' : 'gap-3 px-3',
          )}
        >
          <MonitorDown className="size-4 shrink-0" />
          {!collapsed && <span>{t('install')}</span>}
        </button>
      </div>

      {/* Instrucciones iOS (Safari no expone prompt de instalación) */}
      {iosOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm grid place-items-center p-4"
          onClick={() => setIosOpen(false)}
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
                onClick={() => setIosOpen(false)}
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
      )}
    </>
  );
}
