'use client';

import { useState } from 'react';
import {
  Share2, Link2, Users, Clock, MoreVertical, Copy, Trash2,
  FileText, Image, File, ExternalLink, Shield, ChevronRight,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';

type ShareDirection = 'outgoing' | 'incoming';

interface SharedItem {
  id: string;
  name: string;
  type: 'file' | 'folder';
  mimeType?: string;
  sharedWith?: string;
  sharedBy?: string;
  direction: ShareDirection;
  accessLevel: 'view' | 'edit';
  expiresAt?: string;
  createdAt: string;
  size?: number;
}

const MOCK_SHARED: SharedItem[] = [
  { id: '1', name: 'Contrato_2026.pdf', type: 'file', mimeType: 'application/pdf', sharedWith: 'ana@empresa.com', direction: 'outgoing', accessLevel: 'view', expiresAt: '2026-06-24T00:00:00Z', createdAt: '2026-05-24T10:00:00Z', size: 2_400_000 },
  { id: '2', name: 'Plan_Q3.docx', type: 'file', mimeType: 'application/word', sharedWith: 'carlos@team.dev', direction: 'outgoing', accessLevel: 'edit', createdAt: '2026-05-23T14:00:00Z', size: 480_000 },
  { id: '3', name: 'Fotos viaje Japón', type: 'folder', sharedWith: 'familia@grupo.com', direction: 'outgoing', accessLevel: 'view', createdAt: '2026-05-22T09:00:00Z' },
  { id: '4', name: 'Diseño_logo_v3.png', type: 'file', mimeType: 'image/png', sharedBy: 'diseño@studio.co', direction: 'incoming', accessLevel: 'view', createdAt: '2026-05-21T16:00:00Z', size: 3_200_000 },
  { id: '5', name: 'Presupuesto 2026', type: 'folder', sharedBy: 'finanzas@empresa.com', direction: 'incoming', accessLevel: 'edit', createdAt: '2026-05-20T11:00:00Z' },
];

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

function fileIcon(mimeType?: string) {
  if (!mimeType) return File;
  if (mimeType.startsWith('image/')) return Image;
  return FileText;
}

export default function SharedPage() {
  const [tab, setTab] = useState<ShareDirection | 'all'>('all');

  const filtered = tab === 'all' ? MOCK_SHARED : MOCK_SHARED.filter((s) => s.direction === tab);

  const tabs = [
    { value: 'all' as const, label: 'Todos', count: MOCK_SHARED.length },
    { value: 'outgoing' as const, label: 'Enviados', count: MOCK_SHARED.filter((s) => s.direction === 'outgoing').length },
    { value: 'incoming' as const, label: 'Recibidos', count: MOCK_SHARED.filter((s) => s.direction === 'incoming').length },
  ];

  return (
    <div className="px-8 py-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Compartidos</h1>
          <p className="text-sm text-[var(--color-text-tertiary)] mt-1">
            Archivos compartidos mediante enlaces cifrados E2E
          </p>
        </div>
        <Button variant="primary" size="sm" leftIcon={<Link2 className="size-3.5" />}>
          Nuevo enlace
        </Button>
      </div>

      <div className="flex gap-1 mb-6 p-1 bg-[var(--color-bg-surface)] rounded-lg border border-[var(--color-border-faint)] w-fit">
        {tabs.map((t) => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={cn(
              'px-4 py-2 rounded-md text-sm transition-colors',
              tab === t.value
                ? 'bg-violet-500/20 text-violet-200'
                : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]',
            )}
          >
            {t.label}
            <span className="ml-1.5 text-[10px] font-mono opacity-60">{t.count}</span>
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {filtered.map((item) => {
          const Icon = item.type === 'folder' ? Share2 : fileIcon(item.mimeType);
          return (
            <div
              key={item.id}
              className="flex items-center gap-4 p-4 rounded-xl border border-[var(--color-border-faint)] bg-[var(--color-bg-surface)] hover:border-[var(--color-border-subtle)] transition-all group"
            >
              <div className={cn(
                'size-11 rounded-lg grid place-items-center shrink-0',
                item.direction === 'outgoing' ? 'bg-violet-500/10 border border-violet-500/20' : 'bg-blue-500/10 border border-blue-500/20',
              )}>
                <Icon className={cn('size-5', item.direction === 'outgoing' ? 'text-violet-300' : 'text-blue-300')} />
              </div>

              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-medium truncate">{item.name}</h3>
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-[10px] text-[var(--color-text-tertiary)] font-mono uppercase tracking-wider flex items-center gap-1">
                    {item.direction === 'outgoing' ? (
                      <><Users className="size-3" /> {item.sharedWith}</>
                    ) : (
                      <><ExternalLink className="size-3" /> {item.sharedBy}</>
                    )}
                  </span>
                  <span className="text-[10px] text-[var(--color-text-muted)]">·</span>
                  <span className="text-[10px] text-[var(--color-text-muted)] flex items-center gap-1">
                    <Clock className="size-3" /> {formatDate(item.createdAt)}
                  </span>
                  {item.size && (
                    <>
                      <span className="text-[10px] text-[var(--color-text-muted)]">·</span>
                      <span className="text-[10px] text-[var(--color-text-muted)] font-mono">{formatSize(item.size)}</span>
                    </>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className={cn(
                  'text-[10px] font-mono uppercase tracking-wider px-2 py-1 rounded',
                  item.accessLevel === 'edit'
                    ? 'bg-amber-500/10 text-amber-300'
                    : 'bg-emerald-500/10 text-emerald-300',
                )}>
                  {item.accessLevel === 'edit' ? 'Editar' : 'Solo ver'}
                </span>
                {item.expiresAt && (
                  <span className="text-[10px] text-[var(--color-text-muted)] font-mono">
                    Expira {formatDate(item.expiresAt)}
                  </span>
                )}
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    className="p-1.5 rounded-md hover:bg-[var(--color-bg-surface-2)]"
                    onClick={() => { navigator.clipboard.writeText(`https://noctcom.com/s/${item.id}`); toast.success('Enlace copiado'); }}
                  >
                    <Copy className="size-3.5 text-[var(--color-text-tertiary)]" />
                  </button>
                  <button className="p-1.5 rounded-md hover:bg-[var(--color-bg-surface-2)]">
                    <Trash2 className="size-3.5 text-[var(--color-text-tertiary)]" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="py-24 text-center">
          <div className="size-16 rounded-full bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] grid place-items-center mx-auto mb-4">
            <Share2 className="size-6 text-[var(--color-text-tertiary)]" />
          </div>
          <h3 className="font-display text-lg mb-1">Sin archivos compartidos</h3>
          <p className="text-sm text-[var(--color-text-tertiary)]">
            Los enlaces que crees aparecerán aquí
          </p>
        </div>
      )}

      <div className="mt-8 p-4 rounded-xl bg-violet-500/5 border border-violet-500/20">
        <div className="flex items-start gap-3">
          <Shield className="size-5 text-violet-300 mt-0.5 shrink-0" />
          <div>
            <h4 className="text-sm font-medium text-violet-200 mb-1">Compartir con cifrado E2E</h4>
            <p className="text-xs text-[var(--color-text-tertiary)] leading-relaxed">
              Los archivos compartidos se cifran con una clave derivada única. El receptor necesita
              el enlace completo con el fragmento de clave para descifrar. Noctcom nunca accede al contenido.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
