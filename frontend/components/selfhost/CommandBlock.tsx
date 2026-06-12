'use client';

import { useState } from 'react';
import { Check, Copy, Terminal } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { copyText } from '@/lib/clipboard';
import { cn } from '@/lib/utils';

interface Props {
  /** Comando a mostrar y copiar (texto plano, sin prompt). */
  command: string;
  /** Etiqueta opcional sobre el bloque (p. ej. "Instalar"). */
  label?: string;
  /** Comentario tenue que precede al comando (sin '#'). */
  comment?: string;
  className?: string;
}

/**
 * Bloque de terminal con copiar-al-portapapeles. Funciona en HTTP plano
 * (self-host LAN) vía lib/clipboard. El botón anuncia su estado y respeta
 * el teclado/foco; el comando se selecciona como texto.
 */
export function CommandBlock({ command, label, comment, className }: Props) {
  const t = useTranslations('selfhostProxmox');
  const [copied, setCopied] = useState(false);

  async function onCopy() {
    const ok = await copyText(command);
    if (!ok) return;
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div
      className={cn(
        'group relative overflow-hidden rounded-xl border border-border-subtle bg-bg-deep',
        className,
      )}
    >
      {/* Barra superior estilo terminal */}
      <div className="flex items-center gap-2 border-b border-border-faint px-4 py-2.5">
        <Terminal className="size-3.5 text-text-muted" aria-hidden />
        <span className="font-mono text-[11px] uppercase tracking-wider text-text-muted">
          {label ?? 'bash'}
        </span>
        <button
          type="button"
          onClick={onCopy}
          aria-label={copied ? t('copied') : t('copy')}
          className={cn(
            'ml-auto inline-flex items-center gap-1.5 rounded-md px-2 py-1',
            'font-mono text-[11px] transition-colors',
            copied
              ? 'text-success'
              : 'text-text-tertiary hover:text-violet-300 hover:bg-violet-500/10',
          )}
        >
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          <span>{copied ? t('copied') : t('copy')}</span>
        </button>
      </div>

      {/* Cuerpo */}
      <div className="overflow-x-auto px-4 py-3.5 font-mono text-[13px] leading-relaxed">
        {comment && <div className="text-text-muted select-none">{`# ${comment}`}</div>}
        <code className="block whitespace-pre text-violet-200">
          <span className="select-none text-text-muted">$ </span>
          {command}
        </code>
      </div>
    </div>
  );
}
