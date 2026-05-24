'use client';

import {
  Star, FileText, File, Image, Folder, MoreVertical, Download,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { FOLDER_ICONS, getFolderColor, type FolderIconKey, type FolderColorKey } from '@/components/vault/folder-icons';

interface StarredItem {
  id: string;
  kind: 'folder' | 'file';
  name: string;
  icon?: FolderIconKey;
  color?: FolderColorKey;
  mimeType?: string;
  size?: number;
  starredAt: string;
}

const MOCK_STARRED: StarredItem[] = [
  { id: '1', kind: 'folder', name: 'Proyectos 2026', icon: 'folder-kanban', color: 'blue', starredAt: '2026-05-23T14:00:00Z' },
  { id: '2', kind: 'file', name: 'Contrato_2026.pdf', mimeType: 'application/pdf', size: 2_400_000, starredAt: '2026-05-22T10:00:00Z' },
  { id: '3', kind: 'folder', name: 'Finanzas', icon: 'wallet', color: 'emerald', starredAt: '2026-05-20T09:00:00Z' },
];

function formatSize(bytes?: number) {
  if (!bytes) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0; let n = bytes;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}

export default function StarredPage() {
  return (
    <div className="px-8 py-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-semibold tracking-tight">Destacados</h1>
        <p className="text-sm text-[var(--color-text-tertiary)] mt-1">
          Archivos y carpetas que marcaste como favoritos
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
        {MOCK_STARRED.map((item) => {
          if (item.kind === 'folder') {
            const color = getFolderColor(item.color);
            const IconComp = FOLDER_ICONS[item.icon ?? 'folder'].Icon;
            return (
              <div
                key={item.id}
                className="group relative p-4 rounded-xl border border-[var(--color-border-faint)] bg-[var(--color-bg-surface)] hover:bg-[var(--color-bg-surface-2)] hover:border-[var(--color-border-strong)] transition-all cursor-pointer"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className={cn('size-11 rounded-lg grid place-items-center border', color.bg, color.border)}>
                    <IconComp className={cn('size-5', color.text)} />
                  </div>
                  <Star className="size-3.5 fill-amber-400 text-amber-400" />
                </div>
                <h3 className="text-sm font-medium truncate">{item.name}</h3>
                <p className="text-[10px] text-[var(--color-text-tertiary)] uppercase tracking-wider mt-0.5">Carpeta</p>
              </div>
            );
          }

          const FileIcon = item.mimeType?.startsWith('image/') ? Image : item.mimeType?.includes('pdf') ? FileText : File;
          return (
            <div
              key={item.id}
              className="group relative p-4 rounded-xl border border-[var(--color-border-faint)] bg-[var(--color-bg-surface)] hover:bg-[var(--color-bg-surface-2)] hover:border-[var(--color-border-strong)] transition-all cursor-pointer"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="size-11 rounded-lg grid place-items-center bg-[var(--color-bg-surface-2)] border border-[var(--color-border-faint)]">
                  <FileIcon className="size-5 text-[var(--color-text-secondary)]" />
                </div>
                <Star className="size-3.5 fill-amber-400 text-amber-400" />
              </div>
              <h3 className="text-sm font-medium truncate">{item.name}</h3>
              <p className="text-[10px] text-[var(--color-text-tertiary)] uppercase tracking-wider mt-0.5">
                {formatSize(item.size)}
              </p>
            </div>
          );
        })}
      </div>

      {MOCK_STARRED.length === 0 && (
        <div className="py-24 text-center">
          <div className="size-16 rounded-full bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] grid place-items-center mx-auto mb-4">
            <Star className="size-6 text-[var(--color-text-tertiary)]" />
          </div>
          <h3 className="font-display text-lg mb-1">Sin destacados</h3>
          <p className="text-sm text-[var(--color-text-tertiary)]">
            Marca archivos con la estrella para acceder rápido
          </p>
        </div>
      )}
    </div>
  );
}
