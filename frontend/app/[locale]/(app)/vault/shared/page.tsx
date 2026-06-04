'use client';

import { useState, useEffect } from 'react';
import {
  Share2, Link2, Users, Clock, MoreVertical, Copy, Trash2,
  FileText, Image, File, ExternalLink, Shield,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/Button';
import { useVault } from '@/lib/vault-store';
import { cn } from '@/lib/utils';

type ShareDirection = 'outgoing' | 'incoming';

interface ShareItem {
  id: string;
  nodeId: string;
  kind?: string;
  permission: string;
  sealedKey?: string;
  sharedByUsername?: string;
  sharedWithUsername?: string;
  nameEncrypted?: string;
  nameNonce?: string;
  ciphertextSize?: number;
  currentVersionId?: string;
  createdAt: string;
  expiresAt?: string;
}

function formatSize(bytes?: number) {
  if (!bytes) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function SharedPage() {
  const t = useTranslations('shared');
  const { loadShares, revokeShare } = useVault();
  const [tab, setTab] = useState<ShareDirection | 'all'>('all');
  const [incoming, setIncoming] = useState<ShareItem[]>([]);
  const [outgoing, setOutgoing] = useState<ShareItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [inc, out] = await Promise.all([loadShares('incoming'), loadShares('outgoing')]);
      setIncoming(inc);
      setOutgoing(out);
      setLoading(false);
    })();
  }, [loadShares]);

  const allShares = [
    ...incoming.map((s) => ({ ...s, direction: 'incoming' as const })),
    ...outgoing.map((s) => ({ ...s, direction: 'outgoing' as const })),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const filtered = tab === 'all' ? allShares : allShares.filter((s) => s.direction === tab);

  const tabs = [
    { value: 'all' as const, label: t('tabs.all'), count: allShares.length },
    { value: 'outgoing' as const, label: t('tabs.outgoing'), count: outgoing.length },
    { value: 'incoming' as const, label: t('tabs.incoming'), count: incoming.length },
  ];

  async function handleRevoke(shareId: string) {
    await revokeShare(shareId);
    setOutgoing((prev) => prev.filter((s) => s.id !== shareId));
  }

  return (
    <div className="px-8 py-6 max-w-5xl mx-auto flex flex-col min-h-full">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">{t('title')}</h1>
          <p className="text-sm text-text-tertiary mt-1">
            {t('subtitle')}
          </p>
        </div>
      </div>

      <div className="flex gap-1 mb-6 p-1 bg-bg-surface rounded-lg border border-border-faint w-fit">
        {tabs.map((t) => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={cn(
              'px-4 py-2 rounded-md text-sm transition-colors',
              tab === t.value
                ? 'bg-violet-500/20 text-violet-200'
                : 'text-text-tertiary hover:text-text-secondary',
            )}
          >
            {t.label}
            <span className="ml-1.5 text-[10px] font-mono opacity-60">{t.count}</span>
          </button>
        ))}
      </div>

      {loading && (
        <div className="py-24 text-center">
          <Loader2 className="size-8 text-violet-400 animate-spin mx-auto mb-4" />
          <p className="text-sm text-text-tertiary">{t('loading')}</p>
        </div>
      )}

      {!loading && (
        <div className="space-y-2">
          {filtered.map((item) => {
            const isOutgoing = item.direction === 'outgoing';
            return (
              <div
                key={item.id}
                className="flex items-center gap-4 p-4 rounded-xl border border-border-faint bg-bg-surface hover:border-border-subtle transition-all group"
              >
                <div className={cn(
                  'size-11 rounded-lg grid place-items-center shrink-0',
                  isOutgoing ? 'bg-violet-500/10 border border-violet-500/20' : 'bg-blue-500/10 border border-blue-500/20',
                )}>
                  <Share2 className={cn('size-5', isOutgoing ? 'text-violet-300' : 'text-blue-300')} />
                </div>

                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-medium truncate">
                    {isOutgoing ? t('sharedWith', { name: item.sharedWithUsername ?? '—' }) : t('receivedFrom', { name: item.sharedByUsername ?? '—' })}
                  </h3>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-[10px] text-text-tertiary font-mono uppercase tracking-wider flex items-center gap-1">
                      {isOutgoing ? (
                        <><Users className="size-3" /> {item.sharedWithUsername}</>
                      ) : (
                        <><ExternalLink className="size-3" /> {item.sharedByUsername}</>
                      )}
                    </span>
                    <span className="text-[10px] text-text-muted">·</span>
                    <span className="text-[10px] text-text-muted flex items-center gap-1">
                      <Clock className="size-3" /> {formatDate(item.createdAt)}
                    </span>
                    {item.ciphertextSize ? (
                      <>
                        <span className="text-[10px] text-text-muted">·</span>
                        <span className="text-[10px] text-text-muted font-mono">{formatSize(item.ciphertextSize)}</span>
                      </>
                    ) : null}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className={cn(
                    'text-[10px] font-mono uppercase tracking-wider px-2 py-1 rounded',
                    item.permission === 'write'
                      ? 'bg-amber-500/10 text-amber-300'
                      : 'bg-emerald-500/10 text-emerald-300',
                  )}>
                    {item.permission === 'write' ? t('permission.write') : t('permission.read')}
                  </span>
                  {item.expiresAt && (
                    <span className="text-[10px] text-text-muted font-mono">
                      {t('expires', { date: formatDate(item.expiresAt) })}
                    </span>
                  )}
                  {isOutgoing && (
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        className="p-1.5 rounded-md hover:bg-red-500/10"
                        onClick={() => handleRevoke(item.id)}
                      >
                        <Trash2 className="size-3.5 text-red-400" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <div className="py-24 text-center">
          <div className="size-16 rounded-full bg-bg-surface border border-border-subtle grid place-items-center mx-auto mb-4">
            <Share2 className="size-6 text-text-tertiary" />
          </div>
          <h3 className="font-display text-lg mb-1">{t('empty.title')}</h3>
          <p className="text-sm text-text-tertiary">
            {t('empty.description')}
          </p>
        </div>
      )}

      <div className="mt-auto p-4 rounded-xl bg-violet-500/5 border border-violet-500/20">
        <div className="flex items-start gap-3">
          <Shield className="size-5 text-violet-300 mt-0.5 shrink-0" />
          <div>
            <h4 className="text-sm font-medium text-violet-200 mb-1">{t('e2e.title')}</h4>
            <p className="text-xs text-text-tertiary leading-relaxed">
              {t('e2e.description')}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
