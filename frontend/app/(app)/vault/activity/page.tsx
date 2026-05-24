'use client';

import { useState } from 'react';
import {
  Upload, Download, Trash2, FolderPlus, Share2, Lock, KeyRound,
  Shield, Monitor, LogIn, LogOut, Edit3, Eye,
  ChevronLeft, ChevronRight, Filter,
} from 'lucide-react';
import { cn } from '@/lib/utils';

type ActivityType =
  | 'upload' | 'download' | 'delete' | 'folder_create' | 'share'
  | 'encrypt' | 'key_rotate' | '2fa_enable' | 'device_add'
  | 'login' | 'logout' | 'rename' | 'view';

interface Activity {
  id: string;
  type: ActivityType;
  description: string;
  target?: string;
  timestamp: string;
  device?: string;
  ip?: string;
}

const ACTIVITY_META: Record<ActivityType, { icon: typeof Upload; color: string; label: string }> = {
  upload:        { icon: Upload,      color: 'text-emerald-400 bg-emerald-500/10', label: 'Subida' },
  download:      { icon: Download,    color: 'text-blue-400 bg-blue-500/10',       label: 'Descarga' },
  delete:        { icon: Trash2,      color: 'text-red-400 bg-red-500/10',         label: 'Eliminación' },
  folder_create: { icon: FolderPlus,  color: 'text-violet-400 bg-violet-500/10',   label: 'Carpeta' },
  share:         { icon: Share2,      color: 'text-amber-400 bg-amber-500/10',     label: 'Compartir' },
  encrypt:       { icon: Lock,        color: 'text-violet-400 bg-violet-500/10',   label: 'Cifrado' },
  key_rotate:    { icon: KeyRound,    color: 'text-orange-400 bg-orange-500/10',   label: 'Rotación' },
  '2fa_enable':  { icon: Shield,      color: 'text-emerald-400 bg-emerald-500/10', label: '2FA' },
  device_add:    { icon: Monitor,     color: 'text-cyan-400 bg-cyan-500/10',       label: 'Dispositivo' },
  login:         { icon: LogIn,       color: 'text-emerald-400 bg-emerald-500/10', label: 'Inicio sesión' },
  logout:        { icon: LogOut,      color: 'text-slate-400 bg-slate-500/10',     label: 'Cierre sesión' },
  rename:        { icon: Edit3,       color: 'text-blue-400 bg-blue-500/10',       label: 'Renombrar' },
  view:          { icon: Eye,         color: 'text-slate-400 bg-slate-500/10',     label: 'Vista' },
};

const MOCK_ACTIVITIES: Activity[] = [
  { id: '1',  type: 'login',         description: 'Sesión iniciada',                           timestamp: '2026-05-24T15:30:00Z', device: 'Chrome · Windows', ip: '82.45.xxx.xxx' },
  { id: '2',  type: 'upload',        description: 'Archivo subido',        target: 'Contrato_2026.pdf',    timestamp: '2026-05-24T15:25:00Z' },
  { id: '3',  type: 'folder_create', description: 'Carpeta creada',        target: 'Documentos personales', timestamp: '2026-05-24T14:50:00Z' },
  { id: '4',  type: 'encrypt',       description: 'Archivo cifrado',       target: 'Contrato_2026.pdf',    timestamp: '2026-05-24T14:48:00Z' },
  { id: '5',  type: 'upload',        description: 'Archivo subido',        target: 'foto_perfil.jpg',      timestamp: '2026-05-24T13:20:00Z' },
  { id: '6',  type: 'share',         description: 'Enlace compartido',     target: 'Plan_Q3.docx',         timestamp: '2026-05-24T12:10:00Z' },
  { id: '7',  type: '2fa_enable',    description: '2FA activado con TOTP',                          timestamp: '2026-05-23T18:00:00Z' },
  { id: '8',  type: 'device_add',    description: 'Nuevo dispositivo registrado',                   timestamp: '2026-05-23T17:55:00Z', device: 'Chrome · Windows' },
  { id: '9',  type: 'key_rotate',    description: 'Claves de bóveda rotadas',                       timestamp: '2026-05-23T17:50:00Z' },
  { id: '10', type: 'download',      description: 'Archivo descargado',    target: 'notas.md',             timestamp: '2026-05-23T10:30:00Z' },
  { id: '11', type: 'rename',        description: 'Archivo renombrado',    target: 'demo_v2.mp4',          timestamp: '2026-05-22T16:00:00Z' },
  { id: '12', type: 'delete',        description: 'Archivo eliminado',     target: 'old_backup.zip',       timestamp: '2026-05-22T14:20:00Z' },
  { id: '13', type: 'login',         description: 'Sesión iniciada',                           timestamp: '2026-05-22T09:00:00Z', device: 'Firefox · Linux', ip: '91.12.xxx.xxx' },
  { id: '14', type: 'logout',        description: 'Sesión cerrada',                            timestamp: '2026-05-21T23:15:00Z' },
];

