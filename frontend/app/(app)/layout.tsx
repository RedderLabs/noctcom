'use client';

import { useState, useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  FolderTree, Star, Share2, Trash2, Clock, Settings, LogOut,
  Search, Plus, ChevronDown, HardDrive, Activity, PanelLeftClose, PanelLeftOpen,
  BookOpen,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/lib/auth-store';
import { loadTokens } from '@/lib/api';
import { useVault } from '@/lib/vault-store';
import { cn } from '@/lib/utils';
import { FontScaleControl } from '@/components/ui/FontScaleControl';
import { useFontScale } from '@/lib/font-scale';
import { useSync } from '@/lib/sync';
import { registerPushToken, onForegroundMessage } from '@/lib/firebase';

function formatStorageSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}

export default function AppLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { isAuthenticated, isUnlocked, username, logout, hydrate } = useAuth();
  const { sidebarCollapsed, toggleSidebar, hydrate: hydrateFontScale } = useFontScale();
  const { storageUsed, storageQuota, init: initVault, reset: resetVault } = useVault();
  const [mounted, setMounted] = useState(false);
  useSync();

  useEffect(() => {
    hydrate();
    hydrateFontScale();
    setMounted(true);
  }, [hydrate, hydrateFontScale]);

  useEffect(() => {
    if (!mounted) return;
    loadTokens();
    if (!isAuthenticated || !isUnlocked) {
      const { access } = loadTokens();
      if (!access) router.push('/login');
    } else {
      initVault();
      registerPushToken();
      const unsub = onForegroundMessage((payload) => {
        if (payload.notification?.title) {
          toast.info(payload.notification.title, { description: payload.notification.body });
        }
      });
      return unsub;
    }
  }, [mounted, isAuthenticated, isUnlocked, router, initVault]);

  const collapsed = sidebarCollapsed;

  const navItems = [
    { href: '/vault', label: 'Mis archivos', icon: FolderTree },
    { href: '/vault/recent', label: 'Recientes', icon: Clock },
    { href: '/vault/starred', label: 'Destacados', icon: Star },
    { href: '/vault/shared', label: 'Compartidos', icon: Share2 },
    { href: '/vault/activity', label: 'Actividad', icon: Activity },
    { href: '/vault/trash', label: 'Papelera', icon: Trash2 },
  ];

  if (!mounted) {
    return (
      <div className="h-screen flex overflow-hidden">
        <aside className="w-64 shrink-0 h-screen fixed left-0 top-0 border-r border-[var(--color-border-faint)] bg-[var(--color-bg-deep)]/40 backdrop-blur-md flex flex-col z-30" />
        <div className="flex-1 flex flex-col min-w-0 ml-64">
          <header className="h-16 border-b border-[var(--color-border-faint)] bg-[var(--color-bg-base)]/60 backdrop-blur-md" />
          <main className="flex-1" />
        </div>
      </div>
    );
  }

  const sidebarW = collapsed ? 'w-16' : 'w-64';
  const mainMl = collapsed ? 'ml-16' : 'ml-64';

  return (
    <div className="h-screen flex overflow-hidden">
      {/* ─── Sidebar ──────────────────────────────────────── */}
      <aside className={cn(
        sidebarW,
        'shrink-0 h-screen fixed left-0 top-0 border-r border-[var(--color-border-faint)] bg-[var(--color-bg-deep)]/40 backdrop-blur-md flex flex-col z-30 transition-all duration-200',
      )}>
        {/* Brand + toggle */}
        <div className={cn('h-16 flex items-center border-b border-[var(--color-border-faint)]', collapsed ? 'justify-center px-2' : 'px-5 justify-between')}>
          <Link href="/vault" className="flex items-center gap-2.5 group">
            <div className="size-8 rounded-lg bg-gradient-to-br from-violet-500 to-violet-700 grid place-items-center shadow-[0_0_20px_-4px_rgba(139,92,246,0.6)] shrink-0">
              <span className="font-display text-white font-semibold text-sm">N</span>
            </div>
            {!collapsed && (
              <div className="flex flex-col">
                <span className="font-display text-sm tracking-tight leading-tight">Noctcom</span>
                <span className="text-[10px] text-[var(--color-text-tertiary)] uppercase tracking-widest">Vault</span>
              </div>
            )}
          </Link>
          {!collapsed && (
            <button
              onClick={toggleSidebar}
              className="p-1.5 rounded-md hover:bg-[var(--color-bg-surface)] text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors"
              title="Colapsar sidebar"
            >
              <PanelLeftClose className="size-4" />
            </button>
          )}
        </div>

        {/* Expandir (solo cuando colapsado) */}
        {collapsed && (
          <div className="flex justify-center py-2">
            <button
              onClick={toggleSidebar}
              className="p-1.5 rounded-md hover:bg-[var(--color-bg-surface)] text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors"
              title="Expandir sidebar"
            >
              <PanelLeftOpen className="size-4" />
            </button>
          </div>
        )}

        {/* Acción primaria */}
        <div className={cn(collapsed ? 'p-2' : 'p-4')}>
          <button
            type="button"
            className={cn(
              'h-10 flex items-center justify-center bg-violet-600 hover:bg-violet-500 text-white rounded-lg text-sm font-medium transition-colors shadow-[0_0_0_1px_rgba(139,92,246,0.4),0_4px_16px_-4px_rgba(139,92,246,0.4)]',
              collapsed ? 'w-10 mx-auto' : 'w-full gap-2',
            )}
            onClick={() => window.dispatchEvent(new CustomEvent('noctcom:new-action'))}
            title="Nuevo"
          >
            <Plus className="size-4 shrink-0" />
            {!collapsed && <><span>Nuevo</span><ChevronDown className="size-3.5 opacity-70" /></>}
          </button>
        </div>

        {/* Nav */}
        <nav className={cn('flex-1 space-y-0.5', collapsed ? 'px-2' : 'px-3')}>
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href as any}
              title={collapsed ? item.label : undefined}
              className={cn(
                'flex items-center h-9 rounded-md text-sm transition-colors',
                'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-surface)]',
                collapsed ? 'justify-center px-0' : 'gap-3 px-3',
              )}
            >
              <item.icon className="size-4 shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          ))}
        </nav>

        {/* Accesibilidad */}
        <div className={cn('py-2 border-t border-[var(--color-border-faint)]', collapsed ? 'px-1.5' : 'px-4')}>
          <FontScaleControl collapsed={collapsed} />
        </div>

        {/* Manual */}
        <div className={cn('border-t border-[var(--color-border-faint)]', collapsed ? 'px-2 py-1' : 'px-3 py-1')}>
          <Link
            href={'/vault/manual' as any}
            title={collapsed ? 'Manual de usuario' : undefined}
            className={cn(
              'flex items-center h-9 rounded-md text-sm transition-colors',
              'text-violet-300/70 hover:text-violet-200 hover:bg-violet-500/10',
              collapsed ? 'justify-center px-0' : 'gap-3 px-3',
            )}
          >
            <BookOpen className="size-4 shrink-0" />
            {!collapsed && <span>Manual</span>}
          </Link>
        </div>



        {/* Cuota */}
        {!collapsed && (
          <div className="px-4 py-3 border-t border-[var(--color-border-faint)]">
            <div className="flex items-center gap-2 text-xs text-[var(--color-text-tertiary)] mb-2">
              <HardDrive className="size-3.5" />
              <span>Almacenamiento</span>
            </div>
            <div className="h-1.5 bg-[var(--color-bg-surface-2)] rounded-full overflow-hidden mb-1.5">
              <div
                className="h-full bg-gradient-to-r from-violet-500 to-violet-400 rounded-full transition-all duration-500"
                style={{ width: `${storageQuota > 0 ? Math.min(100, (storageUsed / storageQuota) * 100) : 0}%` }}
              />
            </div>
            <p className="text-[10px] text-[var(--color-text-tertiary)]">
              <span className="text-[var(--color-text-secondary)] font-mono">{formatStorageSize(storageUsed)}</span> de {formatStorageSize(storageQuota)}
            </p>
          </div>
        )}
        {collapsed && (
          <div className="py-2 border-t border-[var(--color-border-faint)] flex justify-center" title={`${formatStorageSize(storageUsed)} / ${formatStorageSize(storageQuota)}`}>
            <HardDrive className="size-4 text-[var(--color-text-tertiary)]" />
          </div>
        )}

        {/* Usuario */}
        <div className={cn('border-t border-[var(--color-border-faint)]', collapsed ? 'p-2' : 'p-3')}>
          <div className={cn(
            'flex items-center rounded-md hover:bg-[var(--color-bg-surface)] transition-colors group',
            collapsed ? 'justify-center p-1.5' : 'gap-3 px-2 py-2',
          )}>
            <Link href={'/vault/profile' as any} className="shrink-0" title={username ?? 'Usuario'}>
              <div className="size-8 rounded-full bg-gradient-to-br from-violet-400 to-violet-600 grid place-items-center text-xs font-medium cursor-pointer hover:shadow-[0_0_12px_-2px_rgba(139,92,246,0.5)] transition-shadow">
                {username?.[0]?.toUpperCase() ?? '?'}
              </div>
            </Link>
            {!collapsed && (
              <>
                <Link href={'/vault/profile' as any} className="flex-1 min-w-0 cursor-pointer">
                  <div className="text-sm font-medium truncate hover:text-violet-300 transition-colors">{username ?? 'Usuario'}</div>
                  <div className="text-[10px] text-[var(--color-text-tertiary)]">Plan gratuito</div>
                </Link>
                <Link href="/vault/settings" className="opacity-0 group-hover:opacity-100 transition-opacity">
                  <Settings className="size-4 text-[var(--color-text-tertiary)]" />
                </Link>
                <button
                  onClick={() => { resetVault(); logout(); router.push('/login'); }}
                  className="opacity-0 group-hover:opacity-100 transition-opacity"
                  aria-label="Cerrar sesión"
                >
                  <LogOut className="size-4 text-[var(--color-text-tertiary)]" />
                </button>
              </>
            )}
          </div>
        </div>
      </aside>

      {/* ─── Main ─────────────────────────────────────────── */}
      <div className={cn('flex-1 flex flex-col min-w-0 transition-all duration-200', mainMl)}>
        <header className="h-16 border-b border-[var(--color-border-faint)] bg-[var(--color-bg-base)]/60 backdrop-blur-md flex items-center px-6 gap-4 sticky top-0 z-20">
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

        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
