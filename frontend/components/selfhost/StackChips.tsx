'use client';

import { useStackHealth, type StackService } from '@/lib/use-stack-health';
import { cn } from '@/lib/utils';

// Nombre bonito por servicio (el endpoint usa el id en minúsculas).
const LABELS: Record<string, string> = {
  postgres: 'PostgreSQL',
  redis: 'Redis',
  minio: 'MinIO',
  backend: 'Backend',
  caddy: 'Caddy',
};

function Chip({ svc }: { svc: StackService }) {
  const ok = svc.status === 'ok';
  return (
    <div className="flex items-center gap-2 h-[34px] px-3 rounded-full border border-border-faint bg-bg-surface text-xs text-text-secondary">
      <span
        className={cn(
          'size-[7px] rounded-full shrink-0',
          ok ? 'bg-success motion-safe:animate-pulse' : 'bg-danger',
        )}
        style={ok ? { boxShadow: '0 0 0 0 rgba(52,211,153,0.5)' } : undefined}
      />
      <span className="font-mono font-medium">{LABELS[svc.service] ?? svc.service}</span>
      <span className={cn('font-mono text-[10.5px] tracking-wide', ok ? 'text-text-muted' : 'text-danger')}>
        {svc.status}
      </span>
    </div>
  );
}

/**
 * Chips de salud del stack LXC (Postgres/Redis/MinIO/Backend/Caddy). Sondea el
 * backend cada 15 s. Honestidad: backend/caddy se infieren "arriba" (la
 * petición llegó por ellos); el resto se comprueba de verdad por red.
 */
export function StackChips() {
  const { services } = useStackHealth();
  return (
    <div className="flex flex-wrap gap-2.5">
      {services.map((s) => <Chip key={s.service} svc={s} />)}
    </div>
  );
}
