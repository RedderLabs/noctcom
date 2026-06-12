'use client';

import { formatBytes } from '@/lib/utils';

/**
 * Anillo de capacidad del panel self-host. Arco SVG con el % en uso; el color
 * sigue el estado real (violeta < 75 %, ámbar ≥ 75 %, rojo ≥ 90 %), nunca
 * decorativo. Cifras derivadas de la capacidad REAL de los discos (statfs),
 * no de una cuota de plan.
 */
export function CapacityRing({
  usedBytes,
  totalBytes,
  size = 132,
  label,
}: {
  usedBytes: number;
  totalBytes: number;
  size?: number;
  label: string;
}) {
  const pct = totalBytes > 0 ? Math.min(100, Math.round((usedBytes / totalBytes) * 100)) : 0;
  const r = 52;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - pct / 100);
  const color =
    pct >= 90 ? 'var(--color-danger)' : pct >= 75 ? 'var(--color-warning)' : 'var(--color-violet-500)';

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img"
      aria-label={`${formatBytes(usedBytes)} de ${formatBytes(totalBytes)}, ${pct}%`}>
      <svg viewBox="0 0 120 120" className="-rotate-90 w-full h-full">
        <circle cx="60" cy="60" r={r} fill="none" strokeWidth="9" className="stroke-border-strong" />
        <circle
          cx="60" cy="60" r={r} fill="none" strokeWidth="9" strokeLinecap="round"
          stroke={color}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 1.1s cubic-bezier(0.22,1,0.36,1)', filter: 'drop-shadow(0 0 5px rgba(139,92,246,0.45))' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5">
        <b className="text-2xl font-bold tracking-tight tabular-nums">{pct}%</b>
        <span className="text-[10.5px] text-text-tertiary tracking-wide">{label}</span>
      </div>
    </div>
  );
}
