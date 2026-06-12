'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { HardDrive, ShieldCheck, FileText, Clock } from 'lucide-react';
import { useRouter } from '@/i18n/navigation';
import { apiFetch } from '@/lib/api';
import { useVault, type DecryptedNode } from '@/lib/vault-store';
import { formatBytes } from '@/lib/utils';
import { PageHeader, SectionHead } from '@/components/selfhost/PageHeader';
import { CapacityRing } from '@/components/selfhost/CapacityRing';
import { UsageBar } from '@/components/selfhost/UsageBar';
import { StackChips } from '@/components/selfhost/StackChips';

interface Volume {
  id: string;
  path: string;
  label: string;
  active: boolean;
  totalBytes: number;
  freeBytes: number;
  usedBytes: number;
}

export default function PanelPage() {
  const t = useTranslations('selfhost');
  const router = useRouter();
  const { storageUsed, storageQuota, loadRecent } = useVault();
  const [volumes, setVolumes] = useState<Volume[]>([]);
  const [recent, setRecent] = useState<DecryptedNode[]>([]);

  useEffect(() => {
    apiFetch<Volume[]>('/api/v1/storage/volumes').then((v) => setVolumes(v.filter((x) => x.active))).catch(() => {});
    loadRecent().then((n) => setRecent(n.filter((x) => x.kind === 'file').slice(0, 6))).catch(() => {});
  }, [loadRecent]);

  const free = Math.max(0, storageQuota - storageUsed);

  return (
    <>
      <PageHeader crumbs={['homelab', 'panel']} title={t('panel.title')} />

      {/* ─── Hero de capacidad ─── */}
      <SectionHead title={t('panel.capacity')} meta={<span className="font-mono">{t('panel.volumesCount', { count: volumes.length })}</span>} />
      <div className="grid md:grid-cols-[auto_1fr] items-center gap-9 p-6 rounded-2xl border border-border-faint bg-bg-surface"
        style={{ background: 'radial-gradient(140% 120% at 100% 0%, rgba(139,92,246,0.07), transparent 50%), var(--color-bg-surface)' }}>
        <div className="justify-self-center">
          <CapacityRing usedBytes={storageUsed} totalBytes={storageQuota} label={t('panel.inUse')} />
        </div>
        <div className="min-w-0">
          <div className="flex items-baseline gap-2.5 flex-wrap">
            <span className="text-4xl md:text-5xl font-bold tracking-tight leading-none">{formatBytes(storageUsed)}</span>
            <span className="text-lg text-text-secondary font-medium">{t('panel.usedOf', { total: formatBytes(storageQuota) })}</span>
          </div>
          <p className="mt-2 text-[13.5px] text-text-tertiary">{t('panel.heroSub')}</p>
          <div className="mt-4 h-1.5 rounded-full bg-bg-surface-2 overflow-hidden">
            <div className="h-full rounded-full bg-gradient-to-r from-violet-500 to-violet-400 transition-all duration-1000" style={{ width: `${storageQuota > 0 ? Math.min(100, (storageUsed / storageQuota) * 100) : 0}%` }} />
          </div>
          <div className="mt-2.5 flex gap-5 flex-wrap text-xs text-text-muted">
            <span><b className="text-text-secondary font-semibold">{formatBytes(free)}</b> {t('panel.free')}</span>
          </div>
        </div>
      </div>

      <p className="flex items-center gap-2.5 mt-3.5 px-0.5 text-[12.5px] text-text-tertiary">
        <ShieldCheck className="size-[15px] text-violet-300 shrink-0" />
        <span>{t.rich('panel.cryptoLine', { b: (c) => <b className="text-text-secondary font-semibold">{c}</b> })}</span>
      </p>

      {/* ─── Discos / volúmenes ─── */}
      {volumes.length > 0 && (
        <div className="grid gap-3.5 mt-5 sm:grid-cols-2 lg:grid-cols-3">
          {volumes.map((v) => {
            const pct = v.totalBytes > 0 ? Math.round((v.usedBytes / v.totalBytes) * 100) : 0;
            return (
              <article key={v.id} className="p-[18px] rounded-xl border border-border-faint bg-bg-surface hover:border-border-subtle transition-colors">
                <div className="flex items-center gap-2.5 mb-4">
                  <span className="size-[34px] rounded-[9px] grid place-items-center bg-bg-deep border border-border-strong text-text-secondary shrink-0">
                    <HardDrive className="size-4" />
                  </span>
                  <div className="min-w-0">
                    <div className="font-mono text-[13.5px] font-semibold truncate">{v.label}</div>
                    <div className="font-mono text-[11px] text-text-muted truncate">{v.path}</div>
                  </div>
                </div>
                <div className="flex items-baseline gap-1.5 mb-2.5">
                  <span className="text-[19px] font-bold tracking-tight">{formatBytes(v.usedBytes)}</span>
                  <span className="text-[12.5px] text-text-tertiary">/ {formatBytes(v.totalBytes)}</span>
                </div>
                <UsageBar pct={pct} />
                <div className="mt-2.5 flex justify-between text-[11px] text-text-muted">
                  <span className="font-semibold" style={{ color: pct >= 90 ? 'var(--color-danger)' : pct >= 75 ? 'var(--color-warning)' : 'var(--color-violet-500)' }}>{t('panel.pctFull', { pct })}</span>
                  <span>{formatBytes(v.freeBytes)} {t('panel.free')}</span>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* ─── Archivos recientes ─── */}
      <SectionHead title={t('panel.recentFiles')} />
      <div className="rounded-xl border border-border-faint bg-bg-surface overflow-hidden">
        {recent.length === 0 && (
          <div className="px-5 py-8 text-center text-sm text-text-tertiary">{t('panel.noRecent')}</div>
        )}
        {recent.map((f) => (
          <button
            key={f.id}
            onClick={() => router.push(`/visor?f=${f.id}` as any)}
            className="w-full grid grid-cols-[26px_minmax(0,1fr)_auto] items-center gap-3.5 px-[18px] py-3 border-b border-border-faint last:border-0 hover:bg-bg-surface-2 transition-colors text-left"
          >
            <FileText className="size-[17px] text-text-tertiary" />
            <div className="min-w-0">
              <div className="text-[13.5px] font-medium truncate flex items-center gap-2">
                {f.name}
                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-success shrink-0">AES-256</span>
              </div>
              <div className="mt-0.5 text-[11.5px] text-text-muted flex items-center gap-2">
                <Clock className="size-3" />
                <span className="font-mono">{t('panel.encClient')}</span>
              </div>
            </div>
            <span className="font-mono text-xs text-text-tertiary">{formatBytes(f.size)}</span>
          </button>
        ))}
      </div>

      {/* ─── Stack LXC ─── */}
      <SectionHead title={t('panel.stackTitle')} />
      <StackChips />
    </>
  );
}
