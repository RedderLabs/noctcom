'use client';

import { useState } from 'react';
import { MonitorDown } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { usePwa } from '@/lib/pwa';
import { IosInstallModal } from './IosInstallModal';

// Mensaje de descarga/instalación bajo el hero de la landing (Fase 11 · PWA).
// - Chromium: dispara el prompt nativo capturado en beforeinstallprompt.
// - iOS: modal con los pasos de "Añadir a pantalla de inicio".
// - Navegadores sin prompt (Firefox…): muestra la pista del menú del navegador.
// - Ya instalada (standalone): no se muestra.
export function HeroInstallHint() {
  const t = useTranslations('pwa');
  const { deferredPrompt, isIos, isStandalone, promptInstall } = usePwa();
  const [iosOpen, setIosOpen] = useState(false);
  const [fallbackVisible, setFallbackVisible] = useState(false);

  if (isStandalone) return null;

  const onClick = async () => {
    if (isIos) { setIosOpen(true); return; }
    if (deferredPrompt) {
      const accepted = await promptInstall();
      if (accepted) toast.success(t('installed'));
      return;
    }
    setFallbackVisible(true); // sin prompt: explicar el menú del navegador
  };

  return (
    <div className="mt-6 text-sm text-text-tertiary">
      <button
        type="button"
        onClick={onClick}
        className="inline-flex items-center gap-2 text-violet-300/80 hover:text-violet-200 transition-colors group"
      >
        <MonitorDown className="size-4 shrink-0 group-hover:translate-y-0.5 transition-transform" />
        <span className="underline decoration-violet-500/40 underline-offset-4">{t('heroInstall')}</span>
      </button>
      <p className="mt-1.5 text-xs text-text-muted">{t('heroInstallSub')}</p>
      {fallbackVisible && (
        <p className="mt-1.5 text-xs text-text-muted">{t('heroInstallFallback')}</p>
      )}
      <IosInstallModal open={iosOpen} onClose={() => setIosOpen(false)} />
    </div>
  );
}
