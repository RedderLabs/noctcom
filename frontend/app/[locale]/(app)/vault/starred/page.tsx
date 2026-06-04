'use client';

import { useState, useEffect } from 'react';
import {
  Star, FileText, File, Image, Download, Loader2, Share2, Trash2, Eye,
} from 'lucide-react';
import { useVault, type DecryptedNode } from '@/lib/vault-store';
import { FOLDER_ICONS, getFolderColor } from '@/components/vault/folder-icons';
import { cn } from '@/lib/utils';
import { CardActionsMenu } from '@/components/vault/CardActionsMenu';
import { ShareModal } from '@/components/vault/ShareModal';
import { FilePreviewModal } from '@/components/vault/FilePreviewModal';

function formatSize(bytes?: number) {
  if (!bytes) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0; let n = bytes;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}

export default function StarredPage() {
  const { loadStarred, toggleStar, downloadFile, deleteNode } = useVault();
  const [items, setItems] = useState<DecryptedNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [shareNode, setShareNode] = useState<DecryptedNode | null>(null);
  const [previewNode, setPreviewNode] = useState<DecryptedNode | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const starred = await loadStarred();
      setItems(starred);
      setLoading(false);
    })();
  }, [loadStarred]);

  async function handleUnstar(nodeId: string) {
    await toggleStar(nodeId);
    setItems((prev) => prev.filter((n) => n.id !== nodeId));
  }

  async function handleDelete(nodeId: string) {
    await deleteNode(nodeId);
    setItems((prev) => prev.filter((n) => n.id !== nodeId));
  }

  return (
    <div className="px-8 py-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-semibold tracking-tight">Destacados</h1>
        <p className="text-sm text-text-tertiary mt-1">
          Archivos y carpetas que marcaste como favoritos
        </p>
      </div>

      {loading && (
        <div className="py-24 text-center">
          <Loader2 className="size-8 text-violet-400 animate-spin mx-auto mb-4" />
          <p className="text-sm text-text-tertiary">Cargando destacados…</p>
        </div>
      )}

      {!loading && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {items.map((item) => {
            if (item.kind === 'folder') {
              const color = getFolderColor(item.color);
              const IconComp = FOLDER_ICONS[item.icon ?? 'folder'].Icon;
              return (
                <div
                  key={item.id}
                  className="group relative p-4 rounded-xl border border-border-faint bg-bg-surface hover:bg-bg-surface-2 hover:border-border-strong transition-all"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className={cn('size-11 rounded-lg grid place-items-center border', color.bg, color.border)}>
                      <IconComp className={cn('size-5', color.text)} />
                    </div>
                    <CardActionsMenu
                      actions={[
                        { label: 'Quitar de destacados', icon: Star, onSelect: () => handleUnstar(item.id) },
                        { label: 'Eliminar', icon: Trash2, onSelect: () => handleDelete(item.id), danger: true },
                      ]}
                    />
                  </div>
                  <h3 className="text-sm font-medium truncate">{item.name}</h3>
                  <p className="text-[10px] text-text-tertiary uppercase tracking-wider mt-0.5">Carpeta</p>
                </div>
              );
            }

            const FileIcon = item.mimeType?.startsWith('image/') ? Image : item.mimeType?.includes('pdf') ? FileText : File;
            return (
              <div
                key={item.id}
                onClick={() => setPreviewNode(item)}
                className="group relative p-4 rounded-xl border border-border-faint bg-bg-surface hover:bg-bg-surface-2 hover:border-border-strong transition-all cursor-pointer"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="size-11 rounded-lg grid place-items-center bg-bg-surface-2 border border-border-faint">
                    <FileIcon className="size-5 text-text-secondary" />
                  </div>
                  <CardActionsMenu
                    actions={[
                      { label: 'Abrir', icon: Eye, onSelect: () => setPreviewNode(item) },
                      { label: 'Quitar de destacados', icon: Star, onSelect: () => handleUnstar(item.id) },
                      { label: 'Compartir', icon: Share2, onSelect: () => setShareNode(item) },
                      { label: 'Descargar', icon: Download, onSelect: () => downloadFile(item) },
                      { label: 'Eliminar', icon: Trash2, onSelect: () => handleDelete(item.id), danger: true },
                    ]}
                  />
                </div>
                <h3 className="text-sm font-medium truncate">{item.name}</h3>
                <p className="text-[10px] text-text-tertiary uppercase tracking-wider mt-0.5">
                  {formatSize(item.size)}
                </p>
              </div>
            );
          })}
        </div>
      )}

      {!loading && items.length === 0 && (
        <div className="py-24 text-center">
          <div className="size-16 rounded-full bg-bg-surface border border-border-subtle grid place-items-center mx-auto mb-4">
            <Star className="size-6 text-text-tertiary" />
          </div>
          <h3 className="font-display text-lg mb-1">Sin destacados</h3>
          <p className="text-sm text-text-tertiary">
            Marca archivos con la estrella para acceder rápido
          </p>
        </div>
      )}

      <ShareModal open={!!shareNode} onClose={() => setShareNode(null)} node={shareNode} />
      <FilePreviewModal open={!!previewNode} onClose={() => setPreviewNode(null)} node={previewNode} />
    </div>
  );
}
