'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { useDropzone } from 'react-dropzone';
import {
  DndContext, useDraggable, useDroppable, DragOverlay,
  MouseSensor, TouchSensor, useSensor, useSensors,
  type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core';
import {
  FileText, File, Image, Video, Music, Archive, FileCode,
  ChevronRight, Star, Download, Trash2, Share2,
  Upload, FolderPlus, Grid3x3, List, Filter, ChevronLeft,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { FOLDER_ICONS, type FolderIconKey, getFolderColor, type FolderColorKey } from '@/components/vault/folder-icons';
import { NewFolderModal } from '@/components/vault/NewFolderModal';
import { ShareModal } from '@/components/vault/ShareModal';
import { FilePreviewModal } from '@/components/vault/FilePreviewModal';
import { CardActionsMenu } from '@/components/vault/CardActionsMenu';
import { useVault, type DecryptedNode } from '@/lib/vault-store';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 24;

function fileIcon(mime?: string) {
  if (!mime) return File;
  if (mime.startsWith('image/')) return Image;
  if (mime.startsWith('video/')) return Video;
  if (mime.startsWith('audio/')) return Music;
  if (mime.includes('zip') || mime.includes('archive')) return Archive;
  if (mime.includes('pdf') || mime.includes('word') || mime.includes('text')) return FileText;
  if (mime.includes('code') || mime.includes('json')) return FileCode;
  return File;
}

function formatSize(bytes?: number) {
  if (!bytes) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}

type VaultT = ReturnType<typeof useTranslations<'vault'>>;

function formatDate(iso: string, t: VaultT, locale: string) {
  const d = new Date(iso);
  const now = new Date();
  const diff = (now.getTime() - d.getTime()) / 1000 / 60 / 60 / 24;
  if (diff < 1) return t('date.today');
  if (diff < 2) return t('date.yesterday');
  if (diff < 7) return t('date.daysAgo', { count: Math.floor(diff) });
  return d.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined });
}

// ─── Carpeta ────────────────────────────────────────────────────
function FolderCard({
  node, isDragging, onClick,
  onDelete,
}: {
  node: DecryptedNode;
  isDragging?: boolean;
  onClick: () => void;
  onDelete: () => void;
}) {
  const t = useTranslations('vault');
  const locale = useLocale();
  const { attributes, listeners, setNodeRef: setDragRef } = useDraggable({ id: node.id });
  const { isOver, setNodeRef: setDropRef } = useDroppable({ id: `drop-${node.id}` });
  const color = getFolderColor(node.color);
  const IconComp = FOLDER_ICONS[node.icon ?? 'folder'].Icon;

  return (
    <div
      ref={(el) => { setDragRef(el); setDropRef(el); }}
      {...listeners}
      {...attributes}
      onClick={onClick}
      className={cn(
        'group relative p-4 rounded-xl border bg-bg-surface',
        'hover:bg-bg-surface-2 hover:border-border-strong',
        'transition-all duration-150 cursor-pointer select-none',
        'border-border-faint',
        isOver && 'border-violet-500/60 bg-violet-500/5 shadow-[0_0_0_3px_rgba(139,92,246,0.15)] scale-[1.02]',
        isDragging && 'opacity-30',
      )}
    >
      <div className="flex items-start justify-between mb-3">
        <div className={cn(
          'size-11 rounded-lg grid place-items-center border',
          color.bg, color.border,
        )}>
          <IconComp className={cn('size-5', color.text)} />
        </div>
        <CardActionsMenu actions={[{ label: t('actions.delete'), icon: Trash2, onSelect: onDelete, danger: true }]} />
      </div>
      <h3 className="text-sm font-medium truncate mb-0.5">{node.name}</h3>
      <p className="text-[10px] text-text-tertiary uppercase tracking-wider">
        {formatDate(node.updatedAt, t, locale)}
      </p>
    </div>
  );
}

