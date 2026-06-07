'use client';

import { useState } from 'react';
import { MonitorDown } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { usePwa } from '@/lib/pwa';
import { cn } from '@/lib/utils';
import { IosInstallModal } from './IosInstallModal';

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
      <IosInstallModal open={iosOpen} onClose={() => setIosOpen(false)} />
    </>
  );
}
