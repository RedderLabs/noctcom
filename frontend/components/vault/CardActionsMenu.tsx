'use client';

import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { MoreVertical, type LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

export type CardAction = {
  label: string;
  icon: LucideIcon;
  onSelect: () => void;
  danger?: boolean;
};

/**
 * Menú de acciones (⋮) para tarjetas de archivo/carpeta.
 * Siempre visible (no depende de hover) para que funcione en táctil.
 * Para el trigger frenamos mouse/touch/pointer down así no choca con el drag.
 */
export function CardActionsMenu({ actions, className }: { actions: CardAction[]; className?: string }) {
  const t = useTranslations('cardActions');
  const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label={t('menuAriaLabel')}
          className={cn(
            'p-1.5 rounded-md text-text-tertiary hover:text-text-primary hover:bg-bg-surface-3 transition-colors',
            className,
          )}
          onClick={stop}
          onMouseDown={stop}
          onTouchStart={stop}
          onPointerDown={stop}
        >
          <MoreVertical className="size-4" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          onClick={stop}
          className="z-50 min-w-[190px] rounded-xl border border-border-subtle bg-bg-surface-2 p-1.5 shadow-[0_8px_30px_-8px_rgba(0,0,0,0.6)]"
        >
          {actions.map((a) => {
            const Icon = a.icon;
            return (
              <DropdownMenu.Item
                key={a.label}
                onSelect={a.onSelect}
                className={cn(
                  'flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm cursor-pointer outline-none select-none',
                  'data-[highlighted]:bg-bg-surface-3',
                  a.danger ? 'text-red-400' : 'text-text-secondary',
                )}
              >
                <Icon className="size-4 shrink-0" />
                {a.label}
              </DropdownMenu.Item>
            );
          })}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
