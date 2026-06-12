'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  FileText, File, Image as ImageIcon, Video, Music, Archive, FileCode,
  FolderPlus, Upload, List, Grid3x3, Search, Download, Share2, Star, Trash2, ShieldCheck, Lock,
} from 'lucide-react';
import { useVault, type DecryptedNode } from '@/lib/vault-store';
import { FOLDER_ICONS, getFolderColor } from '@/components/vault/folder-icons';
import { NewFolderModal } from '@/components/vault/NewFolderModal';
import { ShareModal } from '@/components/vault/ShareModal';
import { FilePreviewModal } from '@/components/vault/FilePreviewModal';
import { CardActionsMenu } from '@/components/vault/CardActionsMenu';
import { cn, formatBytes } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { PageHeader } from '@/components/selfhost/PageHeader';

function fileIcon(mime?: string) {
  if (!mime) return File;
  if (mime.startsWith('image/')) return ImageIcon;
  if (mime.startsWith('video/')) return Video;
  if (mime.startsWith('audio/')) return Music;
  if (mime.includes('zip') || mime.includes('archive')) return Archive;
  if (mime.includes('pdf') || mime.includes('word') || mime.includes('text')) return FileText;
  if (mime.includes('code') || mime.includes('json')) return FileCode;
  return File;
}

