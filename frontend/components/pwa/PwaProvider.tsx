'use client';

import { useEffect } from 'react';
import { usePwa } from '@/lib/pwa';

// Fase 11 · PWA. Montado en el layout raíz:
// 1) Registra /sw.js (app-shell + push FCM unificados; ver public/sw.js).
// 2) Captura beforeinstallprompt para el botón "Instalar app" propio.
// 3) Mantiene el estado standalone (cambia si instalan/desinstalan en vivo).
export function PwaProvider() {
  const { setDeferredPrompt, setStandalone } = usePwa();

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      // El registro también migra a quien tuviera el SW antiguo de FCM
      // (mismo scope '/': el script nuevo reemplaza al anterior).
      navigator.serviceWorker.register('/sw.js').catch((err) => {
        console.warn('[pwa] registro del SW falló:', err);
      });
    }

    const mq = window.matchMedia('(display-mode: standalone)');
    // iOS expone navigator.standalone en lugar del display-mode.
    setStandalone(mq.matches || (navigator as any).standalone === true);
    const onMq = (e: MediaQueryListEvent) => setStandalone(e.matches);
    mq.addEventListener('change', onMq);

    const onBeforeInstall = (e: Event) => {
      e.preventDefault(); // sin mini-infobar: el botón propio decide cuándo
      setDeferredPrompt(e as any);
    };
    const onInstalled = () => setDeferredPrompt(null);
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);

    return () => {
      mq.removeEventListener('change', onMq);
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, [setDeferredPrompt, setStandalone]);

  return null;
}
