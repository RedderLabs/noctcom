'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Shield, KeyRound, Monitor, Lock, HardDrive,
  AlertTriangle, Fingerprint, Smartphone, Usb, Plus, Power, Trash2, Disc,
  Download, Upload, Loader2,
} from 'lucide-react';
import { FormatDiskModal } from '@/components/vault/FormatDiskModal';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/lib/auth-store';
import { useVault } from '@/lib/vault-store';
import { apiFetch } from '@/lib/api';
import { fromB64, decryptString } from '@/lib/crypto';
import { cn } from '@/lib/utils';

function parseDeviceName(raw: string): { browser: string; os: string } {
  let browser = 'Navegador';
  if (raw.includes('Firefox/')) browser = `Firefox ${raw.split('Firefox/')[1]?.split(' ')[0] ?? ''}`;
  else if (raw.includes('Edg/')) browser = `Edge ${raw.split('Edg/')[1]?.split(' ')[0] ?? ''}`;
  else if (raw.includes('Chrome/')) browser = `Chrome ${raw.split('Chrome/')[1]?.split(' ')[0] ?? ''}`;
  else if (raw.includes('Safari/') && !raw.includes('Chrome')) browser = 'Safari';

  let os = 'Desconocido';
  if (raw.includes('Windows NT 10')) os = 'Windows 10/11';
  else if (raw.includes('Windows')) os = 'Windows';
  else if (raw.includes('Mac OS X')) os = 'macOS';
  else if (raw.includes('Linux')) os = 'Linux';
  else if (raw.includes('Android')) os = 'Android';
  else if (raw.includes('iPhone') || raw.includes('iPad')) os = 'iOS';

  return { browser, os };
}

function timeAgo(iso: string | null): string {
  if (!iso) return 'Nunca';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Justo ahora';
  if (mins < 60) return `Hace ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Hace ${hours}h`;
  const days = Math.floor(hours / 24);
  return `Hace ${days}d`;
}

interface ApiDevice {
  id: string;
  nameEncrypted: string;
  nameNonce: string;
  publicKey: string;
  lastSeenAt: string | null;
  createdAt: string;
  isCurrent: boolean;
}

interface DeviceView {
  id: string;
  browser: string;
  os: string;
  lastSeenAt: string | null;
  createdAt: string;
  isCurrent: boolean;
}

function fmtSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0; let n = bytes;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}

interface DiskInfo {
  id: string;
  device: string;
  path: string;
  label: string;
  totalBytes: number;
  freeBytes: number;
  filesystem: string;
  removable: boolean;
  active: boolean;
  mounted: boolean;
  needsFormat: boolean;
}

interface VolumeInfo {
  id: string;
  path: string;
  label: string;
  active: boolean;
  totalBytes: number;
  freeBytes: number;
  usedBytes: number;
}

