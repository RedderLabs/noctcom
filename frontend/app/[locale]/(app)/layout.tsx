'use client';

import { useState, useEffect, type ReactNode } from 'react';
import { useRouter } from '@/i18n/navigation';
import { Link } from '@/i18n/navigation';
import Image from 'next/image';
import {
  FolderTree, Star, Share2, Trash2, Clock, Settings, LogOut,
  Search, Plus, ChevronDown, HardDrive, Activity, PanelLeftClose, PanelLeftOpen,
  BookOpen, Menu, Hourglass,
} from 'lucide-react';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/lib/auth-store';
import { loadTokens } from '@/lib/api';
import { useVault } from '@/lib/vault-store';
import { cn } from '@/lib/utils';
import { FontScaleControl } from '@/components/ui/FontScaleControl';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { LanguageSwitcher } from '@/components/ui/LanguageSwitcher';
import { useFontScale } from '@/lib/font-scale';
import { useSync } from '@/lib/sync';
import { syncPushToken, onForegroundMessage } from '@/lib/firebase';
import { OnboardingTour } from '@/components/vault/OnboardingTour';
import { TrialWelcomeModal } from '@/components/vault/TrialWelcomeModal';
import { TrialEndedModal, trialDaysLeft as computeTrialDaysLeft } from '@/components/vault/TrialEndedModal';

function formatStorageSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}

