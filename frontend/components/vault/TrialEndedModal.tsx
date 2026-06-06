'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import * as Dialog from '@radix-ui/react-dialog';
import { TimerOff } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/Button';
import { useVault } from '@/lib/vault-store';

// Días restantes del trial (0 = terminado). null = no aplica (exento/no arrancó).
export function trialDaysLeft(
  startedAt: string | null | undefined, days: number, exempt: boolean,
): number | null {
  if (exempt || !startedAt) return null;
  const end = new Date(startedAt).getTime() + days * 86_400_000;
  return Math.max(0, Math.ceil((end - Date.now()) / 86_400_000));
}

/**
 * Fin del periodo de prueba de la beta. Aparece cuando el contador llega a 0 y
 * la cuenta sigue en free: la cuota volvió a 1 GB (lo que exceda queda en
 * solo-lectura: descargar y borrar siguen funcionando) y el Connector queda
 * para los planes de pago. Se puede cerrar — la cuenta free vive para siempre,
 * no se borra nada — pero reaparece en cada sesión.
 */
export function TrialEndedModal() {
  const t = useTranslations('trialEnded');
  const { trialStartedAt, trialDays, trialExempt, plan } = useVault();
  const [dismissed, setDismissed] = useState(false);

  const daysLeft = trialDaysLeft(trialStartedAt, trialDays, trialExempt);
  const open = !dismissed && daysLeft === 0 && plan === 'free';
  if (!open) return null;

  return (
    <Dialog.Root open={open} onOpenChange={(v) => { if (!v) setDismissed(true); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm animate-fade-in" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 w-[calc(100%-2rem)] max-w-lg rounded-xl bg-bg-surface border border-border-subtle shadow-modal animate-fade-in focus:outline-none"
          aria-describedby={undefined}
        >
          <div className="p-6 md:p-8 text-center">
            <div className="mx-auto mb-5 size-14 rounded-2xl bg-red-500/15 border border-red-500/30 grid place-items-center">
              <TimerOff className="size-7 text-red-400" />
            </div>

            <Dialog.Title className="font-display text-xl font-medium tracking-tight mb-3">
              {t('title')}
            </Dialog.Title>
            <p className="text-sm text-text-secondary leading-relaxed whitespace-pre-line">
              {t('body')}
            </p>

            <div className="mt-4 px-4 py-3 rounded-lg bg-violet-500/10 border border-violet-500/25 text-left">
              <p className="text-xs text-violet-300/90 leading-relaxed">
                {t('hint')}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 px-5 py-4 border-t border-border-faint">
            <Button type="button" variant="ghost" size="md" onClick={() => setDismissed(true)}>
              {t('stayFree')}
            </Button>
            <div className="flex-1" />
            <Link href="/vault/settings" onClick={() => setDismissed(true)}>
              <Button type="button" variant="primary" size="md">
                {t('seePlans')}
              </Button>
            </Link>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
