'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { HardDrive, Power, Trash2, Plus, RefreshCw, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api';
import { getStepUpToken } from '@/lib/step-up';
import { useVault } from '@/lib/vault-store';
import { cn, formatBytes } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { PageHeader, SectionHead } from '@/components/selfhost/PageHeader';
import { UsageBar } from '@/components/selfhost/UsageBar';

interface Volume {
  id: string;
  path: string;
  label: string;
  active: boolean;
  totalBytes: number;
  freeBytes: number;
  usedBytes: number;
}

export default function AlmacenamientoPage() {
  const t = useTranslations('selfhost');
  const { refreshStorage } = useVault();
  const [volumes, setVolumes] = useState<Volume[]>([]);
  const [scanning, setScanning] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newPath, setNewPath] = useState('');
  const [newLabel, setNewLabel] = useState('');

  const fetchVolumes = useCallback(async () => {
    try {
      const vols = await apiFetch<Volume[]>('/api/v1/storage/volumes');
      setVolumes(vols);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { fetchVolumes(); }, [fetchVolumes]);

  const rescan = async () => {
    setScanning(true);
    await fetchVolumes();
    await refreshStorage();
    setScanning(false);
    toast.success(t('storage.rescanned'));
  };

  const toggleActive = async (vol: Volume) => {
    try {
      await apiFetch(`/api/v1/storage/volumes/${vol.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ active: !vol.active }),
      });
      toast.success(vol.active ? t('storage.deactivated') : t('storage.activated'));
      fetchVolumes(); refreshStorage();
    } catch { toast.error(t('storage.updateError')); }
  };

  const remove = async (vol: Volume) => {
    try {
      const stepUpToken = await getStepUpToken();
      await apiFetch(`/api/v1/storage/volumes/${vol.id}`, {
        method: 'DELETE',
        headers: { 'x-step-up-token': stepUpToken },
      });
      toast.success(t('storage.deleted'));
      fetchVolumes(); refreshStorage();
    } catch (e: any) { toast.error(e.message ?? t('storage.deleteError')); }
  };

  const register = async () => {
    const path = newPath.trim();
    if (!path) return;
    try {
      await apiFetch('/api/v1/storage/volumes', {
        method: 'POST',
        body: JSON.stringify({ path, label: newLabel.trim() || undefined }),
      });
      toast.success(t('storage.registered'));
      setNewPath(''); setNewLabel(''); setAdding(false);
      fetchVolumes(); refreshStorage();
    } catch (e: any) { toast.error(e.message ?? t('storage.registerError')); }
  };

  const active = volumes.filter((v) => v.active);
  const totalBytes = active.reduce((s, v) => s + v.totalBytes, 0);
  const usedBytes = active.reduce((s, v) => s + v.usedBytes, 0);
  const freeBytes = Math.max(0, totalBytes - usedBytes);
  const aggPct = totalBytes > 0 ? Math.round((usedBytes / totalBytes) * 100) : 0;

  return (
    <>
      <PageHeader
        crumbs={['homelab', 'discos']}
        title={t('storage.title')}
        actions={
          <Button variant="ghost" size="sm" onClick={rescan} disabled={scanning}>
            <RefreshCw className={cn('size-3.5', scanning && 'animate-spin')} />
            <span>{t('storage.rescan')}</span>
          </Button>
        }
      />

      {/* ─── Uso agregado ─── */}
      <SectionHead title={t('storage.aggregate')} meta={<span className="font-mono">{t('storage.physicalVolumes', { count: active.length })}</span>} />
      <div className="p-6 rounded-xl border border-border-faint bg-bg-surface">
        <div className="flex items-baseline gap-2.5 flex-wrap mb-4">
          <span className="text-3xl font-bold tracking-tight">{formatBytes(usedBytes)}</span>
          <span className="text-[15px] text-text-secondary">{t('panel.usedOf', { total: formatBytes(totalBytes) })}</span>
          <span className="ml-auto font-mono text-xs text-text-muted">{formatBytes(freeBytes)} {t('panel.free')}</span>
        </div>
        <UsageBar pct={aggPct} height={8} />
      </div>

      <p className="flex items-center gap-2.5 mt-3.5 px-0.5 text-[12.5px] text-text-tertiary">
        <ShieldCheck className="size-[15px] text-violet-300 shrink-0" />
        <span>{t.rich('storage.cryptoLine', { b: (c) => <b className="text-text-secondary font-semibold">{c}</b> })}</span>
      </p>

      {/* ─── Volúmenes ─── */}
      <SectionHead
        title={t('storage.volumes')}
        meta={
          <button onClick={() => setAdding((v) => !v)} className="inline-flex items-center gap-1.5 text-violet-300 hover:text-violet-200 transition-colors">
            <Plus className="size-3.5" />{t('storage.addVolume')}
          </button>
        }
      />

      {adding && (
        <div className="mb-4 p-4 rounded-xl border border-border-subtle bg-bg-surface">
          <p className="text-xs text-text-tertiary mb-3">{t('storage.addHint')}</p>
          <div className="flex flex-col sm:flex-row gap-2">
            <Input value={newPath} onChange={(e) => setNewPath(e.target.value)} placeholder="/mnt/datos" className="flex-1 font-mono" />
            <Input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder={t('storage.labelPlaceholder')} className="flex-1" />
            <Button size="sm" onClick={register} disabled={!newPath.trim()}>{t('storage.register')}</Button>
          </div>
        </div>
      )}

      {volumes.length === 0 && (
        <div className="px-5 py-10 rounded-xl border border-dashed border-border-faint bg-bg-surface text-center text-sm text-text-tertiary">
          {t('storage.empty')}
        </div>
      )}

      <div className="space-y-3">
        {volumes.map((v) => {
          const pct = v.totalBytes > 0 ? Math.round((v.usedBytes / v.totalBytes) * 100) : 0;
          const offline = v.totalBytes === 0;
          return (
            <article key={v.id} className={cn('p-5 rounded-xl border bg-bg-surface', v.active ? 'border-border-subtle' : 'border-border-faint')}>
              <div className="flex items-center gap-3">
                <span className="size-10 rounded-lg grid place-items-center shrink-0 bg-bg-deep border border-border-strong text-text-secondary">
                  <HardDrive className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-semibold truncate">{v.label}</span>
                    {v.active && <span className="text-[10px] font-mono uppercase tracking-wider text-violet-300 bg-violet-500/10 px-1.5 py-0.5 rounded">{t('storage.activeBadge')}</span>}
                    {offline && <span className="text-[10px] font-mono uppercase tracking-wider text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded">{t('storage.offline')}</span>}
                  </div>
                  <p className="font-mono text-xs text-text-tertiary mt-0.5 truncate">{v.path}</p>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-base font-bold tracking-tight">{formatBytes(v.usedBytes)}</div>
                  <div className="text-[11px] text-text-tertiary">/ {formatBytes(v.totalBytes)}</div>
                </div>
              </div>

              {!offline && (
                <div className="mt-4">
                  <UsageBar pct={pct} height={8} />
                  <div className="mt-2 flex justify-between text-xs">
                    <span className="font-mono font-semibold" style={{ color: pct >= 90 ? 'var(--color-danger)' : pct >= 75 ? 'var(--color-warning)' : 'var(--color-violet-500)' }}>{t('panel.pctFull', { pct })}</span>
                    <span className="text-text-muted">{formatBytes(v.freeBytes)} {t('panel.free')}</span>
                  </div>
                </div>
              )}

              <div className="mt-4 flex items-center gap-2 border-t border-border-faint pt-3">
                <Button variant="ghost" size="sm" onClick={() => toggleActive(v)}>
                  <Power className="size-3.5" />
                  <span>{v.active ? t('storage.deactivate') : t('storage.activate')}</span>
                </Button>
                {!v.active && (
                  <Button variant="ghost" size="sm" onClick={() => remove(v)}>
                    <Trash2 className="size-3.5" />
                    <span>{t('storage.delete')}</span>
                  </Button>
                )}
              </div>
            </article>
          );
        })}
      </div>

      <div className="mt-7 p-5 rounded-xl border border-border-faint bg-bg-deep">
        <p className="text-xs leading-relaxed text-text-tertiary">
          {t.rich('storage.note', { b: (c) => <b className="text-violet-300 font-semibold">{c}</b> })}
        </p>
      </div>
    </>
  );
}