export default function AppLayout({ children }: { children: ReactNode }) {
  const t = useTranslations('appShell');
  const router = useRouter();
  const { isAuthenticated, isUnlocked, username, logout, hydrate } = useAuth();
  const { sidebarCollapsed, toggleSidebar, hydrate: hydrateFontScale } = useFontScale();
  const { storageUsed, storageQuota, trialStartedAt, trialDays, trialExempt, plan, init: initVault, reset: resetVault } = useVault();
  const [mounted, setMounted] = useState(false);
  // Drawer móvil: el sidebar pasa a off-canvas en pantallas pequeñas.
  const [isMobile, setIsMobile] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  useSync();

  useEffect(() => {
    hydrate();
    hydrateFontScale();
    setMounted(true);
    const mq = window.matchMedia('(max-width: 767px)');
    const apply = () => setIsMobile(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [hydrate, hydrateFontScale]);

  // Sin sesión activa (autenticado Y desbloqueado) NO se entra al vault: se va
  // al login SIEMPRE. La mera presencia de un access token viejo en localStorage
  // no cuenta como sesión — el material cripto (MK) vive en sessionStorage y se
  // pierde al cerrar la pestaña o caducar; sin él no hay nada que descifrar.
  const hasSession = isAuthenticated && isUnlocked;

  useEffect(() => {
    if (!mounted) return;
    loadTokens();
    if (!hasSession) {
      router.replace('/login'); // replace: el botón "atrás" no vuelve al vault
      return;
    }
    initVault();
    // Pasivo: solo refresca el token si el usuario YA activó las notificaciones
    // en Ajustes. El diálogo de permiso del navegador nunca sale de un useEffect.
    syncPushToken();
    const unsub = onForegroundMessage((payload) => {
      if (payload.notification?.title) {
        toast.info(payload.notification.title, { description: payload.notification.body });
      }
    });
    return unsub;
  }, [mounted, hasSession, router, initVault]);

  // En móvil el drawer siempre se muestra expandido (con etiquetas).
  const collapsed = isMobile ? false : sidebarCollapsed;

  const navItems = [
    { href: '/vault', label: t('nav.files'), icon: FolderTree },
    { href: '/vault/recent', label: t('nav.recent'), icon: Clock },
    { href: '/vault/starred', label: t('nav.starred'), icon: Star },
    { href: '/vault/shared', label: t('nav.shared'), icon: Share2 },
    { href: '/vault/activity', label: t('nav.activity'), icon: Activity },
    { href: '/vault/trash', label: t('nav.trash'), icon: Trash2 },
  ];

  // Hasta confirmar sesión activa no se renderiza NADA del vault (ni chrome ni
  // children): pantalla neutra mientras se hidrata o se redirige al login. Así
  // no hay parpadeo de contenido protegido sin sesión.
  if (!mounted || !hasSession) {
    return (
      <div className="h-screen grid place-items-center bg-bg-base">
        <div className="size-6 rounded-full border-2 border-border-subtle border-t-violet-500 animate-spin" />
      </div>
    );
  }

  // Cuenta atrás de la beta: días restantes desde que el usuario vio el modal
  // del trial. null = sin trial (exento o no arrancó). Con plan de pago tampoco
  // se muestra: ya desbloqueó y el contador no significa nada para él.
  const trialDaysLeft = plan === 'free'
    ? computeTrialDaysLeft(trialStartedAt, trialDays, trialExempt)
    : null;
  const trialLabel = trialDaysLeft === null
    ? null
    : trialDaysLeft > 0 ? t('trialDaysLeft', { days: trialDaysLeft }) : t('trialEnded');

  const sidebarW = collapsed ? 'w-16' : 'w-64';
  // En móvil el contenido ocupa todo el ancho; el sidebar va por encima como drawer.
  const mainMl = isMobile ? 'ml-0' : (collapsed ? 'ml-16' : 'ml-64');

  return (
    <div className="h-screen flex overflow-hidden">
      {/* ─── Overlay (solo móvil, con drawer abierto) ─────── */}
      {isMobile && mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm"
          aria-hidden="true"
        />
      )}

      {/* ─── Sidebar / Drawer ─────────────────────────────── */}
      <aside className={cn(
        sidebarW,
        'shrink-0 h-screen fixed left-0 top-0 border-r border-border-faint bg-bg-deep/95 md:bg-bg-deep/40 backdrop-blur-md flex flex-col z-40 transition-all duration-200',
        isMobile && !mobileOpen && '-translate-x-full',
        isMobile && mobileOpen && 'translate-x-0 shadow-[8px_0_40px_-12px_rgba(0,0,0,0.8)]',
      )}>
        {/* Brand + toggle */}
        <div className={cn('h-16 flex items-center border-b border-border-faint', collapsed ? 'justify-center px-2' : 'px-5 justify-between')}>
          <Link href="/vault" onClick={() => setMobileOpen(false)} className="flex items-center gap-2.5 group">
            <Image src="/logo.svg" alt="" width={32} height={32} priority unoptimized className="shrink-0" />
            {!collapsed && (
              <div className="flex flex-col">
                <span className="font-display text-sm tracking-tight leading-tight">Noctcom</span>
                <span className="text-[10px] text-text-tertiary uppercase tracking-widest">{t('vaultSubtitle')}</span>
              </div>
            )}
          </Link>
          {!collapsed && (
            <button
              onClick={() => (isMobile ? setMobileOpen(false) : toggleSidebar())}
              className="p-1.5 rounded-md hover:bg-bg-surface text-text-muted hover:text-text-secondary transition-colors"
              title={isMobile ? t('closeMenu') : t('collapseSidebar')}
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
              className="p-1.5 rounded-md hover:bg-bg-surface text-text-muted hover:text-text-secondary transition-colors"
              title={t('expandSidebar')}
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
            title={t('new')}
          >
            <Plus className="size-4 shrink-0" />
            {!collapsed && <><span>{t('new')}</span><ChevronDown className="size-3.5 opacity-70" /></>}
          </button>
        </div>

        {/* Nav */}
        <nav className={cn('flex-1 space-y-0.5', collapsed ? 'px-2' : 'px-3')}>
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href as any}
              onClick={() => setMobileOpen(false)}
              title={collapsed ? item.label : undefined}
              className={cn(
                'flex items-center h-9 rounded-md text-sm transition-colors',
                'text-text-secondary hover:text-text-primary hover:bg-bg-surface',
                collapsed ? 'justify-center px-0' : 'gap-3 px-3',
              )}
            >
              <item.icon className="size-4 shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          ))}
        </nav>

        {/* Accesibilidad — tamaño de texto + tema claro/oscuro */}
        <div className={cn(
          'py-2 border-t border-border-faint flex items-center gap-2',
          collapsed ? 'px-1.5 flex-col' : 'px-4 justify-between',
        )}>
          <FontScaleControl collapsed={collapsed} />
          <div className={cn('flex items-center gap-2', collapsed && 'flex-col')}>
            <ThemeToggle />
            <LanguageSwitcher />
          </div>
        </div>

        {/* Manual */}
        <div className={cn('border-t border-border-faint', collapsed ? 'px-2 py-1' : 'px-3 py-1')}>
          <Link
            href={'/vault/manual' as any}
            onClick={() => setMobileOpen(false)}
            title={collapsed ? t('manual') : undefined}
            className={cn(
              'flex items-center h-9 rounded-md text-sm transition-colors',
              'text-violet-300/70 hover:text-violet-200 hover:bg-violet-500/10',
              collapsed ? 'justify-center px-0' : 'gap-3 px-3',
            )}
          >
            <BookOpen className="size-4 shrink-0" />
            {!collapsed && <span>{t('manual')}</span>}
          </Link>
        </div>



        {/* Cuota */}
        {!collapsed && (
          <div className="px-4 py-3 border-t border-border-faint">
            <div className="flex items-center gap-2 text-xs text-text-tertiary mb-2">
              <HardDrive className="size-3.5" />
              <span>{t('storage')}</span>
            </div>
            <div className="h-1.5 bg-bg-surface-2 rounded-full overflow-hidden mb-1.5">
              <div
                className="h-full bg-gradient-to-r from-violet-500 to-violet-400 rounded-full transition-all duration-500"
                style={{ width: `${storageQuota > 0 ? Math.min(100, (storageUsed / storageQuota) * 100) : 0}%` }}
              />
            </div>
            <p className="text-[10px] text-text-tertiary">
              {t.rich('storageOf', {
                used: () => <span className="text-text-secondary font-mono">{formatStorageSize(storageUsed)}</span>,
                total: () => formatStorageSize(storageQuota),
              })}
            </p>
            {/* Versión desplegada (build): así se ve si hay una nueva sin
                cerrar sesión — basta recargar la página tras un deploy. */}
            <p className="mt-1.5 text-[10px] text-text-muted font-mono">
              v{process.env.NEXT_PUBLIC_APP_VERSION}
            </p>
          </div>
        )}
        {collapsed && (
          <div className="py-2 border-t border-border-faint flex justify-center" title={`${formatStorageSize(storageUsed)} / ${formatStorageSize(storageQuota)} — v${process.env.NEXT_PUBLIC_APP_VERSION}`}>
            <HardDrive className="size-4 text-text-tertiary" />
          </div>
        )}

        {/* Beta: cuenta atrás del periodo de prueba (rojo al terminar) */}
        {trialDaysLeft !== null && trialLabel && !collapsed && (
          <Link href="/vault/settings" onClick={() => setMobileOpen(false)} className="block px-4 py-3 border-t border-border-faint hover:bg-bg-surface/60 transition-colors">
            <div className="flex items-center gap-2 text-xs text-text-tertiary mb-2">
              <Hourglass className={cn('size-3.5', trialDaysLeft > 0 ? 'text-amber-400/80' : 'text-red-400/90')} />
              <span>{t('betaTrial')}</span>
            </div>
            <div className="h-1.5 bg-bg-surface-2 rounded-full overflow-hidden mb-1.5">
              <div
                className={cn(
                  'h-full rounded-full transition-all duration-500 bg-gradient-to-r',
                  trialDaysLeft > 0 ? 'from-amber-500 to-amber-400' : 'from-red-500 to-red-400',
                )}
                style={{ width: `${trialDaysLeft > 0 && trialDays > 0 ? Math.min(100, (trialDaysLeft / trialDays) * 100) : 100}%` }}
              />
            </div>
            <p className={cn('text-[10px]', trialDaysLeft > 0 ? 'text-text-tertiary' : 'text-red-400/90')}>{trialLabel}</p>
          </Link>
        )}
        {trialDaysLeft !== null && trialLabel && collapsed && (
          <div className="py-2 border-t border-border-faint flex justify-center" title={`${t('betaTrial')} — ${trialLabel}`}>
            <Hourglass className={cn('size-4', trialDaysLeft > 0 ? 'text-amber-400/80' : 'text-red-400/90')} />
          </div>
        )}

        {/* Usuario */}
        <div className={cn('border-t border-border-faint', collapsed ? 'p-2' : 'p-3')}>
          <div className={cn(
            'flex items-center rounded-md hover:bg-bg-surface transition-colors group',
            collapsed ? 'justify-center p-1.5' : 'gap-3 px-2 py-2',
          )}>
            <Link href={'/vault/profile' as any} className="shrink-0" title={username ?? t('userFallback')}>
              <div className="size-8 rounded-full bg-gradient-to-br from-violet-400 to-violet-600 grid place-items-center text-xs font-medium cursor-pointer hover:shadow-[0_0_12px_-2px_rgba(139,92,246,0.5)] transition-shadow">
                {username?.[0]?.toUpperCase() ?? '?'}
              </div>
            </Link>
            {!collapsed && (
              <>
                <Link href={'/vault/profile' as any} onClick={() => setMobileOpen(false)} className="flex-1 min-w-0 cursor-pointer">
                  <div className="text-sm font-medium truncate hover:text-violet-300 transition-colors">{username ?? t('userFallback')}</div>
                  <div className="text-[10px] text-text-tertiary">{t('freePlan')}</div>
                </Link>
                <Link
                  href="/vault/settings"
                  onClick={() => setMobileOpen(false)}
                  aria-label={t('settings')}
                  className="p-1.5 rounded-md hover:bg-bg-surface-2 transition-colors"
                >
                  <Settings className="size-4 text-text-tertiary hover:text-text-secondary transition-colors" />
                </Link>
                <button
                  onClick={() => { resetVault(); logout(); router.push('/login'); }}
                  className="p-1.5 rounded-md hover:bg-bg-surface-2 transition-colors"
                  aria-label={t('logout')}
                >
                  <LogOut className="size-4 text-text-tertiary hover:text-text-secondary transition-colors" />
                </button>
              </>
            )}
          </div>
        </div>
      </aside>

      {/* ─── Main ─────────────────────────────────────────── */}
      <div className={cn('flex-1 flex flex-col min-w-0 transition-all duration-200', mainMl)}>
        <header className="h-16 border-b border-border-faint bg-bg-base/60 backdrop-blur-md flex items-center px-4 md:px-6 gap-3 md:gap-4 sticky top-0 z-20">
          {isMobile && (
            <button
              onClick={() => setMobileOpen(true)}
              className="shrink-0 p-2 -ml-1 rounded-md hover:bg-bg-surface text-text-secondary transition-colors"
              aria-label={t('openMenu')}
            >
              <Menu className="size-5" />
            </button>
          )}
          <div className="flex-1 max-w-2xl relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-text-tertiary" />
            <input
              type="search"
              placeholder={t('searchPlaceholder')}
              className="w-full h-10 pl-10 pr-12 bg-bg-surface border border-border-subtle rounded-lg text-sm placeholder:text-text-muted focus:outline-none focus:border-violet-500/60 focus:shadow-[0_0_0_3px_rgba(139,92,246,0.12)]"
            />
            <kbd className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-mono text-text-tertiary px-1.5 py-0.5 rounded border border-border-subtle bg-bg-surface-2">
              ⌘K
            </kbd>
          </div>
          <div className="text-xs text-text-tertiary font-mono">
            🟢 {t('encryptionActive')}
          </div>
        </header>

        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>

      {/* Tour de bienvenida (solo primer login de la cuenta) */}
      <OnboardingTour />
      {/* Arranque del trial de la beta (sale tras el tour, una sola vez) */}
      <TrialWelcomeModal />
      {/* Fin del trial: cuota de vuelta a free; reaparece cada sesión */}
      <TrialEndedModal />
    </div>
  );
}
