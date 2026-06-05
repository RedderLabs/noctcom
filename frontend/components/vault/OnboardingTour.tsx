'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import * as Dialog from '@radix-ui/react-dialog';
import { ShieldCheck, KeyRound, UploadCloud, Fingerprint, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useVault } from '@/lib/vault-store';
import { cn } from '@/lib/utils';

/**
 * Tour de bienvenida del primer login. Se abre solo cuando /me dice que la
 * cuenta aún no lo vio (onboarded === false) y se marca completado tanto al
 * terminarlo como al saltarlo o cerrarlo — nunca se insiste dos veces.
 */
const STEPS = [
  { key: 'welcome', Icon: ShieldCheck },
  { key: 'phrase', Icon: KeyRound },
  { key: 'upload', Icon: UploadCloud },
  { key: 'security', Icon: Fingerprint },
  { key: 'ready', Icon: Sparkles },
] as const;

export function OnboardingTour() {
  const t = useTranslations('onboarding');
  const { onboarded, completeOnboarding } = useVault();
  const [step, setStep] = useState(0);

  const open = onboarded === false;
  if (!open) return null;

  const isLast = step === STEPS.length - 1;
  const { key, Icon } = STEPS[step]!;

  function finish() {
    void completeOnboarding();
  }

  return (
    <Dialog.Root open={open} onOpenChange={(v) => { if (!v) finish(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm animate-fade-in" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 w-[calc(100%-2rem)] max-w-lg rounded-xl bg-bg-surface border border-border-subtle shadow-modal animate-fade-in focus:outline-none"
          aria-describedby={undefined}
        >
          <div className="p-6 md:p-8 text-center">
            {/* Icono del paso */}
            <div className="mx-auto mb-5 size-14 rounded-2xl bg-violet-500/15 border border-violet-500/30 grid place-items-center">
              <Icon className="size-7 text-violet-400" />
            </div>

            <Dialog.Title className="font-display text-xl font-medium tracking-tight mb-3">
              {t(`steps.${key}.title`)}
            </Dialog.Title>
            <p className="text-sm text-text-secondary leading-relaxed whitespace-pre-line">
              {t(`steps.${key}.body`)}
            </p>

            {/* Aviso destacado solo en el paso de la frase: es el mensaje
                que más usuarios necesitan interiorizar. */}
            {key === 'phrase' && (
              <div className="mt-4 px-4 py-3 rounded-lg bg-amber-500/10 border border-amber-500/25 text-left">
                <p className="text-xs text-amber-300/90 leading-relaxed">
                  {t('steps.phrase.hint')}
                </p>
              </div>
            )}
          </div>

          {/* Progreso */}
          <div className="flex items-center justify-center gap-1.5 pb-5">
            {STEPS.map((s, i) => (
              <button
                key={s.key}
                type="button"
                onClick={() => setStep(i)}
                aria-label={t('stepOf', { current: i + 1, total: STEPS.length })}
                className={cn(
                  'h-1.5 rounded-full transition-all',
                  i === step ? 'w-6 bg-violet-500' : 'w-1.5 bg-bg-surface-2 hover:bg-border-subtle',
                )}
              />
            ))}
          </div>

          <div className="flex items-center gap-2 px-5 py-4 border-t border-border-faint">
            {!isLast && (
              <Button type="button" variant="ghost" size="md" onClick={finish}>
                {t('skip')}
              </Button>
            )}
            <div className="flex-1" />
            {step > 0 && (
              <Button type="button" variant="ghost" size="md" onClick={() => setStep(step - 1)}>
                {t('back')}
              </Button>
            )}
            {isLast ? (
              <Button type="button" variant="primary" size="md" onClick={finish}>
                {t('start')}
              </Button>
            ) : (
              <Button type="button" variant="primary" size="md" onClick={() => setStep(step + 1)}>
                {t('next')}
              </Button>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
