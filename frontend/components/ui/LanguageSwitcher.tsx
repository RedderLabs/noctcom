'use client';

import { useLocale, useTranslations } from 'next-intl';
import { Languages } from 'lucide-react';
import { usePathname, useRouter } from '@/i18n/navigation';
import { cn } from '@/lib/utils';

// Alterna entre español e inglés conservando la página actual. usePathname de
// next-intl devuelve la ruta SIN el prefijo de idioma, así que router.replace
// con { locale } reconstruye la URL correcta (/precios ↔ /en/precios).
export function LanguageSwitcher({ className }: { className?: string }) {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const t = useTranslations('common');

  const next = locale === 'es' ? 'en' : 'es';
  const label = next === 'en' ? t('switchToEnglish') : t('switchToSpanish');

  function switchLang() {
    router.replace(pathname, { locale: next });
  }

  return (
    <button
      type="button"
      onClick={switchLang}
      title={label}
      aria-label={label}
      className={cn(
        'h-7 inline-flex items-center gap-1.5 px-2 rounded-md text-text-secondary',
        'bg-bg-surface border border-border-faint',
        'hover:text-text-primary hover:border-border-subtle transition-colors',
        'focus:outline-none focus-visible:border-violet-500/60',
        className,
      )}
    >
      <Languages className="size-3.5" />
      <span className="text-[11px] font-mono uppercase tracking-wide">{locale}</span>
    </button>
  );
}
