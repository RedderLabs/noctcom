'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import * as Dialog from '@radix-ui/react-dialog';
import { Hourglass } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useVault } from '@/lib/vault-store';

/**
 * Modal de arranque del periodo de prueba de la beta. Aparece la primera vez
 * que el usuario entra a la app (después del tour de bienvenida, si toca) y el
 * reloj arranca en cuanto se MUESTRA — cerrarlo no lo pospone. El estado vive
 * en users.trial_started_at (NULL = aún no arrancó) y la duración la decide el
 * backend (BETA_TRIAL_DAYS). La cuenta atrás se ve en el sidebar.
 */
export function TrialWelcomeModal() {
  const t = useTranslations('trialWelcome');
  const { onboarded, trialStartedAt, trialDays, trialExempt, startTrial } = useVault();
  const [open, setOpen] = useState(false);

  // Se abre cuando /me confirma que NO hay trial (null, no undefined), la
  // cuenta no está exenta (las anteriores al lanzamiento no tienen trial) y el
  // tour de bienvenida ya no está delante. startTrial es optimista (fija la
  // fecha en el store), así que el latch local lo mantiene abierto hasta cerrarlo.
  const shouldOpen = onboarded === true && !trialExempt && trialStartedAt === null;
  useEffect(() => {
    if (shouldOpen) {
      setOpen(true);
      void startTrial(); // el reloj arranca al VER el modal
    }
  }, [shouldOpen, startTrial]);

  if (!open) return null;

  return (
    <Dialog.Root open={open} onOpenChange={(v) => { if (!v) setOpen(false); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm animate-fade-in" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 w-[calc(100%-2rem)] max-w-lg rounded-xl bg-bg-surface border border-border-subtle shadow-modal animate-fade-in focus:outline-none"
          aria-describedby={undefined}
        >
          <div className="p-6 md:p-8 text-center">
            <div className="mx-auto mb-5 size-14 rounded-2xl bg-amber-500/15 border border-amber-500/30 grid place-items-center">
              <Hourglass className="size-7 text-amber-400" />
            </div>

            <Dialog.Title className="font-display text-xl font-medium tracking-tight mb-3">
              {t('title')}
            </Dialog.Title>
            <p className="text-sm text-text-secondary leading-relaxed whitespace-pre-line">
              {t('body', { days: trialDays })}
            </p>

            <div className="mt-4 px-4 py-3 rounded-lg bg-amber-500/10 border border-amber-500/25 text-left">
              <p className="text-xs text-amber-300/90 leading-relaxed">
                {t('hint')}
              </p>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border-faint">
            <Button type="button" variant="primary" size="md" onClick={() => setOpen(false)}>
              {t('cta')}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
