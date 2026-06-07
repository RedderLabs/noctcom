'use client';

import { create } from 'zustand';

// Fase 11 · PWA. Captura del evento beforeinstallprompt (Chromium) y
// detección de plataforma para el botón "Instalar app": en Android/desktop
// disparamos el prompt nativo; en iOS (Safari no tiene prompt) enseñamos
// instrucciones de "Añadir a pantalla de inicio".

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface PwaState {
  /** Evento diferido de Chromium; null = no instalable (o ya instalada). */
  deferredPrompt: BeforeInstallPromptEvent | null;
  /** Corriendo como app instalada (standalone). */
  isStandalone: boolean;
  /** iOS Safari: sin beforeinstallprompt, instalación manual. */
  isIos: boolean;
  setDeferredPrompt: (e: BeforeInstallPromptEvent | null) => void;
  setStandalone: (v: boolean) => void;
  /** Lanza el prompt nativo. Devuelve true si el usuario aceptó. */
  promptInstall: () => Promise<boolean>;
}

function detectIos(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  // iPadOS 13+ se hace pasar por macOS: lo delata el touch.
  return /iPhone|iPad|iPod/.test(ua)
    || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

export const usePwa = create<PwaState>((set, get) => ({
  deferredPrompt: null,
  isStandalone: false,
  isIos: detectIos(),
  setDeferredPrompt: (e) => set({ deferredPrompt: e }),
  setStandalone: (v) => set({ isStandalone: v }),
  promptInstall: async () => {
    const e = get().deferredPrompt;
    if (!e) return false;
    await e.prompt();
    const { outcome } = await e.userChoice;
    // El evento es de un solo uso: tras el prompt deja de ser válido.
    set({ deferredPrompt: null });
    return outcome === 'accepted';
  },
}));
