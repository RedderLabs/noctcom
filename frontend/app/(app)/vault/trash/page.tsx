'use client';

import { useState } from 'react';
import {
  Trash2, FileText, File, Image, RotateCcw, AlertTriangle, X,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';

interface TrashedItem {
  id: string;
  name: string;
  mimeType?: string;
  size: number;
  deletedAt: string;
  expiresAt: string;
}

const MOCK_TRASH: TrashedItem[] = [
  { id: '1', name: 'old_backup.zip',   mimeType: 'application/zip', size: 8_900_000,  deletedAt: '2026-05-22T14:20:00Z', expiresAt: '2026-06-21T14:20:00Z' },
  { id: '2', name: 'borrador_v1.docx', mimeType: 'application/word', size: 320_000,   deletedAt: '2026-05-20T10:00:00Z', expiresAt: '2026-06-19T10:00:00Z' },
  { id: '3', name: 'screenshot_old.png', mimeType: 'image/png',     size: 1_500_000,  deletedAt: '2026-05-18T16:30:00Z', expiresAt: '2026-06-17T16:30:00Z' },
];

function formatSize(bytes: number) {
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0; let n = bytes;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}

function daysUntil(iso: string) {
  const days = Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
  return days > 0 ? `${days} días` : 'Expirando';
}

function getFileIcon(mime?: string) {
  if (!mime) return File;
  if (mime.startsWith('image/')) return Image;
  if (mime.includes('pdf') || mime.includes('word') || mime.includes('text')) return FileText;
  return File;
}

export default function TrashPage() {
  const [items, setItems] = useState(MOCK_TRASH);

  function restore(id: string) {
    const item = items.find((i) => i.id === id);
    setItems((prev) => prev.filter((i) => i.id !== id));
    toast.success(`«${item?.name}» restaurado`);
  }

  function deletePermanently(id: string) {
    const item = items.find((i) => i.id === id);
    setItems((prev) => prev.filter((i) => i.id !== id));
    toast.success(`«${item?.name}» eliminado permanentemente`);
  }

  return (
    <div className="px-8 py-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Papelera</h1>
          <p className="text-sm text-[var(--color-text-tertiary)] mt-1">
            Los archivos se eliminan permanentemente después de 30 días
          </p>
        </div>
        {items.length > 0 && (
          <Button
            variant="danger"
            size="sm"
            leftIcon={<Trash2 className="size-3.5" />}
            onClick={() => { setItems([]); toast.success('Papelera vaciada'); }}
          >
            Vaciar papelera
          </Button>
        )}
      </div>

      {items.length > 0 && (
        <div className="p-3 rounded-lg bg-amber-500/5 border border-amber-500/20 mb-6 flex items-start gap-2">
          <AlertTriangle className="size-4 text-amber-300 mt-0.5 shrink-0" />
          <p className="text-xs text-[var(--color-text-secondary)]">
            Los archivos en la papelera siguen cifrados. Al eliminarlos permanentemente, se destruyen las claves de descifrado.
          </p>
        </div>
      )}

      <div className="space-y-1">
        {items.map((item) => {
          const Icon = getFileIcon(item.mimeType);
          return (
            <div
              key={item.id}
              className="flex items-center gap-4 px-4 py-3 rounded-lg hover:bg-[var(--color-bg-surface)] transition-colors group"
            >
              <div className="size-10 rounded-lg bg-red-500/10 border border-red-500/20 grid place-items-center shrink-0">
                <Icon className="size-4 text-red-300" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-medium truncate line-through text-[var(--color-text-secondary)]">
                  {item.name}
                </h3>
                <span className="text-[10px] text-[var(--color-text-tertiary)] font-mono uppercase tracking-wider">
                  {formatSize(item.size)} · Expira en {daysUntil(item.expiresAt)}
                </span>
              </div>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => restore(item.id)}
                  className="p-2 rounded-md hover:bg-emerald-500/10 text-emerald-400"
                  title="Restaurar"
                >
                  <RotateCcw className="size-4" />
                </button>
                <button
                  onClick={() => deletePermanently(item.id)}
                  className="p-2 rounded-md hover:bg-red-500/10 text-red-400"
                  title="Eliminar permanentemente"
                >
                  <X className="size-4" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {items.length === 0 && (
        <div className="py-24 text-center">
          <div className="size-16 rounded-full bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] grid place-items-center mx-auto mb-4">
            <Trash2 className="size-6 text-[var(--color-text-tertiary)]" />
          </div>
          <h3 className="font-display text-lg mb-1">Papelera vacía</h3>
          <p className="text-sm text-[var(--color-text-tertiary)]">No hay archivos eliminados</p>
        </div>
      )}
    </div>
  );
}