export default function SettingsPage() {
  const { username, masterKey } = useAuth();
  const { storageUsed, storageQuota } = useVault();
  const [totpEnabled, setTotpEnabled] = useState(false);
  const [passkeysEnabled, setPasskeysEnabled] = useState(false);
  const [devices, setDevices] = useState<DeviceView[]>([]);
  const [loadingDevices, setLoadingDevices] = useState(true);
  const [disks, setDisks] = useState<DiskInfo[]>([]);
  const [volumes, setVolumes] = useState<VolumeInfo[]>([]);
  const [formatDisk, setFormatDisk] = useState<DiskInfo | null>(null);
  const [formatOpen, setFormatOpen] = useState(false);

  const fetchDevices = useCallback(async () => {
    if (!masterKey) return;
    try {
      const raw = await apiFetch<ApiDevice[]>('/api/v1/auth/devices');
      const parsed = raw.map((d) => {
        let browser = 'Dispositivo';
        let os = '';
        try {
          const name = decryptString(fromB64(d.nameEncrypted), fromB64(d.nameNonce), masterKey);
          const info = parseDeviceName(name);
          browser = info.browser;
          os = info.os;
        } catch { /* fallback */ }
        return {
          id: d.id,
          browser,
          os,
          lastSeenAt: d.lastSeenAt,
          createdAt: d.createdAt,
          isCurrent: d.isCurrent,
        };
      });
      setDevices(parsed);
    } catch { /* ignore */ }
    setLoadingDevices(false);
  }, [masterKey]);

  useEffect(() => { fetchDevices(); }, [fetchDevices]);

  const fetchDisks = useCallback(async () => {
    try {
      const res = await apiFetch<{ disks: DiskInfo[] }>('/api/v1/storage/disks');
      setDisks(res.disks);
    } catch { /* ignore */ }
  }, []);

  const fetchVolumes = useCallback(async () => {
    try {
      const vols = await apiFetch<VolumeInfo[]>('/api/v1/storage/volumes');
      setVolumes(vols);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { fetchDisks(); fetchVolumes(); }, [fetchDisks, fetchVolumes]);

  const sections = [
    {
      title: 'Seguridad',
      icon: Shield,
      items: [
        {
          label: 'Autenticación de dos factores (TOTP)',
          description: 'Requiere un código de 6 dígitos al iniciar sesión',
          icon: KeyRound,
          action: (
            <button
              onClick={() => { setTotpEnabled(!totpEnabled); toast.success(totpEnabled ? '2FA desactivado' : '2FA activado'); }}
              className={cn(
                'relative w-11 h-6 rounded-full transition-colors',
                totpEnabled ? 'bg-violet-600' : 'bg-[var(--color-bg-surface-3)]',
              )}
            >
              <span className={cn(
                'absolute top-0.5 left-0.5 size-5 bg-white rounded-full transition-transform',
                totpEnabled && 'translate-x-5',
              )} />
            </button>
          ),
          status: totpEnabled ? 'Activo' : 'Inactivo',
          statusColor: totpEnabled ? 'text-emerald-400' : 'text-[var(--color-text-muted)]',
        },
        {
          label: 'Passkeys (WebAuthn)',
          description: 'Usa tu huella digital o Face ID para autenticarte',
          icon: Fingerprint,
          action: (
            <Button variant="outline" size="sm" onClick={() => toast.info('Registrando passkey…')}>
              Configurar
            </Button>
          ),
          status: passkeysEnabled ? '1 registrada' : 'Sin configurar',
          statusColor: passkeysEnabled ? 'text-emerald-400' : 'text-[var(--color-text-muted)]',
        },
        {
          label: 'Cambiar contraseña maestra',
          description: 'Re-cifra todas tus claves con una nueva contraseña',
          icon: Lock,
          action: (
            <Button variant="secondary" size="sm">
              Cambiar
            </Button>
          ),
        },
        {
          label: 'Frase de recuperación',
          description: 'Regenera o verifica tu frase de 12 palabras',
          icon: KeyRound,
          action: (
            <Button variant="secondary" size="sm">
              Verificar
            </Button>
          ),
        },
      ],
    },
  ];

  return (
    <div className="px-8 py-6 max-w-3xl mx-auto">
      <div className="mb-8">
        <h1 className="font-display text-2xl font-semibold tracking-tight">Configuración</h1>
        <p className="text-sm text-[var(--color-text-tertiary)] mt-1">
          Seguridad, dispositivos y preferencias de tu bóveda
        </p>
      </div>

      {/* Security section */}
      <section className="mb-8">
        <div className="flex items-center gap-2 mb-4">
          <Shield className="size-4 text-violet-300" />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-text-secondary)]">
            Seguridad
          </h2>
        </div>
        <div className="space-y-1">
          {sections[0].items.map((item) => (
            <div
              key={item.label}
              className="flex items-center gap-4 p-4 rounded-xl border border-[var(--color-border-faint)] bg-[var(--color-bg-surface)] hover:border-[var(--color-border-subtle)] transition-all"
            >
              <div className="size-10 rounded-lg bg-violet-500/10 border border-violet-500/20 grid place-items-center shrink-0">
                <item.icon className="size-4 text-violet-300" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-medium">{item.label}</h3>
                <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">{item.description}</p>
                {item.status && (
                  <span className={cn('text-[10px] font-mono uppercase tracking-wider mt-1 block', item.statusColor)}>
                    {item.status}
                  </span>
                )}
              </div>
              {item.action}
            </div>
          ))}
        </div>
      </section>

      {/* Devices */}
      <section className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Monitor className="size-4 text-cyan-300" />
            <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-text-secondary)]">
              Dispositivos activos
            </h2>
          </div>
          {devices.filter((d) => !d.isCurrent).length > 0 && (
            <Button variant="danger" size="sm" onClick={async () => {
              try {
                await apiFetch('/api/v1/auth/devices', { method: 'DELETE' });
                toast.success('Todas las otras sesiones revocadas');
                fetchDevices();
              } catch { toast.error('Error al revocar sesiones'); }
            }}>
              Cerrar otras sesiones
            </Button>
          )}
        </div>
        <div className="space-y-1">
          {loadingDevices && (
            <p className="text-xs text-[var(--color-text-muted)] px-1 animate-pulse">
              Cargando dispositivos…
            </p>
          )}

          {devices.map((device) => {
            const isMobile = device.os.includes('iOS') || device.os.includes('Android');
            return (
              <div
                key={device.id}
                className={cn(
                  'flex items-center gap-4 p-4 rounded-xl border bg-[var(--color-bg-surface)] transition-all',
                  device.isCurrent
                    ? 'border-emerald-500/20'
                    : 'border-[var(--color-border-faint)] hover:border-[var(--color-border-subtle)]',
                )}
              >
                <div className={cn(
                  'size-10 rounded-lg grid place-items-center shrink-0 border',
                  device.isCurrent
                    ? 'bg-emerald-500/10 border-emerald-500/20'
                    : 'bg-[var(--color-bg-surface-2)] border-[var(--color-border-faint)]',
                )}>
                  {isMobile
                    ? <Smartphone className={cn('size-4', device.isCurrent ? 'text-emerald-300' : 'text-[var(--color-text-tertiary)]')} />
                    : <Monitor className={cn('size-4', device.isCurrent ? 'text-emerald-300' : 'text-[var(--color-text-tertiary)]')} />
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-medium">{device.browser}</h3>
                    {device.isCurrent && (
                      <span className="text-[10px] font-mono uppercase tracking-wider text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                        activo
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">
                    {device.os}
                  </p>
                  <span className="text-[10px] text-[var(--color-text-muted)] font-mono uppercase tracking-wider">
                    {device.isCurrent ? 'Sesión actual' : timeAgo(device.lastSeenAt)}
                  </span>
                </div>
                {!device.isCurrent && (
                  <Button variant="ghost" size="sm" onClick={async () => {
                    try {
                      await apiFetch(`/api/v1/auth/devices/${device.id}`, { method: 'DELETE' });
                      toast.success(`Dispositivo «${device.browser}» revocado`);
                      fetchDevices();
                    } catch { toast.error('Error al revocar dispositivo'); }
                  }}>
                    Revocar
                  </Button>
                )}
              </div>
            );
          })}

          {!loadingDevices && devices.length <= 1 && (
            <p className="text-xs text-[var(--color-text-muted)] mt-2 px-1">
              No hay otros dispositivos con sesión activa.
            </p>
          )}
        </div>
      </section>

      {/* Storage — se poblará desde GET /api/v1/auth/me */}
      <section className="mb-8">
        <div className="flex items-center gap-2 mb-4">
          <HardDrive className="size-4 text-amber-300" />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-text-secondary)]">
            Almacenamiento
          </h2>
        </div>
        <div className="p-5 rounded-xl border border-[var(--color-border-faint)] bg-[var(--color-bg-surface)]">
          <div className="flex items-end justify-between mb-3">
            <div>
              <span className="text-2xl font-mono font-medium">{fmtSize(storageUsed)}</span>
              <span className="text-sm text-[var(--color-text-tertiary)] ml-1">de {fmtSize(storageQuota)}</span>
            </div>
          </div>
          <div className="h-2 bg-[var(--color-bg-surface-2)] rounded-full overflow-hidden mb-4">
            <div
              className="h-full bg-gradient-to-r from-violet-600 to-violet-400 rounded-full transition-all duration-500"
              style={{ width: `${storageQuota > 0 ? Math.min(100, (storageUsed / storageQuota) * 100) : 0}%` }}
            />
          </div>
          <p className="text-xs text-[var(--color-text-muted)]">
            {storageUsed === 0
              ? 'El desglose por tipo de archivo se mostrará cuando subas archivos.'
              : `${((storageUsed / storageQuota) * 100).toFixed(1)}% utilizado`}
          </p>
        </div>
      </section>

      {/* Physical disks */}
      <section className="mb-8">
        <div className="flex items-center gap-2 mb-4">
          <Usb className="size-4 text-blue-300" />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-text-secondary)]">
            Discos de almacenamiento
          </h2>
        </div>

        {/* Configured volumes */}
        {volumes.length > 0 && (
          <div className="space-y-1 mb-3">
            {volumes.map((vol) => (
              <div
                key={vol.id}
                className={cn(
                  'flex items-center gap-4 p-4 rounded-xl border bg-[var(--color-bg-surface)] transition-all',
                  vol.active ? 'border-blue-500/20' : 'border-[var(--color-border-faint)]',
                )}
              >
                <div className={cn(
                  'size-10 rounded-lg grid place-items-center shrink-0 border',
                  vol.active ? 'bg-blue-500/10 border-blue-500/20' : 'bg-[var(--color-bg-surface-2)] border-[var(--color-border-faint)]',
                )}>
                  <HardDrive className={cn('size-4', vol.active ? 'text-blue-300' : 'text-[var(--color-text-tertiary)]')} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-medium">{vol.label}</h3>
                    {vol.active && (
                      <span className="text-[10px] font-mono uppercase tracking-wider text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded">
                        activo
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5 font-mono">{vol.path}</p>
                  {vol.totalBytes > 0 && (
                    <div className="mt-2 p-2 rounded-lg bg-[var(--color-bg-surface-2)] border border-[var(--color-border-faint)]">
                      <div className="flex items-center gap-2 mb-1.5">
                        <div className="flex-1 h-1.5 bg-[var(--color-bg-surface-3)] rounded-full overflow-hidden">
                          <div
                            className={cn(
                              'h-full rounded-full transition-all',
                              vol.active ? 'bg-blue-500' : 'bg-[var(--color-text-tertiary)]',
                            )}
                            style={{ width: `${Math.min(100, (vol.usedBytes / vol.totalBytes) * 100)}%` }}
                          />
                        </div>
                        <span className="text-[10px] text-[var(--color-text-muted)] font-mono shrink-0">
                          {((vol.usedBytes / vol.totalBytes) * 100).toFixed(0)}%
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-1 text-center">
                        <div>
                          <p className="text-[10px] text-[var(--color-text-muted)] uppercase">Total</p>
                          <p className="text-xs font-mono font-medium">{fmtSize(vol.totalBytes)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-[var(--color-text-muted)] uppercase">Usado</p>
                          <p className="text-xs font-mono font-medium text-amber-400">{fmtSize(vol.usedBytes)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-[var(--color-text-muted)] uppercase">Libre</p>
                          <p className="text-xs font-mono font-medium text-emerald-400">{fmtSize(vol.freeBytes)}</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" onClick={async () => {
                    try {
                      await apiFetch(`/api/v1/storage/volumes/${vol.id}`, {
                        method: 'PATCH',
                        body: JSON.stringify({ active: !vol.active }),
                      });
                      toast.success(vol.active ? 'Volumen desactivado' : 'Volumen activado');
                      fetchVolumes();
                      fetchDisks();
                    } catch { toast.error('Error al actualizar volumen'); }
                  }}>
                    <Power className="size-3.5" />
                  </Button>
                  {!vol.active && (
                    <Button variant="ghost" size="sm" onClick={async () => {
                      try {
                        await apiFetch(`/api/v1/storage/volumes/${vol.id}`, { method: 'DELETE' });
                        toast.success('Volumen eliminado');
                        fetchVolumes();
                        fetchDisks();
                      } catch (e: any) { toast.error(e.message ?? 'Error al eliminar'); }
                    }}>
                      <Trash2 className="size-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Detected disks not yet configured */}
        {disks.filter((d) => !d.active).length > 0 && (
          <>
            <p className="text-xs text-[var(--color-text-muted)] mb-2 px-1">Discos detectados:</p>
            <div className="space-y-1">
              {disks.filter((d) => !d.active).map((disk) => (
                <div
                  key={disk.id}
                  className="flex items-center gap-4 p-4 rounded-xl border border-dashed border-[var(--color-border-faint)] bg-[var(--color-bg-surface)] hover:border-[var(--color-border-subtle)] transition-all"
                >
                  <div className="size-10 rounded-lg grid place-items-center shrink-0 bg-[var(--color-bg-surface-2)] border border-[var(--color-border-faint)]">
                    {disk.removable
                      ? <Usb className="size-4 text-[var(--color-text-tertiary)]" />
                      : <HardDrive className="size-4 text-[var(--color-text-tertiary)]" />
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-medium">{disk.label}</h3>
                      {disk.removable && (
                        <span className="text-[10px] font-mono uppercase tracking-wider text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded">
                          USB
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5 font-mono">{disk.path}</p>
                    <div className="mt-2 p-2 rounded-lg bg-[var(--color-bg-surface-2)] border border-[var(--color-border-faint)]">
                      <div className="flex items-center gap-2 mb-1.5">
                        <div className="flex-1 h-1.5 bg-[var(--color-bg-surface-3)] rounded-full overflow-hidden">
                          <div
                            className="h-full bg-[var(--color-text-tertiary)] rounded-full"
                            style={{ width: `${disk.totalBytes > 0 ? Math.min(100, ((disk.totalBytes - disk.freeBytes) / disk.totalBytes) * 100) : 0}%` }}
                          />
                        </div>
                        <span className="text-[10px] text-[var(--color-text-muted)] font-mono shrink-0">
                          {disk.totalBytes > 0 ? ((1 - disk.freeBytes / disk.totalBytes) * 100).toFixed(0) : 0}%
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-1 text-center">
                        <div>
                          <p className="text-[10px] text-[var(--color-text-muted)] uppercase">Total</p>
                          <p className="text-xs font-mono font-medium">{fmtSize(disk.totalBytes)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-[var(--color-text-muted)] uppercase">Usado</p>
                          <p className="text-xs font-mono font-medium text-amber-400">{fmtSize(disk.totalBytes - disk.freeBytes)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-[var(--color-text-muted)] uppercase">Libre</p>
                          <p className="text-xs font-mono font-medium text-emerald-400">{fmtSize(disk.freeBytes)}</p>
                        </div>
                      </div>
                      <div className="flex items-center justify-center gap-2 mt-1.5 pt-1.5 border-t border-[var(--color-border-faint)]">
                        <span className={cn('text-[10px] font-mono uppercase', disk.needsFormat ? 'text-amber-400' : 'text-[var(--color-text-muted)]')}>
                          {disk.filesystem || 'sin formato'}
                        </span>
                        {disk.needsFormat && <span className="text-[10px] text-amber-400 font-medium">(incompatible)</span>}
                        {!disk.removable && <span className="text-[10px] text-[var(--color-text-muted)]">· Interno</span>}
                      </div>
                    </div>
                  </div>
                  {disk.needsFormat ? (
                    <Button variant="danger" size="sm" onClick={() => {
                      setFormatDisk(disk);
                      setFormatOpen(true);
                    }}>
                      <Disc className="size-3.5 mr-1" /> Formatear
                    </Button>
                  ) : !disk.mounted ? (
                    <Button variant="secondary" size="sm" onClick={async () => {
                      try {
                        const res = await apiFetch<{ ok: boolean; mountPath: string }>('/api/v1/storage/disks/mount', {
                          method: 'POST',
                          body: JSON.stringify({ device: disk.device, label: disk.label.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 12) || disk.id }),
                        });
                        await apiFetch('/api/v1/storage/volumes', {
                          method: 'POST',
                          body: JSON.stringify({ path: res.mountPath, label: disk.label }),
                        });
                        toast.success(`«${disk.label}» montado y añadido`);
                        fetchVolumes();
                        fetchDisks();
                      } catch (e: any) { toast.error(e.message ?? 'Error al montar disco'); }
                    }}>
                      <Plus className="size-3.5 mr-1" /> Montar
                    </Button>
                  ) : (
                    <Button variant="outline" size="sm" onClick={async () => {
                      try {
                        await apiFetch('/api/v1/storage/volumes', {
                          method: 'POST',
                          body: JSON.stringify({ path: disk.path, label: disk.label }),
                        });
                        toast.success(`«${disk.label}» añadido como volumen`);
                        fetchVolumes();
                        fetchDisks();
                      } catch (e: any) { toast.error(e.message ?? 'Error al añadir disco'); }
                    }}>
                      <Plus className="size-3.5 mr-1" /> Añadir
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </>
        )}

        {disks.length === 0 && volumes.length === 0 && (
          <p className="text-xs text-[var(--color-text-muted)] px-1">
            No se detectaron discos externos. Conecta un USB o disco SATA.
          </p>
        )}
      </section>

      <FormatDiskModal
        open={formatOpen}
        onClose={() => { setFormatOpen(false); setFormatDisk(null); }}
        disk={formatDisk}
        onFormatted={() => { fetchDisks(); fetchVolumes(); }}
      />

      {/* Export / Import */}
      <ExportImportSection />

      {/* Danger zone */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <AlertTriangle className="size-4 text-red-400" />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-red-400">
            Zona de peligro
          </h2>
        </div>
        <div className="p-5 rounded-xl border border-red-500/20 bg-red-500/5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-medium text-red-300">Eliminar cuenta</h3>
              <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">
                Elimina permanentemente tu cuenta y todos tus archivos. Esta acción es irreversible.
              </p>
            </div>
            <Button variant="danger" size="sm">
              Eliminar
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}

// ─── Export / Import Section ─────────────────────────────────────

function ExportImportSection() {
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importPhase, setImportPhase] = useState('');
  const [importPct, setImportPct] = useState(0);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPassword, setImportPassword] = useState('');
  const [vaultName, setVaultName] = useState<string | null>(null);
  const [passwordValidated, setPasswordValidated] = useState(false);
  const [validatingPw, setValidatingPw] = useState(false);
  const [vaultKeyRef, setVaultKeyRef] = useState<Uint8Array | null>(null);

  const { currentVaultId } = useVault();

  const handleExport = async () => {
    if (!currentVaultId) return;
    setExporting(true);
    try {
      const { exportVault } = await import('@/lib/vault-export');
      await exportVault(currentVaultId);
      toast.success('Bóveda exportada');
    } catch (err: any) {
      toast.error(`Error al exportar: ${err.message}`);
    } finally {
      setExporting(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      setImportFile(f);
      setPasswordValidated(false);
      setVaultName(null);
      setImportPassword('');
      setVaultKeyRef(null);
    }
  };

  const handleValidatePassword = async () => {
    if (!importFile || !importPassword) return;
    setValidatingPw(true);
    try {
      const { parseManifest, validateExportPassword } = await import('@/lib/vault-export');
      const manifest = await parseManifest(importFile);
      const { vaultName: name, vaultKey } = await validateExportPassword(manifest, importPassword);
      setVaultName(name);
      setVaultKeyRef(vaultKey);
      setPasswordValidated(true);
    } catch (err: any) {
      if (err.message === 'wrong_password') {
        toast.error('Contraseña incorrecta');
      } else {
        toast.error(`Error: ${err.message}`);
      }
    } finally {
      setValidatingPw(false);
    }
  };

  const handleImport = async () => {
    if (!importFile || !vaultKeyRef) return;
    setImporting(true);
    try {
      const { importVault } = await import('@/lib/vault-export');
      await importVault(importFile, vaultKeyRef, (phase, pct) => {
        setImportPhase(phase);
        setImportPct(pct);
      });
      toast.success('Bóveda importada correctamente');
      setImportFile(null);
      setImportPassword('');
      setPasswordValidated(false);
      setVaultName(null);
      setVaultKeyRef(null);
      useVault.getState().init();
    } catch (err: any) {
      toast.error(`Error al importar: ${err.message}`);
    } finally {
      setImporting(false);
      setImportPhase('');
      setImportPct(0);
    }
  };

  const phaseLabel: Record<string, string> = {
    parsing: 'Leyendo archivo...',
    validating: 'Validando...',
    rewrapping: 'Re-cifrando claves...',
    uploading: 'Subiendo archivos...',
    done: 'Completado',
  };

  return (
    <section>
      <div className="flex items-center gap-2 mb-4">
        <Download className="size-4 text-violet-300" />
        <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-text-secondary)]">
          Exportar / Importar bóveda
        </h2>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Export */}
        <div className="p-5 rounded-xl border border-[var(--color-border-faint)] bg-[var(--color-bg-surface)]">
          <div className="flex items-center gap-2 mb-2">
            <Download className="size-4 text-emerald-300" />
            <h3 className="text-sm font-medium">Exportar</h3>
          </div>
          <p className="text-xs text-[var(--color-text-tertiary)] mb-4">
            Descarga toda tu bóveda como un archivo <code className="text-[10px] bg-[var(--color-bg-surface-2)] px-1 py-0.5 rounded">.noctcom</code> cifrado.
            Puedes importarlo en cualquier instancia de Noctcom.
          </p>
          <Button
            variant="outline"
            size="sm"
            leftIcon={exporting ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
            onClick={handleExport}
            disabled={exporting || !currentVaultId}
          >
            {exporting ? 'Exportando...' : 'Exportar bóveda'}
          </Button>
        </div>

        {/* Import */}
        <div className="p-5 rounded-xl border border-[var(--color-border-faint)] bg-[var(--color-bg-surface)]">
          <div className="flex items-center gap-2 mb-2">
            <Upload className="size-4 text-violet-300" />
            <h3 className="text-sm font-medium">Importar</h3>
          </div>
          <p className="text-xs text-[var(--color-text-tertiary)] mb-4">
            Importa un archivo <code className="text-[10px] bg-[var(--color-bg-surface-2)] px-1 py-0.5 rounded">.noctcom</code> exportado desde otra instancia.
          </p>

          <div className="space-y-3">
            <label className="block">
              <span className="text-xs text-[var(--color-text-tertiary)]">Archivo .noctcom</span>
              <input
                type="file"
                accept=".noctcom"
                onChange={handleFileSelect}
                disabled={importing}
                className="mt-1 block w-full text-xs text-[var(--color-text-secondary)]
                           file:mr-3 file:px-3 file:py-1.5 file:rounded-md file:border-0
                           file:text-xs file:font-medium file:bg-violet-500/10 file:text-violet-300
                           hover:file:bg-violet-500/20 file:cursor-pointer file:transition-colors"
              />
            </label>

            {importFile && !passwordValidated && (
              <>
                <label className="block">
                  <span className="text-xs text-[var(--color-text-tertiary)]">Contraseña de la cuenta origen</span>
                  <input
                    type="password"
                    value={importPassword}
                    onChange={(e) => setImportPassword(e.target.value)}
                    placeholder="Contraseña usada al exportar"
                    className="mt-1 w-full px-3 py-2 rounded-lg border border-[var(--color-border-faint)]
                               bg-[var(--color-bg-deep)] text-sm text-[var(--color-text-primary)]
                               placeholder:text-[var(--color-text-muted)]
                               focus:outline-none focus:border-violet-500/50"
                    onKeyDown={(e) => e.key === 'Enter' && handleValidatePassword()}
                  />
                </label>
                <Button
                  variant="outline"
                  size="sm"
                  leftIcon={validatingPw ? <Loader2 className="size-3.5 animate-spin" /> : <Lock className="size-3.5" />}
                  onClick={handleValidatePassword}
                  disabled={!importPassword || validatingPw}
                >
                  {validatingPw ? 'Verificando...' : 'Verificar contraseña'}
                </Button>
              </>
            )}

            {passwordValidated && vaultName && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                  <Shield className="size-3.5 text-emerald-300" />
                  <span className="text-xs text-emerald-300">
                    Bóveda: <strong>{vaultName}</strong>
                  </span>
                </div>
                <Button
                  variant="primary"
                  size="sm"
                  leftIcon={importing ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
                  onClick={handleImport}
                  disabled={importing}
                >
                  {importing ? 'Importando...' : 'Importar bóveda'}
                </Button>
              </div>
            )}

            {importing && importPhase && (
              <div className="space-y-1.5">
                <div className="flex justify-between text-[10px] text-[var(--color-text-tertiary)]">
                  <span>{phaseLabel[importPhase] ?? importPhase}</span>
                  <span>{importPct}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-[var(--color-bg-deep)] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-violet-500 transition-all duration-300"
                    style={{ width: `${importPct}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
