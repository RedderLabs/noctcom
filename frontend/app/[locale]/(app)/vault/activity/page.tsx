'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import {
  Upload, Download, Trash2, FolderPlus, Share2, Lock, KeyRound,
  Shield, Monitor, LogIn, LogOut, Edit3, Eye,
  ChevronLeft, ChevronRight, Filter, Loader2,
} from 'lucide-react';
import { useVault } from '@/lib/vault-store';
import { cn } from '@/lib/utils';

type ActivityType =
  | 'upload' | 'download' | 'delete' | 'folder_create' | 'share'
  | 'encrypt' | 'key_rotate' | '2fa_enable' | 'device_add'
  | 'login' | 'logout' | 'rename' | 'view' | 'unknown';

const ACTIVITY_META: Record<string, { icon: typeof Upload; color: string; labelKey: string }> = {
  upload:        { icon: Upload,      color: 'text-emerald-400 bg-emerald-500/10', labelKey: 'types.upload' },
  download:      { icon: Download,    color: 'text-blue-400 bg-blue-500/10',       labelKey: 'types.download' },
  delete:        { icon: Trash2,      color: 'text-red-400 bg-red-500/10',         labelKey: 'types.delete' },
  folder_create: { icon: FolderPlus,  color: 'text-violet-400 bg-violet-500/10',   labelKey: 'types.folder_create' },
  share:         { icon: Share2,      color: 'text-amber-400 bg-amber-500/10',     labelKey: 'types.share' },
  encrypt:       { icon: Lock,        color: 'text-violet-400 bg-violet-500/10',   labelKey: 'types.encrypt' },
  key_rotate:    { icon: KeyRound,    color: 'text-orange-400 bg-orange-500/10',   labelKey: 'types.key_rotate' },
  '2fa_enable':  { icon: Shield,      color: 'text-emerald-400 bg-emerald-500/10', labelKey: 'types.2fa_enable' },
  device_add:    { icon: Monitor,     color: 'text-cyan-400 bg-cyan-500/10',       labelKey: 'types.device_add' },
  login:         { icon: LogIn,       color: 'text-emerald-400 bg-emerald-500/10', labelKey: 'types.login' },
  logout:        { icon: LogOut,      color: 'text-slate-400 bg-slate-500/10',     labelKey: 'types.logout' },
  rename:        { icon: Edit3,       color: 'text-blue-400 bg-blue-500/10',       labelKey: 'types.rename' },
  view:          { icon: Eye,         color: 'text-slate-400 bg-slate-500/10',     labelKey: 'types.view' },
  unknown:       { icon: Eye,         color: 'text-slate-400 bg-slate-500/10',     labelKey: 'types.unknown' },
};

interface Activity {
  id: string;
  type: string;
  description: string;
  target?: string;
  createdAt: string;
}

function formatTimestamp(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString('es', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function groupByDate(items: Activity[]) {
  const groups: Record<string, Activity[]> = {};
  for (const item of items) {
    const key = new Date(item.createdAt).toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' });
    (groups[key] ??= []).push(item);
  }
  return Object.entries(groups);
}

const PAGE_SIZE = 20;

export default function ActivityPage() {
  const t = useTranslations('activity');
  const { loadActivity } = useVault();
  const [activities, setActivities] = useState<Activity[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<string>('all');

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { events, total: t } = await loadActivity(PAGE_SIZE, (page - 1) * PAGE_SIZE);
      setActivities(events);
      setTotal(t);
      setLoading(false);
    })();
  }, [loadActivity, page]);

  const filtered = filterType === 'all' ? activities : activities.filter((a) => a.type === filterType);
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const grouped = groupByDate(filtered);

  const filterOptions = [
    { value: 'all', label: t('filters.all') },
    { value: 'upload', label: t('filters.upload') },
    { value: 'download', label: t('filters.download') },
    { value: 'share', label: t('filters.share') },
    { value: 'delete', label: t('filters.delete') },
    { value: 'folder_create', label: t('filters.folder_create') },
  ];

  return (
    <div className="px-8 py-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">{t('title')}</h1>
          <p className="text-sm text-text-tertiary mt-1">
            {t('subtitle')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Filter className="size-4 text-text-tertiary" />
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="h-9 px-3 bg-bg-surface border border-border-subtle rounded-lg text-sm text-text-secondary focus:outline-none focus:border-violet-500/60"
          >
            {filterOptions.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      {loading && (
        <div className="py-24 text-center">
          <Loader2 className="size-8 text-violet-400 animate-spin mx-auto mb-4" />
          <p className="text-sm text-text-tertiary">{t('loading')}</p>
        </div>
      )}

      {!loading && (
        <div className="space-y-8">
          {grouped.map(([dateLabel, items]) => (
            <section key={dateLabel}>
              <h2 className="text-[10px] uppercase tracking-widest text-text-tertiary mb-3 font-mono">
                {dateLabel}
              </h2>
              <div className="space-y-1">
                {items.map((activity) => {
                  const meta = ACTIVITY_META[activity.type] ?? ACTIVITY_META.unknown;
                  const Icon = meta.icon;
                  const metaLabel = t(meta.labelKey);
                  const [iconText, iconBg] = meta.color.split(' ');
                  return (
                    <div
                      key={activity.id}
                      className="flex items-center gap-4 px-4 py-3 rounded-lg hover:bg-bg-surface transition-colors"
                    >
                      <div className={cn('size-9 rounded-lg grid place-items-center shrink-0', iconBg)}>
                        <Icon className={cn('size-4', iconText)} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2">
                          <span className="text-sm font-medium">{activity.description}</span>
                          {activity.target && (
                            <span className="text-sm text-text-secondary truncate font-mono">
                              {activity.target}
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-text-tertiary font-mono uppercase tracking-wider">
                          {formatTimestamp(activity.createdAt)}
                        </span>
                      </div>
                      <span className={cn(
                        'text-[10px] font-mono uppercase tracking-wider px-2 py-1 rounded',
                        iconBg, iconText,
                      )}>
                        {metaLabel}
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      {!loading && activities.length === 0 && (
        <div className="py-24 text-center">
          <div className="size-16 rounded-full bg-bg-surface border border-border-subtle grid place-items-center mx-auto mb-4">
            <Eye className="size-6 text-text-tertiary" />
          </div>
          <h3 className="font-display text-lg mb-1">{t('empty.title')}</h3>
          <p className="text-sm text-text-tertiary">{t('empty.subtitle')}</p>
        </div>
      )}

      {totalPages > 1 && (
        <div className="mt-8 flex items-center justify-between text-sm">
          <span className="text-text-tertiary text-xs">
            {t('eventCount', { count: total })}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={page === 1}
              onClick={() => setPage((p) => p - 1)}
              className="h-8 w-8 grid place-items-center rounded-md text-text-secondary hover:bg-bg-surface disabled:opacity-30"
            >
              <ChevronLeft className="size-4" />
            </button>
            <span className="text-xs text-text-tertiary px-2">
              {page} / {totalPages}
            </span>
            <button
              type="button"
              disabled={page === totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="h-8 w-8 grid place-items-center rounded-md text-text-secondary hover:bg-bg-surface disabled:opacity-30"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
