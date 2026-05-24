'use client';

import {
  FileText, File, Image, Video, Music, Archive, FileCode,
  Clock, MoreVertical, Star, Download,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface RecentFile {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  accessedAt: string;
  action: 'viewed' | 'edited' | 'uploaded';
}

const MOCK_RECENT: RecentFile[] = [
  { id: '1', name: 'Contrato_2026.pdf',  mimeType: 'application/pdf',  size: 2_400_000, accessedAt: '2026-05-24T15:25:00Z', action: 'viewed' },
  { id: '2', name: 'Plan_Q3.docx',       mimeType: 'application/word', size: 480_000,   accessedAt: '2026-05-24T14:10:00Z', action: 'edited' },
  { id: '3', name: 'foto_perfil.jpg',    mimeType: 'image/jpeg',       size: 1_200_000, accessedAt: '2026-05-24T13:20:00Z', action: 'uploaded' },
  { id: '4', name: 'notas.md',           mimeType: 'text/markdown',    size: 4_800,     accessedAt: '2026-05-23T10:30:00Z', action: 'edited' },
  { id: '5', name: 'demo_app.mp4',       mimeType: 'video/mp4',        size: 25_600_000, accessedAt: '2026-05-23T09:00:00Z', action: 'viewed' },
  { id: '6', name: 'cancion.mp3',        mimeType: 'audio/mpeg',       size: 5_400_000, accessedAt: '2026-05-22T18:00:00Z', action: 'viewed' },
  { id: '7', name: 'archivo.zip',        mimeType: 'application/zip',  size: 8_900_000, accessedAt: '2026-05-22T14:20:00Z', action: 'uploaded' },
];

function getFileIcon(mime: string) {
  if (mime.startsWith('image/')) return Image;
  if (mime.startsWith('video/')) return Video;
  if (mime.startsWith('audio/')) return Music;
  if (mime.includes('zip') || mime.includes('archive')) return Archive;
  if (mime.includes('pdf') || mime.includes('word') || mime.includes('text')) return FileText;
  if (mime.includes('code') || mime.includes('json')) return FileCode;
  return File;
}

function formatSize(bytes: number) {
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0; let n = bytes;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}

function timeAgo(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 3600) return `Hace ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `Hace ${Math.floor(diff / 3600)} h`;
  if (diff < 172800) return 'Ayer';
  return `Hace ${Math.floor(diff / 86400)} días`;
}

const ACTION_LABELS: Record<string, { label: string; color: string }> = {
  viewed: { label: 'Visto', color: 'text-blue-400 bg-blue-500/10' },
  edited: { label: 'Editado', color: 'text-amber-400 bg-amber-500/10' },
  uploaded: { label: 'Subido', color: 'text-emerald-400 bg-emerald-500/10' },
};

export default function RecentPage() {
  return (
    <div className="px-8 py-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-semibold tracking-tight">Recientes</h1>
        <p className="text-sm text-[var(--color-text-tertiary)] mt-1">
          Archivos abiertos o modificados recientemente
        </p>
      </div>

      <div className="space-y-1">
        {MOCK_RECENT.map((file) => {
          const Icon = getFileIcon(file.mimeType);
          const action = ACTION_LABELS[file.action];
          return (
            <div
              key={file.id}
              className="flex items-center gap-4 px-4 py-3 rounded-lg hover:bg-[var(--color-bg-surface)] transition-colors group cursor-pointer"
            >
              <div className="size-10 rounded-lg bg-[var(--color-bg-surface-2)] border border-[var(--color-border-faint)] grid place-items-center shrink-0">
                <Icon className="size-4 text-[var(--color-text-secondary)]" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-medium truncate">{file.name}</h3>
                <span className="text-[10px] text-[var(--color-text-tertiary)] font-mono uppercase tracking-wider">
                  {formatSize(file.size)}
                </span>
              </div>
              <span className={cn(
                'text-[10px] font-mono uppercase tracking-wider px-2 py-1 rounded',
                action.color,
              )}>
                {action.label}
              </span>
              <span className="text-xs text-[var(--color-text-muted)] flex items-center gap-1 min-w-[100px] justify-end">
                <Clock className="size-3" />
                {timeAgo(file.accessedAt)}
              </span>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button className="p-1.5 rounded-md hover:bg-[var(--color-bg-surface-2)]">
                  <Download className="size-3.5 text-[var(--color-text-tertiary)]" />
                </button>
                <button className="p-1.5 rounded-md hover:bg-[var(--color-bg-surface-2)]">
                  <MoreVertical className="size-3.5 text-[var(--color-text-tertiary)]" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {MOCK_RECENT.length === 0 && (
        <div className="py-24 text-center">
          <div className="size-16 rounded-full bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] grid place-items-center mx-auto mb-4">
            <Clock className="size-6 text-[var(--color-text-tertiary)]" />
          </div>
          <h3 className="font-display text-lg mb-1">Sin actividad reciente</h3>
          <p className="text-sm text-[var(--color-text-tertiary)]">Los archivos que abras aparecerán aquí</p>
        </div>
      )}
    </div>
  );
}
