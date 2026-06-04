'use client';

import { Toaster } from 'sonner';
import { useEffect } from 'react';
import { useTheme } from '@/lib/theme';

// Toaster de sonner que sigue el tema activo. Los colores van por variables CSS,
// así que se adaptan solos; el prop `theme` solo ajusta el estilado interno de sonner.
export function ThemedToaster() {
  const { theme, hydrate } = useTheme();

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  return (
    <Toaster
      theme={theme}
      position="bottom-right"
      toastOptions={{
        style: {
          background: 'var(--color-bg-surface-2)',
          border: '1px solid var(--color-border-subtle)',
          color: 'var(--color-text-primary)',
        },
      }}
    />
  );
}
