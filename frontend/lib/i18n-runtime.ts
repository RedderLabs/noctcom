import esMessages from '@/messages/es.json';
import enMessages from '@/messages/en.json';

// i18n para código FUERA de React (stores zustand, helpers): no hay hooks aquí,
// así que leemos el idioma activo de <html lang> (lo fija el layout/script) y
// resolvemos la clave del catálogo. Soporta interpolación simple {var}.
// Para componentes React usa SIEMPRE useTranslations de next-intl.
const catalogs: Record<string, any> = { es: esMessages, en: enMessages };

function activeLocale(): 'es' | 'en' {
  if (typeof document !== 'undefined' && document.documentElement.lang === 'en') return 'en';
  return 'es';
}

export function rt(path: string, vars?: Record<string, string | number>): string {
  const locale = activeLocale();
  let cur: any = catalogs[locale];
  for (const key of path.split('.')) cur = cur?.[key];
  let out = typeof cur === 'string' ? cur : path;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      out = out.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    }
  }
  return out;
}