// ─── Archivo ────────────────────────────────────────────────────
function FileCard({
  node, isDragging, onClick,
  onDownload, onDelete, onShare, onStar,
}: {
  node: DecryptedNode;
  isDragging?: boolean;
  onClick: () => void;
  onDownload: () => void;
  onDelete: () => void;
  onShare: () => void;
  onStar: () => void;
}) {
  const t = useTranslations('vault');
  const locale = useLocale();
  const { attributes, listeners, setNodeRef } = useDraggable({ id: node.id });
  const FileIcon = fileIcon(node.mimeType);

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={onClick}
      className={cn(
        'group relative p-4 rounded-xl border border-border-faint bg-bg-surface',
        'hover:bg-bg-surface-2 hover:border-border-strong',
        'transition-all duration-150 cursor-pointer select-none',
        isDragging && 'opacity-30',
      )}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="size-11 rounded-lg grid place-items-center bg-bg-surface-2 border border-border-faint">
          <FileIcon className="size-5 text-text-secondary" />
        </div>
        <CardActionsMenu
          actions={[
            { label: node.starred ? t('actions.unstar') : t('actions.star'), icon: Star, onSelect: onStar },
            { label: t('actions.share'), icon: Share2, onSelect: onShare },
            { label: t('actions.download'), icon: Download, onSelect: onDownload },
            { label: t('actions.delete'), icon: Trash2, onSelect: onDelete, danger: true },
          ]}
        />
      </div>
      <h3 className="text-sm font-medium truncate mb-0.5">{node.name}</h3>
      <p className="text-[10px] text-text-tertiary uppercase tracking-wider">
        {formatSize(node.size)} · {formatDate(node.updatedAt, t, locale)}
      </p>
    </div>
  );
}

