'use client';

import { useState, useEffect, type ReactNode } from 'react';
import { useRouter, usePathname, Link } from '@/i18n/navigation';
import Image from 'next/image';
import {
  LayoutDashboard, FolderTree, HardDrive, Shield, Lock, Menu, X,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/lib/auth-store';
import { loadTokens } from '@/lib/api';
import { useVault } from '@/lib/vault-store';
import { cn, formatBytes } from '@/lib/utils';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { LanguageSwitcher } from '@/components/ui/LanguageSwitcher';

// El operador instaló su propia instancia: la app es un panel operativo, no
// la bóveda de marketing. Diseño divergente (densidad de panel, mono = verdad
// del sistema), misma capa cripto/auth que la nube.
export default function SelfHostLayout({ children }: { children: ReactNode }) {
  const t = useTranslations('selfhost');
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthenticated, isUnlocked, username, logout, hydrate } = useAuth();
  const { storageUsed, storageQuota, init: initVault, reset: resetVault } = useVault();
  const [mounted, setMounted] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const hasSession = isAuthenticated && isUnlocked;
  // El flag se inlinea en build; en la nube esta rama desaparece y el grupo
  // (selfhost) queda inerte → al vault.
  const isSelfHost = process.env.NEXT_PUBLIC_SELF_HOST === 'true';

  useEffect(() => {
    hydrate();
    setMounted(true);
  }, [hydrate]);

  useEffect(() => {
    if (!mounted) return;
    if (!isSelfHost) { router.replace('/vault'); return; }
    loadTokens();
    if (!hasSession) { router.replace('/login'); return; }
    initVault();
  }, [mounted, hasSession, isSelfHost, router, initVault]);

  // Pantalla neutra mientras hidratamos o redirigimos: sin parpadeo de chrome.
  if (!mounted || !hasSession || !isSelfHost) {
    return (
      <div className="h-screen grid place-items-center bg-bg-base">
        <div className="size-6 rounded-full border-2 border-border-subtle border-t-violet-500 animate-spin" />
      </div>
    );
  }

  const pct = storageQuota > 0 ? Math.min(100, (storageUsed / storageQuota) * 100) : 0;

  const navItems = [
    { href: '/panel', label: t('nav.panel'), icon: LayoutDashboard },
    { href: '/archivos', label: t('nav.files'), icon: FolderTree },
    { href: '/almacenamiento', label: t('nav.storage'), icon: HardDrive },
    { href: '/seguridad', label: t('nav.security'), icon: Shield },
  ];

  return (
    <div className="h-screen flex overflow-hidden">
      {/* Overlay móvil */}
      {mobileOpen && (
        <div onClick={() => setMobileOpen(false)} className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm md:hidden" aria-hidden />
      )}

      {/* ─── Sidebar ─── */}
      <aside className={cn(
        'w-64 shrink-0 h-screen fixed left-0 top-0 border-r border-border-faint bg-bg-deep/95 md:bg-bg-deep/40 backdrop-blur-md flex flex-col z-40 transition-transform duration-200',
        !mobileOpen && '-translate-x-full md:translate-x-0',
      )}>
        <div className="h-16 flex items-center justify-between px-5 border-b border-border-faint">
          <Link href="/panel" onClick={() => setMobileOpen(false)} className="flex items-center gap-2.5 group">
            <Image src="/logo.svg" alt="" width={30} height={30} priority unoptimized className="shrink-0" />
            <span className="font-display text-sm tracking-tight">Noctcom</span>
          </Link>
          <button onClick={() => setMobileOpen(false)} className="md:hidden p-1.5 rounded-md hover:bg-bg-surface text-text-muted" aria-label={t('shell.closeMenu')}>
            <X className="size-4" />
          </button>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-0.5">
          {navItems.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + '/');
            return (
              <Link
                key={item.href}
                href={item.href as any}
                onClick={() => setMobileOpen(false)}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-3 h-9 px-3 rounded-md text-sm transition-colors',
                  active
                    ? 'bg-violet-500/12 text-text-primary'
                    : 'text-text-secondary hover:text-text-primary hover:bg-bg-surface',
                )}
              >
                <item.icon className={cn('size-4 shrink-0', active && 'text-violet-300')} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="px-4 py-2 border-t border-border-faint flex items-center justify-between gap-2">
          <ThemeToggle />
          <LanguageSwitcher />
        </div>

        {/* Capacidad real del disco */}
        <div className="px-4 py-3 border-t border-border-faint">
          <div className="flex items-center gap-2 text-xs text-text-tertiary mb-2">
            <HardDrive className="size-3.5" />
            <span>{t('shell.storage')}</span>
          </div>
          <div className="h-1.5 bg-bg-surface-2 rounded-full overflow-hidden mb-1.5">
            <div className="h-full bg-gradient-to-r from-violet-500 to-violet-400 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
          </div>
          <p className="text-[10px] text-text-tertiary">
            <span className="text-text-secondary font-mono">{formatBytes(storageUsed)}</span>
            {' '}{t('shell.of')}{' '}{formatBytes(storageQuota)}
          </p>
          <p className="mt-1.5 text-[10px] text-text-muted font-mono">v{process.env.NEXT_PUBLIC_APP_VERSION}</p>
        </div>

        {/* Bloquear bóveda = cerrar sesión (vuelve al login/desbloqueo) */}
        <div className="px-3 py-3 border-t border-border-faint">
          <button
            onClick={() => { resetVault(); logout(); router.push('/login'); }}
            className="w-full flex items-center gap-3 h-9 px-3 rounded-md text-sm text-text-secondary hover:text-text-primary hover:bg-bg-surface transition-colors"
          >
            <Lock className="size-4 shrink-0" />
            <span>{t('shell.lockVault')}</span>
          </button>
        </div>
      </aside>

      {/* ─── Main ─── */}
      <div className="flex-1 flex flex-col min-w-0 md:ml-64">
        <header className="h-16 border-b border-border-faint bg-bg-base/60 backdrop-blur-md flex items-center px-4 md:px-6 gap-3 sticky top-0 z-20">
          <button onClick={() => setMobileOpen(true)} className="md:hidden p-2 -ml-1 rounded-md hover:bg-bg-surface text-text-secondary" aria-label={t('shell.openMenu')}>
            <Menu className="size-5" />
          </button>
          <span className="font-mono text-[10.5px] font-medium tracking-wider text-violet-300 px-2.5 py-1 rounded-full border border-border-strong bg-violet-500/[0.06]">
            {t('shell.badge')}
          </span>
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden sm:block text-xs text-text-tertiary font-mono">🟢 {t('shell.encryptionActive')}</span>
            <Link href={'/seguridad' as any} className="size-8 rounded-full bg-gradient-to-br from-violet-400 to-violet-600 grid place-items-center text-xs font-medium" title={username ?? ''}>
              {username?.[0]?.toUpperCase() ?? '?'}
            </Link>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto">
          <div className="max-w-[1160px] mx-auto px-5 md:px-6 py-7">{children}</div>
        </main>
      </div>
    </div>
  );
}
