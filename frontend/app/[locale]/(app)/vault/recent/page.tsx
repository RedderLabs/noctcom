'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import {
  FileText, File, Image, Video, Music, Archive, FileCode,
  Clock, Download, Star, Loader2, Share2, Trash2, Eye,
} from 'lucide-react';
import { useVault, type DecryptedNode } from '@/lib/vault-store';
import { CardActionsMenu } from '@/components/vault/CardActionsMenu';
import { ShareModal } from '@/components/vault/ShareModal';
import { FilePreviewModal } from '@/components/vault/FilePreviewModal';

function getFileIcon(mime?: string) {
  if (!mime) return File;
  if (mime.startsWith('image/')) return Image;
  if (mime.startsWith('video/')) return Video;
  if (mime.startsWith('audio/')) return Music;
  if (mime.includes('zip') || mime.includes('archive')) return Archive;
  if (mime.includes('pdf') || mime.includes('word') || mime.includes('text')) return FileText;
  if (mime.includes('code') || mime.includes('json')) return FileCode;
  return File;
}

function formatSize(bytes: number) {
  if (!bytes) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0; let n = bytes;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}

function timeAgo(iso: string, t: ReturnType<typeof useTranslations>) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return t('timeAgo.now');
  if (diff < 3600) return t('timeAgo.minutes', { count: Math.floor(diff / 60) });
  if (diff < 86400) return t('timeAgo.hours', { count: Math.floor(diff / 3600) });
  if (diff < 172800) return t('timeAgo.yesterday');
  return t('timeAgo.days', { count: Math.floor(diff / 86400) });
}

export default function RecentPage() {
  const t = useTranslations('recent');
  const { loadRecent, downloadFile, toggleStar, deleteNode } = useVault();
  const [items, setItems] = useState<DecryptedNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [shareNode, setShareNode] = useState<DecryptedNode | null>(null);
  const [previewNode, setPreviewNode] = useState<DecryptedNode | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const recent = await loadRecent();
      setItems(recent);
      setLoading(false);
    })();
  }, [loadRecent]);

  async function handleStar(nodeId: string) {
    await toggleStar(nodeId);
    setItems((prev) => prev.map((n) => n.id === nodeId ? { ...n, starred: !n.starred } : n));
  }

  async function handleDelete(nodeId: string) {
    await deleteNode(nodeId);
    setItems((prev) => prev.filter((n) => n.id !== nodeId));
  }

  return (
    <div className="px-8 py-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-sm text-text-tertiary mt-1">
          {t('subtitle')}
        </p>
      </div>

      {loading && (
        <div className="py-24 text-center">
          <Loader2 className="size-8 text-violet-400 animate-spin mx-auto mb-4" />
          <p className="text-sm text-text-tertiary">{t('loading')}</p>
        </div>
      )}

      {!loading && (
        <div className="space-y-1">
          {items.map((file) => {
            const Icon = getFileIcon(file.mimeType);
            return (
              <div
                key={file.id}
                onClick={() => setPreviewNode(file)}
                className="flex items-center gap-4 px-4 py-3 rounded-lg hover:bg-bg-surface transition-colors group cursor-pointer"
              >
                <div className="size-10 rounded-lg bg-bg-surface-2 border border-border-faint grid place-items-center shrink-0">
                  <Icon className="size-4 text-text-secondary" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-medium truncate">{file.name}</h3>
                  <span className="text-[10px] text-text-tertiary font-mono uppercase tracking-wider">
                    {formatSize(file.size)}
                  </span>
                </div>
                {file.starred && <Star className="size-3.5 fill-amber-400 text-amber-400 shrink-0" />}
                <span className="text-xs text-text-muted flex items-center gap-1 min-w-[100px] justify-end">
                  <Clock className="size-3" />
                  {timeAgo(file.updatedAt, t)}
                </span>
                <CardActionsMenu
                  actions={[
                    { label: t('actions.open'), icon: Eye, onSelect: () => setPreviewNode(file) },
                    { label: file.starred ? t('actions.unstar') : t('actions.star'), icon: Star, onSelect: () => handleStar(file.id) },
                    { label: t('actions.share'), icon: Share2, onSelect: () => setShareNode(file) },
                    { label: t('actions.download'), icon: Download, onSelect: () => downloadFile(file) },
                    { label: t('actions.delete'), icon: Trash2, onSelect: () => handleDelete(file.id), danger: true },
                  ]}
                />
              </div>
            );
          })}
        </div>
      )}

      {!loading && items.length === 0 && (
        <div className="py-24 text-center">
          <div className="size-16 rounded-full bg-bg-surface border border-border-subtle grid place-items-center mx-auto mb-4">
            <Clock className="size-6 text-text-tertiary" />
          </div>
          <h3 className="font-display text-lg mb-1">{t('empty.title')}</h3>
          <p className="text-sm text-text-tertiary">{t('empty.description')}</p>
        </div>
      )}

      <ShareModal open={!!shareNode} onClose={() => setShareNode(null)} node={shareNode} />
      <FilePreviewModal open={!!previewNode} onClose={() => setPreviewNode(null)} node={previewNode} />
    </div>
  );
}
