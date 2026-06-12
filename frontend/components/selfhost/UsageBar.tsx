'use client';

/**
 * Barra de uso por disco/volumen. El color sigue el % de llenado real
 * (violeta < 75, ámbar ≥ 75, rojo ≥ 90), nunca decorativo.
 */
export function UsageBar({ pct, height = 6 }: { pct: number; height?: number }) {
  const clamped = Math.min(100, Math.max(0, pct));
  const color =
    clamped >= 90 ? 'var(--color-danger)' : clamped >= 75 ? 'var(--color-warning)' : 'var(--color-violet-500)';
  return (
    <div className="rounded-full bg-bg-surface-2 overflow-hidden" style={{ height }}>
      <div
        className="h-full rounded-full"
        style={{ width: `${clamped}%`, background: color, transition: 'width 1s cubic-bezier(0.22,1,0.36,1)' }}
      />
    </div>
  );
}

export function usageColor(pct: number): string {
  return pct >= 90 ? 'var(--color-danger)' : pct >= 75 ? 'var(--color-warning)' : 'var(--color-violet-500)';
}