// ─── Upload progress bar ────────────────────────────────────────
function UploadBar({ uploads }: { uploads: Record<string, { fileName: string; progress: number; status: string }> }) {
  const t = useTranslations('vault');
  const entries = Object.entries(uploads);
  if (entries.length === 0) return null;

  return (
    <div className="fixed bottom-6 right-6 z-40 w-80 space-y-2">
      {entries.map(([id, u]) => (
        <div key={id} className="p-3 rounded-lg bg-bg-surface-2 border border-border-subtle shadow-lg">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-medium truncate max-w-[200px]">{u.fileName}</span>
            <span className="text-[10px] font-mono text-text-tertiary">
              {u.status === 'encrypting' && t('upload.encrypting')}
              {u.status === 'uploading' && `${u.progress}%`}
              {u.status === 'queued' && t('upload.queued')}
              {u.status === 'done' && '✓'}
              {u.status === 'error' && t('upload.error')}
            </span>
          </div>
          <div className="h-1.5 bg-bg-surface-3 rounded-full overflow-hidden">
            <div
              className={cn(
                'h-full rounded-full transition-all duration-300',
                u.status === 'error' ? 'bg-red-500' : u.status === 'queued' ? 'bg-amber-500' : 'bg-violet-500',
              )}
              style={{ width: `${u.progress}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Página principal ───────────────────────────────────────────
export default function VaultPage() {
  const t = useTranslations('vault');
  const {
    nodes, loading, breadcrumb, uploads, initialized,
    init, navigateToFolder, navigateUp, createFolder,
    uploadFiles, downloadFile, deleteNode, moveNode, toggleStar,
  } = useVault();

  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [shareNode, setShareNode] = useState<DecryptedNode | null>(null);
  const [previewNode, setPreviewNode] = useState<DecryptedNode | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const searchParams = useSearchParams();

  useEffect(() => { init(); }, [init]);

  // Acceso rápido "Subir archivo" del manifest (?upload=1): abre el selector
  // al entrar. Best-effort — si el navegador exige activación de usuario más
  // reciente, simplemente queda el vault abierto con el botón Subir a mano.
  useEffect(() => {
    if (searchParams.get('upload') === '1') fileInputRef.current?.click();
  }, [searchParams]);

  useEffect(() => {
    const handler = () => setNewFolderOpen(true);
    window.addEventListener('noctcom:new-action', handler);
    return () => window.removeEventListener('noctcom:new-action', handler);
  }, []);

  // Sensors with distance constraint so click != drag
  const mouseSensor = useSensor(MouseSensor, { activationConstraint: { distance: 8 } });
  const touchSensor = useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } });
  const sensors = useSensors(mouseSensor, touchSensor);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return nodes;
    return nodes.filter((n) => n.name.toLowerCase().includes(q));
  }, [search, nodes]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const pageNodes = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const folders = pageNodes.filter((n) => n.kind === 'folder');
  const files = pageNodes.filter((n) => n.kind === 'file');

  function handleDragStart(e: DragStartEvent) {
    setDraggedId(e.active.id as string);
  }

  function handleDragEnd(e: DragEndEvent) {
    setDraggedId(null);
    if (e.over && e.over.id !== e.active.id) {
      const targetId = (e.over.id as string).replace('drop-', '');
      const target = nodes.find((n) => n.id === targetId);
      const moved = nodes.find((n) => n.id === e.active.id);
      if (target && moved && target.kind === 'folder') {
        moveNode(moved.id, target.id);
        toast.success(t('toast.moved', { name: moved.name, target: target.name }));
      }
    }
  }

  const draggedNode = draggedId ? nodes.find((n) => n.id === draggedId) : null;

  const { getRootProps, isDragActive } = useDropzone({
    noClick: true,
    noKeyboard: true,
    onDrop: (acceptedFiles) => {
      if (acceptedFiles.length === 0) return;
      uploadFiles(acceptedFiles);
    },
  });

  return (
    <div {...getRootProps()} className="relative h-full">
      {isDragActive && (
        <div className="absolute inset-0 z-50 bg-violet-500/10 backdrop-blur-sm border-2 border-dashed border-violet-500/60 grid place-items-center pointer-events-none">
          <div className="text-center space-y-3">
            <div className="size-16 rounded-full bg-violet-500/20 grid place-items-center mx-auto animate-pulse">
              <Upload className="size-7 text-violet-300" />
            </div>
            <p className="text-lg font-display font-light text-violet-100">{t('dropzone.title')}</p>
            <p className="text-xs text-violet-200/70 font-mono">XChaCha20-Poly1305 · 4 MiB chunks</p>
          </div>
        </div>
      )}

      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="px-8 py-6 max-w-7xl mx-auto">
          {/* ─── Breadcrumb + acciones ──────────────────────── */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-1 text-sm">
              {breadcrumb.map((bc, i) => (
                <span key={i} className="flex items-center gap-1">
                  {i > 0 && <ChevronRight className="size-3.5 text-text-tertiary" />}
                  <button
                    type="button"
                    onClick={() => {
                      if (i === breadcrumb.length - 1) return;
                      const target = breadcrumb[i];
                      const newBc = breadcrumb.slice(0, i + 1);
                      useVault.setState({ breadcrumb: newBc });
                      useVault.getState().loadNodes(target!.id);
                    }}
                    className={cn(
                      'transition-colors',
                      i === breadcrumb.length - 1
                        ? 'text-text-primary font-medium cursor-default'
                        : 'text-text-secondary hover:text-text-primary',
                    )}
                  >
                    {bc.name}
                  </button>
                </span>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.length) {
                    uploadFiles(Array.from(e.target.files));
                    e.target.value = '';
                  }
                }}
              />
              <Button
                variant="secondary"
                size="sm"
                leftIcon={<FolderPlus className="size-3.5" />}
                onClick={() => setNewFolderOpen(true)}
              >
                {t('toolbar.newFolder')}
              </Button>
              <Button
                variant="primary"
                size="sm"
                leftIcon={<Upload className="size-3.5" />}
                onClick={() => fileInputRef.current?.click()}
              >
                {t('toolbar.upload')}
              </Button>
            </div>
          </div>

          {/* ─── Search + filtros ────────────────────────────── */}
          <div className="flex items-center gap-3 mb-6">
            <div className="flex-1 max-w-md relative">
              <input
                type="search"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                placeholder={t('search.placeholder')}
                className="w-full h-9 px-3 bg-bg-surface border border-border-subtle rounded-md text-sm placeholder:text-text-muted focus:outline-none focus:border-violet-500/60"
              />
            </div>
            <button
              type="button"
              className="h-9 px-3 flex items-center gap-1.5 bg-bg-surface border border-border-subtle rounded-md text-xs text-text-secondary hover:bg-bg-surface-2"
            >
              <Filter className="size-3.5" />
              {t('search.filters')}
            </button>
            <div className="flex bg-bg-surface border border-border-subtle rounded-md p-0.5">
              <button
                type="button"
                onClick={() => setView('grid')}
                className={cn(
                  'h-8 px-2.5 rounded text-xs flex items-center gap-1.5',
                  view === 'grid' ? 'bg-violet-500/20 text-violet-200' : 'text-text-tertiary',
                )}
              >
                <Grid3x3 className="size-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setView('list')}
                className={cn(
                  'h-8 px-2.5 rounded text-xs flex items-center gap-1.5',
                  view === 'list' ? 'bg-violet-500/20 text-violet-200' : 'text-text-tertiary',
                )}
              >
                <List className="size-3.5" />
              </button>
            </div>
          </div>

          {/* ─── Loading ─────────────────────────────────────── */}
          {loading && !initialized && (
            <div className="py-24 text-center">
              <Loader2 className="size-8 text-violet-400 animate-spin mx-auto mb-4" />
              <p className="text-sm text-text-tertiary">{t('loading')}</p>
            </div>
          )}

          {/* ─── Carpetas ─────────────────────────────────── */}
          {initialized && folders.length > 0 && (
            <section className="mb-8">
              <h2 className="text-[10px] uppercase tracking-widest text-text-tertiary mb-3">
                {t('sections.folders', { count: folders.length })}
              </h2>
              <div className={cn(
                view === 'grid'
                  ? 'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3'
                  : 'space-y-1',
              )}>
                {folders.map((n) => (
                  <FolderCard
                    key={n.id}
                    node={n}
                    isDragging={draggedId === n.id}
                    onClick={() => navigateToFolder(n.id, n.name)}
                    onDelete={() => deleteNode(n.id)}
                  />
                ))}
              </div>
            </section>
          )}

          {/* ─── Archivos ─────────────────────────────────── */}
          {initialized && files.length > 0 && (
            <section>
              <h2 className="text-[10px] uppercase tracking-widest text-text-tertiary mb-3">
                {t('sections.files', { count: files.length })}
              </h2>
              <div className={cn(
                view === 'grid'
                  ? 'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3'
                  : 'space-y-1',
              )}>
                {files.map((n) => (
                  <FileCard
                    key={n.id}
                    node={n}
                    isDragging={draggedId === n.id}
                    onClick={() => setPreviewNode(n)}
                    onDownload={() => downloadFile(n)}
                    onDelete={() => deleteNode(n.id)}
                    onShare={() => setShareNode(n)}
                    onStar={() => toggleStar(n.id)}
                  />
                ))}
              </div>
            </section>
          )}

          {/* ─── Empty state ──────────────────────────────── */}
          {initialized && pageNodes.length === 0 && !loading && (
            <div className="py-24 text-center">
              <div className="size-16 rounded-full bg-bg-surface border border-border-subtle grid place-items-center mx-auto mb-4">
                <Upload className="size-6 text-text-tertiary" />
              </div>
              <h3 className="font-display text-lg mb-1">{t('empty.title')}</h3>
              <p className="text-sm text-text-tertiary mb-4">
                {t('empty.description')}
              </p>
            </div>
          )}

          {/* ─── Paginación ───────────────────────────────── */}
          {totalPages > 1 && (
            <div className="mt-8 flex items-center justify-between text-sm">
              <span className="text-text-tertiary text-xs">
                {t('pagination.status', { page, total: totalPages, count: filtered.length })}
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={page === 1}
                  onClick={() => setPage((p) => p - 1)}
                  className="h-8 w-8 grid place-items-center rounded-md text-text-secondary hover:bg-bg-surface disabled:opacity-30 disabled:hover:bg-transparent"
                >
                  <ChevronLeft className="size-4" />
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPage(p)}
                    className={cn(
                      'h-8 min-w-8 px-2 rounded-md text-xs font-mono',
                      p === page
                        ? 'bg-violet-500/20 text-violet-200 border border-violet-500/30'
                        : 'text-text-secondary hover:bg-bg-surface',
                    )}
                  >
                    {p}
                  </button>
                ))}
                <button
                  type="button"
                  disabled={page === totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="h-8 w-8 grid place-items-center rounded-md text-text-secondary hover:bg-bg-surface disabled:opacity-30 disabled:hover:bg-transparent"
                >
                  <ChevronRight className="size-4" />
                </button>
              </div>
            </div>
          )}
        </div>

        <DragOverlay>
          {draggedNode && (
            <div className="p-4 rounded-xl bg-bg-surface-3 border border-violet-500/40 shadow-[0_8px_32px_-4px_rgba(0,0,0,0.6)] rotate-2 w-48">
              <p className="text-sm font-medium truncate">{draggedNode.name}</p>
              <p className="text-[10px] text-text-tertiary uppercase tracking-wider">
                {draggedNode.kind === 'folder' ? t('folder') : formatSize(draggedNode.size)}
              </p>
            </div>
          )}
        </DragOverlay>
      </DndContext>

      <UploadBar uploads={uploads} />

      <NewFolderModal
        open={newFolderOpen}
        onClose={() => setNewFolderOpen(false)}
        onCreated={(name, icon, color) => createFolder(name, icon, color)}
      />

      <ShareModal
        open={!!shareNode}
        onClose={() => setShareNode(null)}
        node={shareNode}
      />

      <FilePreviewModal
        open={!!previewNode}
        onClose={() => setPreviewNode(null)}
        node={previewNode}
      />
    </div>
  );
}
