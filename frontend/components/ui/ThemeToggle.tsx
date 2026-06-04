'use client';

import { useEffect } from 'react';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from '@/lib/theme';
import { cn } from '@/lib/utils';

// Botón para alternar tema claro/oscuro. El primer render (servidor y primer
// pintado en cliente) usa el valor 'dark' del store, así que coincide y no hay
// mismatch de hidratación; hydrate() lo ajusta justo después.
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggle, hydrate } = useTheme();

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  const isLight = theme === 'light';
  const label = isLight ? 'Cambiar a tema oscuro' : 'Cambiar a tema claro';

  return (
    <button
      type="button"
      onClick={toggle}
      title={label}
      aria-label={label}
      className={cn(
        'size-7 grid place-items-center rounded-md text-text-secondary',
        'bg-bg-surface border border-border-faint',
        'hover:text-text-primary hover:border-border-subtle transition-colors',
        'focus:outline-none focus-visible:border-violet-500/60',
        className,
      )}
    >
      {isLight ? <Moon className="size-3.5" /> : <Sun className="size-3.5" />}
    </button>
  );
}