function formatTimestamp(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString('es', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function groupByDate(items: Activity[]) {
  const groups: Record<string, Activity[]> = {};
  for (const item of items) {
    const key = new Date(item.timestamp).toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' });
    (groups[key] ??= []).push(item);
  }
  return Object.entries(groups);
}

export default function ActivityPage() {
  const [filterType, setFilterType] = useState<ActivityType | 'all'>('all');
  const [page, setPage] = useState(1);

  const filtered = filterType === 'all'
    ? MOCK_ACTIVITIES
    : MOCK_ACTIVITIES.filter((a) => a.type === filterType);

  const PAGE_SIZE = 20;
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const grouped = groupByDate(paged);

  const filterOptions: { value: ActivityType | 'all'; label: string }[] = [
    { value: 'all', label: 'Todo' },
    { value: 'upload', label: 'Subidas' },
    { value: 'download', label: 'Descargas' },
    { value: 'share', label: 'Compartidos' },
    { value: 'login', label: 'Sesiones' },
    { value: 'delete', label: 'Eliminaciones' },
  ];

  return (
    <div className="px-8 py-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Registro de actividad</h1>
          <p className="text-sm text-[var(--color-text-tertiary)] mt-1">
            Historial completo de acciones en tu bóveda
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Filter className="size-4 text-[var(--color-text-tertiary)]" />
          <select
            value={filterType}
            onChange={(e) => { setFilterType(e.target.value as any); setPage(1); }}
            className="h-9 px-3 bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] rounded-lg text-sm text-[var(--color-text-secondary)] focus:outline-none focus:border-violet-500/60"
          >
            {filterOptions.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-8">
        {grouped.map(([dateLabel, items]) => (
          <section key={dateLabel}>
            <h2 className="text-[10px] uppercase tracking-widest text-[var(--color-text-tertiary)] mb-3 font-mono">
              {dateLabel}
            </h2>
            <div className="space-y-1">
              {items.map((activity) => {
                const meta = ACTIVITY_META[activity.type];
                const Icon = meta.icon;
                const [iconText, iconBg] = meta.color.split(' ');
                return (
                  <div
                    key={activity.id}
                    className="flex items-center gap-4 px-4 py-3 rounded-lg hover:bg-[var(--color-bg-surface)] transition-colors group"
                  >
                    <div className={cn('size-9 rounded-lg grid place-items-center shrink-0', iconBg)}>
                      <Icon className={cn('size-4', iconText)} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2">
                        <span className="text-sm font-medium">{activity.description}</span>
                        {activity.target && (
                          <span className="text-sm text-[var(--color-text-secondary)] truncate font-mono">
                            {activity.target}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-0.5">
                        <span className="text-[10px] text-[var(--color-text-tertiary)] font-mono uppercase tracking-wider">
                          {formatTimestamp(activity.timestamp)}
                        </span>
                        {activity.device && (
                          <span className="text-[10px] text-[var(--color-text-muted)]">
                            {activity.device}
                          </span>
                        )}
                        {activity.ip && (
                          <span className="text-[10px] text-[var(--color-text-muted)] font-mono">
                            {activity.ip}
                          </span>
                        )}
                      </div>
                    </div>
                    <span className={cn(
                      'text-[10px] font-mono uppercase tracking-wider px-2 py-1 rounded',
                      iconBg, iconText,
                    )}>
                      {meta.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="py-24 text-center">
          <div className="size-16 rounded-full bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] grid place-items-center mx-auto mb-4">
            <Eye className="size-6 text-[var(--color-text-tertiary)]" />
          </div>
          <h3 className="font-display text-lg mb-1">Sin actividad</h3>
          <p className="text-sm text-[var(--color-text-tertiary)]">No hay registros con este filtro</p>
        </div>
      )}

      {totalPages > 1 && (
        <div className="mt-8 flex items-center justify-between text-sm">
          <span className="text-[var(--color-text-tertiary)] text-xs">
            {filtered.length} eventos
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={page === 1}
              onClick={() => setPage((p) => p - 1)}
              className="h-8 w-8 grid place-items-center rounded-md text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-surface)] disabled:opacity-30"
            >
              <ChevronLeft className="size-4" />
            </button>
            <span className="text-xs text-[var(--color-text-tertiary)] px-2">
              {page} / {totalPages}
            </span>
            <button
              type="button"
              disabled={page === totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="h-8 w-8 grid place-items-center rounded-md text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-surface)] disabled:opacity-30"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
