import { create } from 'zustand';

type LayoutState = {
  scale: number;
  sidebarCollapsed: boolean;
  hydrated: boolean;
  setScale: (s: number) => void;
  toggleSidebar: () => void;
  hydrate: () => void;
};

export const FONT_SCALES = [
  { value: 0.9, label: 'Pequeña' },
  { value: 1, label: 'Normal' },
  { value: 1.15, label: 'Grande' },
  { value: 1.3, label: 'Muy grande' },
] as const;

export const useFontScale = create<LayoutState>((set) => ({
  scale: 1,
  sidebarCollapsed: false,
  hydrated: false,
  setScale: (s) => {
    set({ scale: s });
  },
  toggleSidebar: () => set((state) => {
    const next = !state.sidebarCollapsed;
    localStorage.setItem('noctcom.sidebarCollapsed', String(next));
    return { sidebarCollapsed: next };
  }),
  hydrate: () => {
    if (typeof window === 'undefined') return;
    const scale = parseFloat(localStorage.getItem('noctcom.fontScale') ?? '1');
    const collapsed = localStorage.getItem('noctcom.sidebarCollapsed') === 'true';
    set({ scale, sidebarCollapsed: collapsed, hydrated: true });
  },
}));
