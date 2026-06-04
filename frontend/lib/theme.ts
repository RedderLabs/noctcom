import { create } from 'zustand';

// Tema visual. El identidad de Noctcom es nocturna (oscuro por defecto), pero
// respetamos la preferencia del sistema y dejamos al usuario forzar uno u otro.
// La fuente de verdad en el primer pintado es la clase del <html>, que pone un
// script inline en <head> ANTES de que React hidrate (anti-FOUC). Este store
// solo sincroniza ese estado con la UI de React.
export type Theme = 'light' | 'dark';

const KEY = 'noctcom.theme';

function systemTheme(): Theme {
  if (typeof window === 'undefined') return 'dark';
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export function applyTheme(t: Theme) {
  if (typeof document === 'undefined') return;
  const el = document.documentElement;
  el.classList.toggle('light', t === 'light');
  el.classList.toggle('dark', t === 'dark');
  // Hace que controles nativos (scrollbar, inputs, date pickers) acompañen al tema.
  el.style.colorScheme = t;
}

type ThemeState = {
  theme: Theme;
  hydrated: boolean;
  hydrate: () => void;
  setTheme: (t: Theme) => void;
  toggle: () => void;
};

export const useTheme = create<ThemeState>((set, get) => ({
  // Coincide con el render del servidor (oscuro). hydrate() lo reconcilia en cliente.
  theme: 'dark',
  hydrated: false,
  hydrate: () => {
    if (typeof window === 'undefined' || get().hydrated) return;
    const stored = localStorage.getItem(KEY);
    const current: Theme =
      stored === 'light' || stored === 'dark'
        ? stored
        : document.documentElement.classList.contains('light')
          ? 'light'
          : systemTheme();
    applyTheme(current);
    set({ theme: current, hydrated: true });
  },
  setTheme: (t) => {
    localStorage.setItem(KEY, t);
    applyTheme(t);
    set({ theme: t });
  },
  toggle: () => {
    get().setTheme(get().theme === 'light' ? 'dark' : 'light');
  },
}));
