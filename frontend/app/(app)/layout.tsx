'use client';

import { useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  FolderTree, Star, Share2, Trash2, Clock, Settings, LogOut,
  Search, Plus, ChevronDown, HardDrive, Activity,
} from 'lucide-react';
import { useAuth } from '@/lib/auth-store';
import { loadTokens } from '@/lib/api';
import { cn } from '@/lib/utils';

export default function AppLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { isAuthenticated, isUnlocked, username, logout } = useAuth();

  useEffect(() => {
    loadTokens();
    // Si no hay sesión desbloqueada, mandamos al login.
    // (Mejoras pendientes: detectar tokens válidos + relock por inactividad)
    if (!isAuthenticated || !isUnlocked) {
      const { access } = loadTokens();
      if (!access) router.push('/login');
    }
  }, [isAuthenticated, isUnlocked, router]);

  const navItems = [
    { href: '/vault', label: 'Mis archivos', icon: FolderTree },
    { href: '/vault/recent', label: 'Recientes', icon: Clock },
    { href: '/vault/starred', label: 'Destacados', icon: Star },
    { href: '/vault/shared', label: 'Compartidos', icon: Share2 },
    { href: '/vault/activity', label: 'Actividad', icon: Activity },
    { href: '/vault/trash', label: 'Papelera', icon: Trash2 },
  ];

  return (
    <div className="min-h-screen flex">
      {/* ─── Sidebar ──────────────────────────────────────── */}
      <aside className="w-64 shrink-0 border-r border-[var(--color-border-faint)] bg-[var(--color-bg-deep)]/40 backdrop-blur-md flex flex-col">
        {/* Brand */}
        <div className="h-16 flex items-center px-5 border-b border-[var(--color-border-faint)]">
          <Link href="/vault" className="flex items-center gap-2.5 group">
            <div className="size-8 rounded-lg bg-gradient-to-br from-violet-500 to-violet-700 grid place-items-center shadow-[0_0_20px_-4px_rgba(139,92,246,0.6)]">
              <span className="font-display text-white font-semibold text-sm">N</span>
            </div>
            <div className="flex flex-col">
              <span className="font-display text-sm tracking-tight leading-tight">Noctcom</span>
              <span className="text-[10px] text-[var(--color-text-tertiary)] uppercase tracking-widest">Vault</span>
            </div>
          </Link>
        </div>

        {/* Acción primaria */}
        <div className="p-4">
          <button
            type="button"
            className="w-full h-10 flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-500 text-white rounded-lg text-sm font-medium transition-colors shadow-[0_0_0_1px_rgba(139,92,246,0.4),0_4px_16px_-4px_rgba(139,92,246,0.4)]"
            onClick={() => {
              window.dispatchEvent(new CustomEvent('noctcom:new-action'));
            }}
          >
            <Plus className="size-4" /> Nuevo
            <ChevronDown className="size-3.5 opacity-70" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 space-y-0.5">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href as any}
              className={cn(
                'flex items-center gap-3 px-3 h-9 rounded-md text-sm transition-colors',
                'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-surface)]',
              )}
            >
              <item.icon className="size-4 shrink-0" />
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>

        {/* Cuota */}
        <div className="px-4 py-3 border-t border-[var(--color-border-faint)]">
          <div className="flex items-center gap-2 text-xs text-[var(--color-text-tertiary)] mb-2">
            <HardDrive className="size-3.5" />
            <span>Almacenamiento</span>
          </div>
          <div className="h-1.5 bg-[var(--color-bg-surface-2)] rounded-full overflow-hidden mb-1.5">
            <div className="h-full bg-gradient-to-r from-violet-500 to-violet-400 rounded-full" style={{ width: '12%' }} />
          </div>
          <p className="text-[10px] text-[var(--color-text-tertiary)]">
            <span className="text-[var(--color-text-secondary)] font-mono">1.2 GB</span> de 10 GB
          </p>
        </div>

        {/* Usuario */}
        <div className="p-3 border-t border-[var(--color-border-faint)]">
          <div className="flex items-center gap-3 px-2 py-2 rounded-md hover:bg-[var(--color-bg-surface)] transition-colors group cursor-pointer">
            <div className="size-8 rounded-full bg-gradient-to-br from-violet-400 to-violet-600 grid place-items-center text-xs font-medium">
              {username?.[0]?.toUpperCase() ?? '?'}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{username ?? 'Usuario'}</div>
              <div className="text-[10px] text-[var(--color-text-tertiary)]">Plan gratuito</div>
            </div>
            <Link href="/vault/settings" className="opacity-0 group-hover:opacity-100 transition-opacity">
              <Settings className="size-4 text-[var(--color-text-tertiary)]" />
            </Link>
            <button
              onClick={() => { logout(); router.push('/login'); }}
              className="opacity-0 group-hover:opacity-100 transition-opacity"
              aria-label="Cerrar sesión"
            >
              <LogOut className="size-4 text-[var(--color-text-tertiary)]" />
            </button>
          </div>
        </div>
      </aside>

      {/* ─── Main ─────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar — search */}
        <header className="h-16 border-b border-[var(--color-border-faint)] bg-[var(--color-bg-base)]/60 backdrop-blur-md flex items-center px-6 gap-4">
          <div className="flex-1 max-w-2xl relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-[var(--color-text-tertiary)]" />
            <input
              type="search"
              placeholder="Buscar en tu bóveda…"
              className="w-full h-10 pl-10 pr-12 bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] rounded-lg text-sm placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-violet-500/60 focus:shadow-[0_0_0_3px_rgba(139,92,246,0.12)]"
            />
            <kbd className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-mono text-[var(--color-text-tertiary)] px-1.5 py-0.5 rounded border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface-2)]">
              ⌘K
            </kbd>
          </div>
          <div className="text-xs text-[var(--color-text-tertiary)] font-mono">
            🟢 Cifrado activo
          </div>
        </header>

        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