export default function ArchivosPage() {
  const t = useTranslations('selfhost');
  const {
    nodes, loading, breadcrumb, initialized, init,
    navigateToFolder, createFolder, uploadFiles, downloadFile, deleteNode, toggleStar,
  } = useVault();
  const [view, setView] = useState<'list' | 'grid'>('list');
  const [search, setSearch] = useState('');
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [shareNode, setShareNode] = useState<DecryptedNode | null>(null);
  const [previewNode, setPreviewNode] = useState<DecryptedNode | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { init(); }, [init]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? nodes.filter((n) => n.name.toLowerCase().includes(q)) : nodes;
  }, [search, nodes]);
  const folders = filtered.filter((n) => n.kind === 'folder');
  const files = filtered.filter((n) => n.kind === 'file');

  return (
    <>
      <PageHeader
        crumbs={['bóveda', ...breadcrumb.map((b) => b.name)]}
        title={t('files.title')}
        actions={
          <>
            <input ref={fileInputRef} type="file" multiple className="hidden" onChange={(e) => {
              if (e.target.files?.length) { uploadFiles(Array.from(e.target.files)); e.target.value = ''; }
            }} />
            <Button variant="secondary" size="sm" leftIcon={<FolderPlus className="size-3.5" />} onClick={() => setNewFolderOpen(true)}>
              {t('files.newFolder')}
            </Button>
            <Button variant="primary" size="sm" leftIcon={<Upload className="size-3.5" />} onClick={() => fileInputRef.current?.click()}>
              {t('files.upload')}
            </Button>
          </>
        }
      />

      {/* Toolbar: search + view toggle */}
      <div className="flex items-center gap-3 mb-3.5">
        <div className="flex-1 max-w-md relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-text-tertiary" />
          <input
            type="search" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder={t('files.searchPlaceholder')}
            className="w-full h-9 pl-9 pr-3 bg-bg-surface border border-border-subtle rounded-md text-sm placeholder:text-text-muted focus:outline-none focus:border-violet-500/60"
          />
        </div>
        <div className="flex bg-bg-surface border border-border-subtle rounded-md p-0.5">
          <button onClick={() => setView('list')} aria-pressed={view === 'list'} className={cn('h-8 px-2.5 rounded flex items-center', view === 'list' ? 'bg-violet-500/20 text-violet-200' : 'text-text-tertiary')}>
            <List className="size-3.5" />
          </button>
          <button onClick={() => setView('grid')} aria-pressed={view === 'grid'} className={cn('h-8 px-2.5 rounded flex items-center', view === 'grid' ? 'bg-violet-500/20 text-violet-200' : 'text-text-tertiary')}>
            <Grid3x3 className="size-3.5" />
          </button>
        </div>
      </div>

      <p className="flex items-center gap-2.5 mb-4 px-0.5 text-[12.5px] text-text-tertiary">
        <ShieldCheck className="size-[15px] text-violet-300 shrink-0" />
        <span>{t.rich('files.cryptoLine', { b: (c) => <b className="text-text-secondary font-semibold">{c}</b> })}</span>
      </p>

      {loading && !initialized && (
        <div className="py-20 text-center text-sm text-text-tertiary">{t('files.loading')}</div>
      )}

      {initialized && filtered.length === 0 && (
        <div className="py-20 text-center">
          <div className="size-14 rounded-full bg-bg-surface border border-border-subtle grid place-items-center mx-auto mb-3">
            <Upload className="size-5 text-text-tertiary" />
          </div>
          <p className="text-sm text-text-tertiary">{t('files.empty')}</p>
        </div>
      )}

      {/* LIST */}
      {view === 'list' && filtered.length > 0 && (
        <div className="rounded-xl border border-border-faint bg-bg-surface overflow-hidden">
          {folders.map((n) => {
            const color = getFolderColor(n.color);
            const Icon = FOLDER_ICONS[n.icon ?? 'folder'].Icon;
            return (
              <button key={n.id} onClick={() => navigateToFolder(n.id, n.name)} className="w-full grid grid-cols-[26px_minmax(0,1fr)_auto] items-center gap-3.5 px-[18px] py-3 border-b border-border-faint last:border-0 hover:bg-bg-surface-2 transition-colors text-left">
                <Icon className={cn('size-[18px]', color.text)} />
                <div className="min-w-0">
                  <div className="text-[13.5px] font-medium truncate">{n.name}</div>
                  <div className="text-[11.5px] text-text-muted font-mono">{t('files.encFolder')}</div>
                </div>
                <CardActionsMenu actions={[{ label: t('files.delete'), icon: Trash2, onSelect: () => deleteNode(n.id), danger: true }]} />
              </button>
            );
          })}
          {files.map((n) => {
            const Icon = fileIcon(n.mimeType);
            return (
              <div key={n.id} className="group grid grid-cols-[26px_minmax(0,1fr)_auto_auto] items-center gap-3.5 px-[18px] py-3 border-b border-border-faint last:border-0 hover:bg-bg-surface-2 transition-colors">
                <button onClick={() => setPreviewNode(n)} className="contents text-left">
                  <Icon className="size-[18px] text-text-tertiary" />
                  <div className="min-w-0">
                    <div className="text-[13.5px] font-medium truncate flex items-center gap-2">
                      {n.name}
                      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-success shrink-0"><Lock className="size-2.5" />AES-256</span>
                    </div>
                    <div className="text-[11.5px] text-text-muted font-mono">{t('panel.encClient')}</div>
                  </div>
                  <span className="font-mono text-xs text-text-tertiary text-right">{formatBytes(n.size)}</span>
                </button>
                <CardActionsMenu actions={[
                  { label: n.starred ? t('files.unstar') : t('files.star'), icon: Star, onSelect: () => toggleStar(n.id) },
                  { label: t('files.share'), icon: Share2, onSelect: () => setShareNode(n) },
                  { label: t('files.download'), icon: Download, onSelect: () => downloadFile(n) },
                  { label: t('files.delete'), icon: Trash2, onSelect: () => deleteNode(n.id), danger: true },
                ]} />
              </div>
            );
          })}
        </div>
      )}

      {/* GRID */}
      {view === 'grid' && filtered.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
          {folders.map((n) => {
            const color = getFolderColor(n.color);
            const Icon = FOLDER_ICONS[n.icon ?? 'folder'].Icon;
            return (
              <button key={n.id} onClick={() => navigateToFolder(n.id, n.name)} className="p-4 rounded-xl border border-border-faint bg-bg-surface hover:bg-bg-surface-2 hover:border-border-strong transition-all text-left">
                <div className={cn('size-11 rounded-lg grid place-items-center border mb-3', color.bg, color.border)}>
                  <Icon className={cn('size-5', color.text)} />
                </div>
                <div className="text-sm font-medium truncate">{n.name}</div>
                <div className="text-[10px] text-text-tertiary uppercase tracking-wider mt-0.5">{t('files.encFolder')}</div>
              </button>
            );
          })}
          {files.map((n) => {
            const Icon = fileIcon(n.mimeType);
            return (
              <button key={n.id} onClick={() => setPreviewNode(n)} className="p-4 rounded-xl border border-border-faint bg-bg-surface hover:bg-bg-surface-2 hover:border-border-strong transition-all text-left">
                <div className="flex items-start justify-between mb-3">
                  <div className="size-11 rounded-lg grid place-items-center bg-bg-surface-2 border border-border-faint">
                    <Icon className="size-5 text-text-secondary" />
                  </div>
                  <Lock className="size-3 text-success" />
                </div>
                <div className="text-sm font-medium truncate">{n.name}</div>
                <div className="text-[10px] text-text-tertiary uppercase tracking-wider mt-0.5 font-mono">{formatBytes(n.size)}</div>
              </button>
            );
          })}
        </div>
      )}

      <NewFolderModal open={newFolderOpen} onClose={() => setNewFolderOpen(false)} onCreated={(name, icon, color) => createFolder(name, icon, color)} />
      <ShareModal open={!!shareNode} onClose={() => setShareNode(null)} node={shareNode} />
      <FilePreviewModal open={!!previewNode} onClose={() => setPreviewNode(null)} node={previewNode} />
    </>
  );
}
