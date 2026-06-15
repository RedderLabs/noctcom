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
      // El registro de un SW exige un contexto seguro DE CONFIANZA. En modo LAN
      // con HTTPS interno por IP (certificado autofirmado), el navegador rechaza
      // el fetch de /sw.js con un SecurityError aunque el usuario acepte el aviso
      // del certificado: el registro del SW no admite excepción manual como sí la
      // admite la navegación. Omitirlo en IPs crudas (no loopback) evita ese error
      // ruidoso; la PWA offline solo aplica con dominio + certificado válido y la
      // subida/consulta de archivos no necesita SW.
      const host = window.location.hostname;
      const isLoopback =
        host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]';
      const isIpLiteral =
        !isLoopback && (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(':'));

      if (isIpLiteral) {
        console.info('[pwa] SW omitido: HTTPS interno por IP (certificado autofirmado).');
      } else {
        // El registro también migra a quien tuviera el SW antiguo de FCM
        // (mismo scope '/': el script nuevo reemplaza al anterior).
        navigator.serviceWorker.register('/sw.js').catch((err) => {
          console.warn('[pwa] registro del SW falló:', err);
        });
      }
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
