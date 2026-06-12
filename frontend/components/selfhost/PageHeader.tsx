'use client';

import type { ReactNode } from 'react';

/**
 * Cabecera de página del panel self-host: migas (mono, "verdad del sistema") +
 * título. Densidad de panel, no aire de landing.
 */
export function PageHeader({
  crumbs,
  title,
  actions,
}: {
  crumbs: string[];
  title: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-4 mb-6">
      <div>
        <div className="font-mono text-xs text-text-tertiary flex items-center gap-1.5">
          {crumbs.map((c, i) => (
            <span key={i} className="flex items-center gap-1.5">
              {i > 0 && <span className="text-text-muted">/</span>}
              <span className={i === crumbs.length - 1 ? 'text-text-secondary' : ''}>{c}</span>
            </span>
          ))}
        </div>
        <h1 className="mt-1 text-2xl font-display font-semibold tracking-tight">{title}</h1>
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}

/** Encabezado de sección (mayúsculas, atenuado) con meta opcional a la derecha. */
export function SectionHead({ title, meta }: { title: string; meta?: ReactNode }) {
  return (
    <div className="flex items-baseline gap-3 mt-9 mb-4 first:mt-0">
      <h2 className="text-[13px] font-semibold uppercase tracking-wide text-text-tertiary">{title}</h2>
      {meta && <span className="ml-auto text-xs text-text-muted">{meta}</span>}
    </div>
  );
}
