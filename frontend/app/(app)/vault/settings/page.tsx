'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Shield, KeyRound, Monitor, Lock, HardDrive,
  AlertTriangle, Fingerprint, Smartphone, Usb, Plus, Power, Trash2, Disc,
  Download, Upload, Loader2, Mail, Server, Copy, Check, FolderPlus, Eraser,
  FileKey2, RefreshCw, Bell, BellOff, Gauge, CreditCard,
} from 'lucide-react';
import Link from 'next/link';
import { FormatDiskModal } from '@/components/vault/FormatDiskModal';
import { AgentFormatModal } from '@/components/vault/AgentFormatModal';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useAuth } from '@/lib/auth-store';
import { useVault } from '@/lib/vault-store';
import { apiFetch } from '@/lib/api';
import { getStepUpToken } from '@/lib/step-up';
import { fromB64, decryptString, encryptString, toB64, initCrypto, wipe } from '@/lib/crypto';
import {
  generateRecoveryMnemonic, deriveRecoverySeed,
  deriveRecoverySignKeypair, deriveRecoveryBoxKeypair, sealToRecovery,
} from '@/lib/recovery';
import { getPushStatus, isPushChosen, enablePush, disablePush, type PushStatus } from '@/lib/firebase';
import { changeMasterPassword } from '@/lib/change-password';
import { fetchBillingStatus, openBillingPortal, formatBytes, type BillingStatus } from '@/lib/billing';
import { cn } from '@/lib/utils';
import { useRouter } from 'next/navigation';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

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
  const router = useRouter();
  const { username, masterKey, logout } = useAuth();
  const { storageUsed, storageQuota, reset: resetVault } = useVault();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [devices, setDevices] = useState<DeviceView[]>([]);
  const [loadingDevices, setLoadingDevices] = useState(true);
  const [disks, setDisks] = useState<DiskInfo[]>([]);
  const [volumes, setVolumes] = useState<VolumeInfo[]>([]);
  const [formatDisk, setFormatDisk] = useState<DiskInfo | null>(null);
  const [formatOpen, setFormatOpen] = useState(false);
  const [agents, setAgents] = useState<AgentView[]>([]);
  const [agentDisks, setAgentDisks] = useState<Record<string, AgentDisk[]>>({});

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

  // Solo en self-host tiene sentido detectar/gestionar los discos del servidor.
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_SELF_HOST === 'true') { fetchDisks(); fetchVolumes(); }
  }, [fetchDisks, fetchVolumes]);

  // Discos servidos por los agentes online (cloud): listado real de la máquina
  // del usuario vía el Noctcom Connector.
  const fetchAgentStorage = useCallback(async () => {
    if (!masterKey) return;
    try {
      const raw = await apiFetch<ApiAgent[]>('/api/v1/agent');
      const views: AgentView[] = raw.map((a) => {
        let name = 'Agente';
        try { name = decryptString(fromB64(a.nameEncrypted), fromB64(a.nameNonce), masterKey); } catch { /* */ }
        return { id: a.id, name, platform: a.platform, online: a.online };
      });
      setAgents(views);
      const entries = await Promise.all(
        views.filter((v) => v.online).map(async (a) => {
          try {
            const r = await apiFetch<{ disks: AgentDisk[] }>(`/api/v1/storage/disks?agentId=${a.id}`);
            return [a.id, r.disks] as const;
          } catch { return [a.id, [] as AgentDisk[]] as const; }
        }),
      );
      setAgentDisks(Object.fromEntries(entries));
    } catch { /* sin agentes */ }
  }, [masterKey]);

  useEffect(() => { fetchAgentStorage(); }, [fetchAgentStorage]);

  async function handleDeleteAccount() {
    setDeleting(true);
    try {
      await apiFetch('/api/v1/auth/me', { method: 'DELETE' });
      resetVault();
      logout();
      router.replace('/');
    } catch (err: any) {
      toast.error(`No se pudo eliminar la cuenta: ${err.message}`);
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  const onlineAgents = agents.filter((a) => a.online);
  // Self-host: el backend corre en la máquina del usuario, así que sus discos SÍ
  // son los suyos. En la nube (noctcom.com) los discos del servidor son ajenos y
  // NO deben mostrarse: ahí todo viene del agente. Por defecto false (cloud).
  const isSelfHost = process.env.NEXT_PUBLIC_SELF_HOST === 'true';

  return (
    <div className="px-8 py-6 max-w-3xl mx-auto">
      <div className="mb-8">
        <h1 className="font-display text-2xl font-semibold tracking-tight">Configuración</h1>
        <p className="text-sm text-text-tertiary mt-1">
          Seguridad, dispositivos y preferencias de tu bóveda
        </p>
      </div>

      {/* Plan y uso (billing) */}
      <PlanUsageSection />

      {/* Cambiar contraseña maestra */}
      <ChangePasswordSection />

      {/* Passkeys (WebAuthn) */}
      <PasskeysSection />

      {/* 2FA por email (OTP) */}
      <EmailOtp2FASection />

      {/* Kit de recuperación (Recovery v2) */}
      <RecoveryKitSection />

      {/* Notificaciones push (FCM) */}
      <PushNotificationsSection />

      {/* Devices */}
      <section className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Monitor className="size-4 text-cyan-300" />
            <h2 className="text-sm font-semibold uppercase tracking-wider text-text-secondary">
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
            <p className="text-xs text-text-muted px-1 animate-pulse">
              Cargando dispositivos…
            </p>
          )}

          {devices.map((device) => {
            const isMobile = device.os.includes('iOS') || device.os.includes('Android');
            return (
              <div
                key={device.id}
                className={cn(
                  'flex items-center gap-4 p-4 rounded-xl border bg-bg-surface transition-all',
                  device.isCurrent
                    ? 'border-emerald-500/20'
                    : 'border-border-faint hover:border-border-subtle',
                )}
              >
                <div className={cn(
                  'size-10 rounded-lg grid place-items-center shrink-0 border',
                  device.isCurrent
                    ? 'bg-emerald-500/10 border-emerald-500/20'
                    : 'bg-bg-surface-2 border-border-faint',
                )}>
                  {isMobile
                    ? <Smartphone className={cn('size-4', device.isCurrent ? 'text-emerald-300' : 'text-text-tertiary')} />
                    : <Monitor className={cn('size-4', device.isCurrent ? 'text-emerald-300' : 'text-text-tertiary')} />
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
                  <p className="text-xs text-text-tertiary mt-0.5">
                    {device.os}
                  </p>
                  <span className="text-[10px] text-text-muted font-mono uppercase tracking-wider">
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
            <p className="text-xs text-text-muted mt-2 px-1">
              No hay otros dispositivos con sesión activa.
            </p>
          )}
        </div>
      </section>

      {/* Storage — se poblará desde GET /api/v1/auth/me */}
      <section className="mb-8">
        <div className="flex items-center gap-2 mb-4">
          <HardDrive className="size-4 text-amber-300" />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-text-secondary">
            Almacenamiento
          </h2>
        </div>
        <div className="p-5 rounded-xl border border-border-faint bg-bg-surface">
          <div className="flex items-end justify-between mb-3">
            <div>
              <span className="text-2xl font-mono font-medium">{fmtSize(storageUsed)}</span>
              <span className="text-sm text-text-tertiary ml-1">de {fmtSize(storageQuota)}</span>
            </div>
          </div>
          <div className="h-2 bg-bg-surface-2 rounded-full overflow-hidden mb-4">
            <div
              className="h-full bg-gradient-to-r from-violet-600 to-violet-400 rounded-full transition-all duration-500"
              style={{ width: `${storageQuota > 0 ? Math.min(100, (storageUsed / storageQuota) * 100) : 0}%` }}
            />
          </div>
          <p className="text-xs text-text-muted">
            {storageUsed === 0
              ? 'El desglose por tipo de archivo se mostrará cuando subas archivos.'
              : `${((storageUsed / storageQuota) * 100).toFixed(1)}% utilizado`}
          </p>
        </div>
      </section>

      {/* Noctcom Connector (agente local) */}
      <ConnectorAgentsSection />

      {/* Discos de almacenamiento. En cloud solo se muestran los discos del
          agente ONLINE; sin agente conectado (o vinculación vieja) no se muestra
          nada. Los discos del servidor solo se gestionan en self-host. */}
      {(isSelfHost || onlineAgents.length > 0) && (
      <section className="mb-8">
        <div className="flex items-center gap-2 mb-4">
          <Usb className="size-4 text-blue-300" />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-text-secondary">
            Discos de almacenamiento
          </h2>
        </div>

        {/* Discos servidos por el agente (cloud): los reales de tu máquina */}
        {onlineAgents.map((a) => (
          <div key={a.id} className="mb-4">
            <p className="text-xs text-text-secondary mb-2 px-1 flex items-center gap-1.5">
              <Server className="size-3.5 text-emerald-300" />
              Discos de <strong className="font-medium">{a.name}</strong>
            </p>
            {(agentDisks[a.id] ?? []).length === 0 ? (
              <p className="text-xs text-text-muted px-1">El agente no detectó discos.</p>
            ) : (
              <div className="space-y-1">
                {(agentDisks[a.id] ?? []).map((d) => (
                  <AgentDiskCard key={d.id} disk={d} agentId={a.id} onChanged={fetchAgentStorage} />
                ))}
              </div>
            )}
          </div>
        ))}
        {onlineAgents.length > 0 && (
          <p className="text-[10px] text-text-muted px-1 mb-4">
            «Usar este disco» crea una carpeta <span className="font-mono">noctcom-blobs</span> en él para guardar tus
            archivos cifrados; no formatea ni borra nada. El formateo de discos llega en la próxima versión del agente.
          </p>
        )}

        {/* Configured volumes (solo self-host) */}
        {isSelfHost && volumes.length > 0 && (
          <div className="space-y-1 mb-3">
            {volumes.map((vol) => (
              <div
                key={vol.id}
                className={cn(
                  'flex items-center gap-4 p-4 rounded-xl border bg-bg-surface transition-all',
                  vol.active ? 'border-blue-500/20' : 'border-border-faint',
                )}
              >
                <div className={cn(
                  'size-10 rounded-lg grid place-items-center shrink-0 border',
                  vol.active ? 'bg-blue-500/10 border-blue-500/20' : 'bg-bg-surface-2 border-border-faint',
                )}>
                  <HardDrive className={cn('size-4', vol.active ? 'text-blue-300' : 'text-text-tertiary')} />
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
                  <p className="text-xs text-text-tertiary mt-0.5 font-mono">{vol.path}</p>
                  {vol.totalBytes > 0 && (
                    <div className="mt-2 p-2 rounded-lg bg-bg-surface-2 border border-border-faint">
                      <div className="flex items-center gap-2 mb-1.5">
                        <div className="flex-1 h-1.5 bg-bg-surface-3 rounded-full overflow-hidden">
                          <div
                            className={cn(
                              'h-full rounded-full transition-all',
                              vol.active ? 'bg-blue-500' : 'bg-text-tertiary',
                            )}
                            style={{ width: `${Math.min(100, (vol.usedBytes / vol.totalBytes) * 100)}%` }}
                          />
                        </div>
                        <span className="text-[10px] text-text-muted font-mono shrink-0">
                          {((vol.usedBytes / vol.totalBytes) * 100).toFixed(0)}%
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-1 text-center">
                        <div>
                          <p className="text-[10px] text-text-muted uppercase">Total</p>
                          <p className="text-xs font-mono font-medium">{fmtSize(vol.totalBytes)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-text-muted uppercase">Usado</p>
                          <p className="text-xs font-mono font-medium text-amber-400">{fmtSize(vol.usedBytes)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-text-muted uppercase">Libre</p>
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
                        const stepUpToken = await getStepUpToken();
                        await apiFetch(`/api/v1/storage/volumes/${vol.id}`, {
                          method: 'DELETE',
                          headers: { 'x-step-up-token': stepUpToken },
                        });
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

        {/* Discos detectados en el SERVIDOR — SOLO self-host. En cloud los reales
            vienen del agente; los del servidor de la web son ajenos y no se muestran. */}
        {isSelfHost && disks.filter((d) => !d.active).length > 0 && (
          <>
            <p className="text-xs text-text-muted mb-2 px-1">Discos detectados:</p>
            <div className="space-y-1">
              {disks.filter((d) => !d.active).map((disk) => (
                <div
                  key={disk.id}
                  className="flex items-center gap-4 p-4 rounded-xl border border-dashed border-border-faint bg-bg-surface hover:border-border-subtle transition-all"
                >
                  <div className="size-10 rounded-lg grid place-items-center shrink-0 bg-bg-surface-2 border border-border-faint">
                    {disk.removable
                      ? <Usb className="size-4 text-text-tertiary" />
                      : <HardDrive className="size-4 text-text-tertiary" />
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
                    <p className="text-xs text-text-tertiary mt-0.5 font-mono">{disk.path}</p>
                    <div className="mt-2 p-2 rounded-lg bg-bg-surface-2 border border-border-faint">
                      <div className="flex items-center gap-2 mb-1.5">
                        <div className="flex-1 h-1.5 bg-bg-surface-3 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-text-tertiary rounded-full"
                            style={{ width: `${disk.totalBytes > 0 ? Math.min(100, ((disk.totalBytes - disk.freeBytes) / disk.totalBytes) * 100) : 0}%` }}
                          />
                        </div>
                        <span className="text-[10px] text-text-muted font-mono shrink-0">
                          {disk.totalBytes > 0 ? ((1 - disk.freeBytes / disk.totalBytes) * 100).toFixed(0) : 0}%
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-1 text-center">
                        <div>
                          <p className="text-[10px] text-text-muted uppercase">Total</p>
                          <p className="text-xs font-mono font-medium">{fmtSize(disk.totalBytes)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-text-muted uppercase">Usado</p>
                          <p className="text-xs font-mono font-medium text-amber-400">{fmtSize(disk.totalBytes - disk.freeBytes)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-text-muted uppercase">Libre</p>
                          <p className="text-xs font-mono font-medium text-emerald-400">{fmtSize(disk.freeBytes)}</p>
                        </div>
                      </div>
                      <div className="flex items-center justify-center gap-2 mt-1.5 pt-1.5 border-t border-border-faint">
                        <span className={cn('text-[10px] font-mono uppercase', disk.needsFormat ? 'text-amber-400' : 'text-text-muted')}>
                          {disk.filesystem || 'sin formato'}
                        </span>
                        {disk.needsFormat && <span className="text-[10px] text-amber-400 font-medium">(incompatible)</span>}
                        {!disk.removable && <span className="text-[10px] text-text-muted">· Interno</span>}
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

        {isSelfHost && disks.length === 0 && volumes.length === 0 && (
          <div className="p-3 rounded-lg bg-bg-surface border border-border-faint flex items-start gap-2">
            <AlertTriangle className="size-4 text-amber-300 mt-0.5 shrink-0" />
            <p className="text-xs text-text-tertiary leading-relaxed">
              No se detectaron discos en el servidor. Conecta un disco (USB/SATA) a la máquina
              donde corre Noctcom y aparecerá aquí para añadirlo como volumen.
            </p>
          </div>
        )}
      </section>
      )}

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
              <p className="text-xs text-text-tertiary mt-0.5">
                Elimina permanentemente tu cuenta y todos tus archivos. Esta acción es irreversible.
              </p>
            </div>
            <Button
              variant="danger"
              size="sm"
              loading={deleting}
              onClick={() => setConfirmDelete(true)}
            >
              Eliminar
            </Button>
          </div>
        </div>
      </section>

      <ConfirmDialog
        open={confirmDelete}
        danger
        title="¿Eliminar tu cuenta?"
        message="Se borrarán para siempre tu cuenta, todas tus bóvedas y todos tus archivos cifrados. No hay forma de recuperarlos. Esta acción es irreversible."
        confirmLabel="Eliminar mi cuenta"
        cancelLabel="Cancelar"
        onConfirm={handleDeleteAccount}
        onCancel={() => setConfirmDelete(false)}
      />
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
        <h2 className="text-sm font-semibold uppercase tracking-wider text-text-secondary">
          Exportar / Importar bóveda
        </h2>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Export */}
        <div className="p-5 rounded-xl border border-border-faint bg-bg-surface">
          <div className="flex items-center gap-2 mb-2">
            <Download className="size-4 text-emerald-300" />
            <h3 className="text-sm font-medium">Exportar</h3>
          </div>
          <p className="text-xs text-text-tertiary mb-4">
            Descarga toda tu bóveda como un archivo <code className="text-[10px] bg-bg-surface-2 px-1 py-0.5 rounded">.noctcom</code> cifrado.
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
        <div className="p-5 rounded-xl border border-border-faint bg-bg-surface">
          <div className="flex items-center gap-2 mb-2">
            <Upload className="size-4 text-violet-300" />
            <h3 className="text-sm font-medium">Importar</h3>
          </div>
          <p className="text-xs text-text-tertiary mb-4">
            Importa un archivo <code className="text-[10px] bg-bg-surface-2 px-1 py-0.5 rounded">.noctcom</code> exportado desde otra instancia.
          </p>

          <div className="space-y-3">
            <label className="block">
              <span className="text-xs text-text-tertiary">Archivo .noctcom</span>
              <input
                type="file"
                accept=".noctcom"
                onChange={handleFileSelect}
                disabled={importing}
                className="mt-1 block w-full text-xs text-text-secondary
                           file:mr-3 file:px-3 file:py-1.5 file:rounded-md file:border-0
                           file:text-xs file:font-medium file:bg-violet-500/10 file:text-violet-300
                           hover:file:bg-violet-500/20 file:cursor-pointer file:transition-colors"
              />
            </label>

            {importFile && !passwordValidated && (
              <>
                <label className="block">
                  <span className="text-xs text-text-tertiary">Contraseña de la cuenta origen</span>
                  <input
                    type="password"
                    value={importPassword}
                    onChange={(e) => setImportPassword(e.target.value)}
                    placeholder="Contraseña usada al exportar"
                    className="mt-1 w-full px-3 py-2 rounded-lg border border-border-faint
                               bg-bg-deep text-sm text-text-primary
                               placeholder:text-text-muted
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
                <div className="flex justify-between text-[10px] text-text-tertiary">
                  <span>{phaseLabel[importPhase] ?? importPhase}</span>
                  <span>{importPct}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-bg-deep overflow-hidden">
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

// ─── 2FA por email (OTP) Section ─────────────────────────────────

function EmailOtp2FASection() {
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [emailVerified, setEmailVerified] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const r = await apiFetch<{ emailVerified: boolean; emailOtpEnabled: boolean }>(
        '/api/v1/2fa/email/status',
      );
      setEnabled(r.emailOtpEnabled);
      setEmailVerified(r.emailVerified);
    } catch {
      /* sin sesión */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  async function toggle() {
    setWorking(true);
    try {
      if (enabled) {
        await apiFetch('/api/v1/2fa/email/disable', { method: 'POST' });
        setEnabled(false);
        toast.success('2FA por email desactivado');
      } else {
        await apiFetch('/api/v1/2fa/email/enable', { method: 'POST' });
        setEnabled(true);
        toast.success('2FA por email activado');
      }
    } catch (err: any) {
      toast.error(err.message ?? 'No se pudo cambiar el 2FA por email');
    } finally {
      setWorking(false);
    }
  }

  return (
    <section className="mb-8">
      <div className="flex items-center gap-2 mb-4">
        <Mail className="size-4 text-violet-300" />
        <h2 className="text-sm font-semibold uppercase tracking-wider text-text-secondary">
          Código por email
        </h2>
      </div>

      <div className="flex items-center gap-4 p-4 rounded-xl border border-border-faint bg-bg-surface">
        <div className="size-10 rounded-lg bg-violet-500/10 border border-violet-500/20 grid place-items-center shrink-0">
          <Mail className="size-4 text-violet-300" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-medium">Verificación por email en el login</h3>
          <p className="text-xs text-text-tertiary mt-0.5">
            {emailVerified
              ? 'Te pediremos un código de 6 dígitos enviado a tu email al iniciar sesión.'
              : 'Verifica tu email primero para poder activar esta opción.'}
          </p>
        </div>
        {loading ? (
          <Loader2 className="size-4 animate-spin text-text-tertiary" />
        ) : (
          <Button
            size="sm"
            variant={enabled ? 'outline' : 'primary'}
            loading={working}
            disabled={!emailVerified && !enabled}
            onClick={toggle}
          >
            {enabled ? 'Desactivar' : 'Activar'}
          </Button>
        )}
      </div>
    </section>
  );
}

// ─── Kit de recuperación (Recovery v2) ───────────────────────────
// La frase mnemónica deriva un par X25519 cuya pública sella las vault
// keys y la sk_exchange en el servidor. Con el kit completo, recuperar la
// cuenta con la frase conserva archivos y compartidos. Las cuentas creadas
// antes de v2 deben re-introducir (o regenerar) su frase una vez.

interface RecoveryStatus {
  recoveryEnabled: boolean;
  recoveryPublicKey: string | null;
  recoveryBoxPublicKey: string | null;
  exchangeSealed: boolean;
  vaultsTotal: number;
  vaultsSealed: number;
}

function RecoveryKitSection() {
  const [status, setStatus] = useState<RecoveryStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [mode, setMode] = useState<'idle' | 'enter' | 'generate'>('idle');
  const [words, setWords] = useState<string[]>(Array(12).fill(''));
  const [newMnemonic, setNewMnemonic] = useState<string[]>([]);
  const [savedConfirmed, setSavedConfirmed] = useState(false);
  const [copied, setCopied] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const r = await apiFetch<RecoveryStatus>('/api/v1/2fa/recovery/status');
      setStatus(r);
    } catch {
      /* sin sesión */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  const complete = !!status && !!status.recoveryBoxPublicKey
    && status.exchangeSealed && status.vaultsSealed >= status.vaultsTotal;

  // Sella las vault keys (en memoria tras el login) y la sk_exchange a la
  // box pública derivada de la frase, y sube el kit. Exige step-up (firma
  // con la identity key — transparente para el usuario con sesión viva).
  async function uploadKit(mnemonicWords: string[], rotate: boolean) {
    await initCrypto();
    const auth = useAuth.getState();
    if (!auth.exchangePrivateKey) {
      toast.error('Sesión bloqueada — vuelve a iniciar sesión');
      return;
    }
    const vaultKeys = Object.values(auth.vaultKeys);
    if (vaultKeys.length === 0) {
      toast.error('No hay bóvedas cargadas — abre tu bóveda y vuelve a intentarlo');
      return;
    }

    const seed = deriveRecoverySeed(mnemonicWords);
    const signKp = deriveRecoverySignKeypair(seed);

    if (!rotate) {
      // La frase introducida debe ser LA de la cuenta: misma pública de firma.
      if (!status?.recoveryPublicKey || toB64(signKp.publicKey) !== status.recoveryPublicKey) {
        wipe(seed, signKp.privateKey);
        toast.error('Esa frase no corresponde a esta cuenta');
        return;
      }
    }

    const boxKp = deriveRecoveryBoxKeypair(seed);
    const vaults = vaultKeys.map((v) => ({
      id: v.vaultId,
      vaultKeySealedRecovery: toB64(sealToRecovery(v.key, boxKp.publicKey)),
    }));
    const exchangeSealed = toB64(sealToRecovery(auth.exchangePrivateKey, boxKp.publicKey));

    const stepUpToken = await getStepUpToken();
    await apiFetch('/api/v1/2fa/recovery/upgrade', {
      method: 'POST',
      headers: { 'x-step-up-token': stepUpToken },
      body: JSON.stringify({
        recoveryPublicKey: rotate ? toB64(signKp.publicKey) : undefined,
        recoveryBoxPublicKey: toB64(boxKp.publicKey),
        exchangePrivateKeySealedRecovery: exchangeSealed,
        vaults,
      }),
    });

    wipe(seed, signKp.privateKey, boxKp.privateKey);
  }

  async function handleEnterSubmit(e: React.FormEvent) {
    e.preventDefault();
    setWorking(true);
    try {
      await uploadKit(words, false);
      toast.success('Kit de recuperación activado');
      setMode('idle');
      setWords(Array(12).fill(''));
      fetchStatus();
    } catch (err: any) {
      toast.error(err.message ?? 'No se pudo activar el kit');
    } finally {
      setWorking(false);
    }
  }

  async function handleGenerateConfirm() {
    if (!savedConfirmed) return;
    setWorking(true);
    try {
      await uploadKit(newMnemonic, true);
      toast.success('Frase nueva activada — la anterior ya no sirve');
      setMode('idle');
      setNewMnemonic([]);
      setSavedConfirmed(false);
      fetchStatus();
    } catch (err: any) {
      toast.error(err.message ?? 'No se pudo regenerar la frase');
    } finally {
      setWorking(false);
    }
  }

  return (
    <section className="mb-8">
      <div className="flex items-center gap-2 mb-4">
        <FileKey2 className="size-4 text-violet-300" />
        <h2 className="text-sm font-semibold uppercase tracking-wider text-text-secondary">
          Kit de recuperación
        </h2>
      </div>

      <div className="p-4 rounded-xl border border-border-faint bg-bg-surface space-y-4">
        <div className="flex items-center gap-4">
          <div className={cn(
            'size-10 rounded-lg grid place-items-center shrink-0 border',
            complete
              ? 'bg-emerald-500/10 border-emerald-500/20'
              : 'bg-amber-500/10 border-amber-500/20',
          )}>
            {loading
              ? <Loader2 className="size-4 animate-spin text-text-tertiary" />
              : complete
                ? <Check className="size-4 text-emerald-300" />
                : <AlertTriangle className="size-4 text-amber-300" />}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-medium">
              {loading ? 'Comprobando…' : complete ? 'Kit completo' : 'Kit incompleto'}
            </h3>
            <p className="text-xs text-text-tertiary mt-0.5">
              {loading
                ? 'Consultando el estado de tu kit de recuperación.'
                : complete
                  ? `Si recuperas la cuenta con tu frase, tus ${status!.vaultsTotal > 1 ? `${status!.vaultsTotal} bóvedas` : 'archivos'} y compartidos se conservan.`
                  : 'Con tu frase recuperarías el acceso, pero no los archivos. Re-introduce tu frase (o genera una nueva) para completarlo.'}
            </p>
          </div>
          {!loading && mode === 'idle' && (
            <div className="flex gap-2 shrink-0">
              {!complete && (
                <Button size="sm" variant="primary" onClick={() => setMode('enter')}>
                  Ya tengo mi frase
                </Button>
              )}
              <Button
                size="sm"
                variant={complete ? 'outline' : 'ghost'}
                leftIcon={<RefreshCw className="size-3.5" />}
                onClick={() => {
                  setNewMnemonic(generateRecoveryMnemonic());
                  setSavedConfirmed(false);
                  setMode('generate');
                }}
              >
                {complete ? 'Regenerar frase' : 'Frase nueva'}
              </Button>
            </div>
          )}
        </div>

        {mode === 'enter' && (
          <form onSubmit={handleEnterSubmit} className="space-y-3 pt-3 border-t border-border-faint">
            <p className="text-xs text-text-secondary">
              Introduce tu frase de recuperación de 12 palabras. Se verifica localmente:
              nunca sale de tu navegador.
            </p>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {words.map((w, i) => (
                <div key={i} className="relative">
                  <span className="absolute left-2 top-2 text-[10px] font-mono text-text-tertiary">{i + 1}</span>
                  <input
                    type="text"
                    value={w}
                    onChange={(e) => {
                      const next = [...words];
                      next[i] = e.target.value.trim().toLowerCase();
                      setWords(next);
                    }}
                    onPaste={(e) => {
                      const text = e.clipboardData.getData('text').trim();
                      const parts = text.split(/[\s,]+/).filter(Boolean);
                      if (parts.length > 1) {
                        e.preventDefault();
                        const next = [...words];
                        for (let j = 0; j < 12; j++) next[j] = (parts[j] ?? '').toLowerCase();
                        setWords(next);
                      }
                    }}
                    className="w-full h-9 pl-6 pr-2 text-xs font-mono bg-bg-surface-2 border border-border-subtle rounded-md focus:outline-none focus:border-violet-500/60 text-text-primary"
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck={false}
                  />
                </div>
              ))}
            </div>
            <div className="flex gap-2 justify-end">
              <Button type="button" size="sm" variant="ghost" onClick={() => { setMode('idle'); setWords(Array(12).fill('')); }}>
                Cancelar
              </Button>
              <Button type="submit" size="sm" variant="primary" loading={working} disabled={words.some((w) => !w)}>
                Verificar y activar
              </Button>
            </div>
          </form>
        )}

        {mode === 'generate' && (
          <div className="space-y-3 pt-3 border-t border-border-faint">
            <div className="flex gap-2 p-3 rounded-lg bg-amber-500/5 border border-amber-500/20">
              <AlertTriangle className="size-4 text-amber-300 mt-0.5 shrink-0" />
              <p className="text-xs text-text-secondary leading-relaxed">
                Esta frase <strong className="text-amber-200">sustituye a la anterior</strong>, que
                dejará de funcionar. Guárdala en un lugar seguro: es tu única vía si olvidas la contraseña.
              </p>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {newMnemonic.map((word, i) => (
                <div key={i} className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-bg-surface-2 border border-border-faint">
                  <span className="text-[10px] font-mono text-text-secondary w-4 text-right">{i + 1}</span>
                  <span className="text-sm font-mono text-violet-200">{word}</span>
                </div>
              ))}
            </div>
            <Button
              size="sm"
              variant="secondary"
              className="w-full"
              leftIcon={copied ? <Check className="size-4" /> : <Copy className="size-4" />}
              onClick={() => {
                navigator.clipboard.writeText(newMnemonic.join(' '));
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
                setTimeout(() => { navigator.clipboard.writeText('').catch(() => {}); }, 60_000);
                toast.success('Copiada al portapapeles (se borrará en 60s)');
              }}
            >
              {copied ? 'Copiada' : 'Copiar frase'}
            </Button>
            <label className="flex items-start gap-2 text-xs cursor-pointer p-2 rounded-lg hover:bg-bg-surface-2 transition-colors">
              <input
                type="checkbox"
                checked={savedConfirmed}
                onChange={(e) => setSavedConfirmed(e.target.checked)}
                className="mt-0.5 size-3.5 accent-violet-500"
              />
              <span className="text-text-secondary">
                He guardado la frase nueva en un lugar seguro y entiendo que la anterior dejará de funcionar.
              </span>
            </label>
            <div className="flex gap-2 justify-end">
              <Button size="sm" variant="ghost" onClick={() => { setMode('idle'); setNewMnemonic([]); setSavedConfirmed(false); }}>
                Cancelar
              </Button>
              <Button size="sm" variant="primary" loading={working} disabled={!savedConfirmed} onClick={handleGenerateConfirm}>
                Activar frase nueva
              </Button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

// ─── Plan y uso (billing) ────────────────────────────────────────
// Muestra el plan actual, el uso vs cuota y enlaza a /precios (mejorar) o al
// portal de Stripe (gestionar). Si el billing no está activo, solo informa del
// uso. El cobro va por cuota de bytes, nunca por contenido (ZK).

function PlanUsageSection() {
  const { storageUsed, storageQuota } = useVault();
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    fetchBillingStatus().then(setStatus).catch(() => {});
  }, []);

  const pct = storageQuota > 0 ? Math.min(100, Math.round((storageUsed / storageQuota) * 100)) : 0;
  const near = pct >= 90;
  const isPaid = !!status && status.plan !== 'free';

  async function manage() {
    setWorking(true);
    try {
      await openBillingPortal();
    } catch (err: any) {
      toast.error(err?.message ?? 'No se pudo abrir el portal');
      setWorking(false);
    }
  }

  return (
    <section className="mb-8">
      <div className="flex items-center gap-2 mb-4">
        <Gauge className="size-4 text-violet-300" />
        <h2 className="text-sm font-semibold uppercase tracking-wider text-text-secondary">
          Plan y uso
        </h2>
      </div>

      <div className="p-4 rounded-xl border border-border-faint bg-bg-surface space-y-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h3 className="text-sm font-medium">
              Plan {status?.planLabel ?? '—'}
              {isPaid && status?.subscriptionStatus && status.subscriptionStatus !== 'active' && (
                <span className="ml-2 text-[10px] font-mono uppercase text-amber-300">{status.subscriptionStatus}</span>
              )}
            </h3>
            <p className="text-xs text-text-tertiary mt-0.5">
              {formatBytes(storageUsed)} de {formatBytes(storageQuota)} usados
            </p>
          </div>
          <div className="flex gap-2">
            {status?.billingEnabled && (
              <Link href={'/precios' as any}>
                <Button size="sm" variant={isPaid ? 'ghost' : 'primary'}>
                  {isPaid ? 'Cambiar plan' : 'Mejorar plan'}
                </Button>
              </Link>
            )}
            {isPaid && status?.hasCustomer && (
              <Button size="sm" variant="outline" loading={working} leftIcon={<CreditCard className="size-3.5" />} onClick={manage}>
                Gestionar
              </Button>
            )}
          </div>
        </div>

        {/* Barra de uso */}
        <div>
          <div className="h-2 rounded-full bg-bg-surface-2 overflow-hidden">
            <div
              className={cn('h-full rounded-full transition-all', near ? 'bg-amber-500' : 'bg-violet-500')}
              style={{ width: `${pct}%` }}
            />
          </div>
          {near && (
            <p className="text-xs text-amber-300 mt-2">
              Estás cerca del límite de tu plan. {status?.billingEnabled ? 'Amplía espacio cuando lo necesites.' : ''}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

// ─── Cambiar contraseña maestra ──────────────────────────────────
// Re-cifra (re-envuelve) todas las claves con una MK nueva. Zero-knowledge: el
// cliente ya tiene las vault keys en memoria, solo cambia el envoltorio. La
// contraseña actual se exige para probar identidad (firma del challenge).

function ChangePasswordSection() {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [working, setWorking] = useState(false);

  function reset() {
    setCurrent(''); setNext(''); setConfirm('');
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (next.length < 8) { toast.error('La nueva contraseña debe tener al menos 8 caracteres'); return; }
    if (next !== confirm) { toast.error('Las contraseñas nuevas no coinciden'); return; }
    if (next === current) { toast.error('La nueva contraseña debe ser distinta de la actual'); return; }
    setWorking(true);
    try {
      await changeMasterPassword(current, next);
      toast.success('Contraseña maestra cambiada. Las sesiones en otros dispositivos se han cerrado.');
      reset();
      setOpen(false);
    } catch (err: any) {
      const msg = err?.message ?? '';
      toast.error(/incorrecta|invalid|401/i.test(msg)
        ? 'La contraseña actual es incorrecta'
        : (msg || 'No se pudo cambiar la contraseña'));
    } finally {
      setWorking(false);
    }
  }

  return (
    <section className="mb-8">
      <div className="flex items-center gap-2 mb-4">
        <Lock className="size-4 text-violet-300" />
        <h2 className="text-sm font-semibold uppercase tracking-wider text-text-secondary">
          Seguridad
        </h2>
      </div>

      <div className="flex items-center gap-4 p-4 rounded-xl border border-border-faint bg-bg-surface">
        <div className="size-10 rounded-lg bg-violet-500/10 border border-violet-500/20 grid place-items-center shrink-0">
          <Lock className="size-4 text-violet-300" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-medium">Cambiar contraseña maestra</h3>
          <p className="text-xs text-text-tertiary mt-0.5">
            Re-cifra todas tus claves con una contraseña nueva. Tus archivos no se vuelven a subir.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}>Cambiar</Button>
      </div>

      {open && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={() => !working && setOpen(false)}
        >
          <form
            onSubmit={submit}
            className="w-full max-w-sm rounded-2xl border border-border-subtle bg-bg-surface p-6 shadow-[0_20px_60px_-12px_rgba(0,0,0,0.7)] space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <h3 className="font-display text-lg font-medium">Cambiar contraseña maestra</h3>
              <p className="text-xs text-text-tertiary mt-1 leading-relaxed">
                Se re-cifran tus claves localmente. El servidor nunca ve ninguna de las dos contraseñas.
              </p>
            </div>
            <Input
              label="Contraseña actual"
              type="password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              leftIcon={<Lock className="size-4" />}
              required
              autoFocus
            />
            <Input
              label="Nueva contraseña"
              type="password"
              value={next}
              onChange={(e) => setNext(e.target.value.slice(0, 128))}
              leftIcon={<KeyRound className="size-4" />}
              required
            />
            <Input
              label="Repetir nueva contraseña"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value.slice(0, 128))}
              leftIcon={<KeyRound className="size-4" />}
              required
              error={confirm.length > 0 && next !== confirm ? 'No coincide' : undefined}
            />
            <div className="flex gap-2 justify-end pt-1">
              <Button type="button" variant="ghost" size="sm" disabled={working} onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" variant="primary" size="sm" loading={working}>
                {working ? 'Re-cifrando…' : 'Cambiar contraseña'}
              </Button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}

// ─── Notificaciones push (FCM) ───────────────────────────────────
// El permiso del navegador SOLO se pide aquí, con gesto explícito del
// usuario — nunca al cargar la app. El aviso que llega es genérico («te han
// compartido un archivo»): el nombre va cifrado y el servidor no lo conoce.

function PushNotificationsSection() {
  const [status, setStatus] = useState<PushStatus>('unsupported');
  const [chosen, setChosen] = useState(false);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    setStatus(getPushStatus());
    setChosen(isPushChosen());
  }, []);

  const active = chosen && status === 'granted';

  async function toggle() {
    setWorking(true);
    try {
      if (active) {
        await disablePush();
        setChosen(false);
        toast.success('Notificaciones desactivadas en este navegador');
      } else {
        const result = await enablePush();
        setStatus(result);
        if (result === 'granted') {
          setChosen(true);
          toast.success('Notificaciones activadas');
        } else if (result === 'denied') {
          toast.error('El navegador tiene las notificaciones bloqueadas para este sitio');
        }
      }
    } catch (err: any) {
      toast.error(err.message ?? 'No se pudo cambiar las notificaciones');
    } finally {
      setWorking(false);
    }
  }

  return (
    <section className="mb-8">
      <div className="flex items-center gap-2 mb-4">
        <Bell className="size-4 text-violet-300" />
        <h2 className="text-sm font-semibold uppercase tracking-wider text-text-secondary">
          Notificaciones
        </h2>
      </div>

      <div className="flex items-center gap-4 p-4 rounded-xl border border-border-faint bg-bg-surface">
        <div className="size-10 rounded-lg bg-violet-500/10 border border-violet-500/20 grid place-items-center shrink-0">
          {active ? <Bell className="size-4 text-violet-300" /> : <BellOff className="size-4 text-text-tertiary" />}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-medium">Avisos cuando te comparten archivos</h3>
          <p className="text-xs text-text-tertiary mt-0.5">
            {status === 'unsupported'
              ? 'Este navegador no soporta notificaciones push.'
              : status === 'denied'
                ? 'Bloqueadas en el navegador — actívalas desde el icono del candado de la barra de direcciones.'
                : active
                  ? 'Recibirás un aviso aunque la pestaña esté cerrada. El contenido del aviso es genérico: los nombres de tus archivos siguen cifrados.'
                  : 'Activa los avisos en este navegador. Solo se notifica el evento — nunca el contenido, que va cifrado.'}
          </p>
        </div>
        {status !== 'unsupported' && status !== 'denied' && (
          <Button
            size="sm"
            variant={active ? 'outline' : 'primary'}
            loading={working}
            onClick={toggle}
          >
            {active ? 'Desactivar' : 'Activar'}
          </Button>
        )}
      </div>
    </section>
  );
}

// ─── Passkeys (WebAuthn) Section ─────────────────────────────────

interface PasskeyView {
  id: string;
  nickname: string | null;
  device_type: string | null;
  last_used_at: string | null;
  created_at: string;
}

function PasskeysSection() {
  const [passkeys, setPasskeys] = useState<PasskeyView[]>([]);
  const [loading, setLoading] = useState(true);
  const [registering, setRegistering] = useState(false);

  const fetchPasskeys = useCallback(async () => {
    try {
      const r = await apiFetch<{ passkeys: PasskeyView[] }>('/api/v1/2fa/webauthn');
      setPasskeys(r.passkeys ?? []);
    } catch {
      /* sin passkeys todavía */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchPasskeys(); }, [fetchPasskeys]);

  async function handleRegister() {
    if (typeof window !== 'undefined' && !window.PublicKeyCredential) {
      toast.error('Este navegador no soporta passkeys');
      return;
    }
    setRegistering(true);
    try {
      const options = await apiFetch('/api/v1/2fa/webauthn/register/begin', { method: 'POST' });
      const { startRegistration } = await import('@simplewebauthn/browser');

      let attResp;
      try {
        attResp = await startRegistration({ optionsJSON: options as any });
      } catch (err: any) {
        if (err?.name === 'NotAllowedError' || err?.name === 'AbortError') {
          toast.info('Registro de passkey cancelado');
          return;
        }
        if (err?.name === 'InvalidStateError') {
          toast.info('Esta passkey ya está registrada');
          return;
        }
        throw err;
      }

      const nickname =
        (typeof navigator !== 'undefined' && (navigator as any).platform) || 'Passkey';

      await apiFetch('/api/v1/2fa/webauthn/register/finish', {
        method: 'POST',
        body: JSON.stringify({ response: attResp, nickname }),
      });
      toast.success('Passkey registrada');
      fetchPasskeys();
    } catch {
      toast.error('No se pudo registrar la passkey');
    } finally {
      setRegistering(false);
    }
  }

  async function handleRevoke(id: string) {
    try {
      await apiFetch(`/api/v1/2fa/webauthn/${id}`, { method: 'DELETE' });
      toast.success('Passkey revocada');
      setPasskeys((p) => p.filter((k) => k.id !== id));
    } catch {
      toast.error('No se pudo revocar la passkey');
    }
  }

  return (
    <section className="mb-8">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Fingerprint className="size-4 text-violet-300" />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-text-secondary">
            Passkeys (WebAuthn)
          </h2>
        </div>
        <Button size="sm" loading={registering} onClick={handleRegister}>
          <Plus className="size-4" />
          Añadir passkey
        </Button>
      </div>

      <p className="text-xs text-text-tertiary mb-4">
        Usa tu huella, Face ID o una llave de seguridad física como segundo factor.
        La clave privada nunca sale de tu dispositivo.
      </p>

      <div className="space-y-1">
        {loading ? (
          <div className="flex items-center gap-2 p-4 text-sm text-text-tertiary">
            <Loader2 className="size-4 animate-spin" />
            Cargando passkeys…
          </div>
        ) : passkeys.length === 0 ? (
          <div className="p-4 rounded-xl border border-dashed border-border-faint text-sm text-text-tertiary">
            No tienes ninguna passkey registrada todavía.
          </div>
        ) : (
          passkeys.map((pk) => (
            <div
              key={pk.id}
              className="flex items-center gap-4 p-4 rounded-xl border border-border-faint bg-bg-surface"
            >
              <div className="size-10 rounded-lg bg-violet-500/10 border border-violet-500/20 grid place-items-center shrink-0">
                <KeyRound className="size-4 text-violet-300" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-medium truncate">{pk.nickname || 'Passkey'}</h3>
                <p className="text-xs text-text-tertiary mt-0.5">
                  {pk.device_type === 'multiDevice' ? 'Sincronizada' : 'Este dispositivo'}
                  {' · '}
                  {pk.last_used_at ? `usada ${timeAgo(pk.last_used_at)}` : 'sin usar'}
                </p>
              </div>
              <button
                onClick={() => handleRevoke(pk.id)}
                className="p-2 rounded-lg text-text-tertiary hover:text-red-400 hover:bg-red-500/10 transition-colors"
                title="Revocar passkey"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

// ─── Noctcom Connector (agente local) ────────────────────────────

interface ApiAgent {
  id: string;
  nameEncrypted: string;
  nameNonce: string;
  platform: string | null;
  online: boolean;
  lastSeenAt: string | null;
  createdAt: string;
}

interface AgentView {
  id: string;
  name: string;
  platform: string | null;
  online: boolean;
}

interface AgentDisk {
  id: string;
  device: string;
  path: string;
  label: string;
  totalBytes: number;
  freeBytes: number;
  usedBytes: number;
  filesystem: string;
  removable: boolean;
  mounted: boolean;
  needsFormat: boolean;
  active: boolean;
}

// Tarjeta detallada de un disco servido por un agente (uso, total/usado/libre, fs).
// M2: permite "Usar este disco" (no destructivo) → registra un volumen en él.
function AgentDiskCard({ disk, agentId, onChanged }: {
  disk: AgentDisk;
  agentId: string;
  onChanged: () => void;
}) {
  const usedPct = disk.totalBytes > 0 ? Math.min(100, (disk.usedBytes / disk.totalBytes) * 100) : 0;
  const [busy, setBusy] = useState(false);
  const [formatOpen, setFormatOpen] = useState(false);
  // Nunca ofrecemos formatear el disco de sistema (C:); el backend también lo rechaza.
  const isSystemDrive = /^c[:\\]?/i.test(disk.device || disk.path || '');

  async function handleUse() {
    setBusy(true);
    try {
      await apiFetch('/api/v1/storage/disks/use', {
        method: 'POST',
        body: JSON.stringify({
          agentId,
          path: disk.path,
          label: disk.label || disk.device || disk.path,
          totalBytes: disk.totalBytes,
        }),
      });
      toast.success(`Disco "${disk.label || disk.device}" listo para almacenar`);
      onChanged();
      // Refresca el "Almacenamiento": ahora suma la capacidad del disco.
      void useVault.getState().refreshStorage();
    } catch (err: any) {
      toast.error(err.message ?? 'No se pudo preparar el disco');
    } finally {
      setBusy(false);
    }
  }

  async function handleUnuse() {
    setBusy(true);
    try {
      await apiFetch('/api/v1/storage/disks/unuse', {
        method: 'POST',
        body: JSON.stringify({ agentId, path: disk.path }),
      });
      toast.success('Disco dado de baja (tus datos siguen intactos)');
      onChanged();
      void useVault.getState().refreshStorage();
    } catch (err: any) {
      toast.error(err.message ?? 'No se pudo dar de baja el disco');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={cn(
      'flex items-center gap-4 p-4 rounded-xl border bg-bg-surface',
      disk.active ? 'border-emerald-500/30' : 'border-border-faint',
    )}>
      <div className="size-10 rounded-lg grid place-items-center shrink-0 bg-bg-surface-2 border border-border-faint">
        {disk.removable
          ? <Usb className="size-4 text-text-tertiary" />
          : <HardDrive className="size-4 text-text-tertiary" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium truncate">{disk.label || disk.device}</h3>
          <span className="text-[10px] font-mono text-text-tertiary shrink-0">{disk.device}</span>
          {disk.removable && (
            <span className="text-[10px] font-mono uppercase tracking-wider text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded">
              USB
            </span>
          )}
          {disk.active && (
            <span className="text-[10px] font-mono uppercase tracking-wider text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded flex items-center gap-1">
              <Check className="size-3" /> En uso
            </span>
          )}
        </div>
        <div className="mt-2 p-2 rounded-lg bg-bg-surface-2 border border-border-faint">
          <div className="flex items-center gap-2 mb-1.5">
            <div className="flex-1 h-1.5 bg-bg-surface-3 rounded-full overflow-hidden">
              <div className="h-full bg-blue-500 rounded-full" style={{ width: `${usedPct}%` }} />
            </div>
            <span className="text-[10px] text-text-muted font-mono shrink-0">{usedPct.toFixed(0)}%</span>
          </div>
          <div className="grid grid-cols-3 gap-1 text-center">
            <div>
              <p className="text-[10px] text-text-muted uppercase">Total</p>
              <p className="text-xs font-mono font-medium">{fmtSize(disk.totalBytes)}</p>
            </div>
            <div>
              <p className="text-[10px] text-text-muted uppercase">Usado</p>
              <p className="text-xs font-mono font-medium text-amber-400">{fmtSize(disk.usedBytes)}</p>
            </div>
            <div>
              <p className="text-[10px] text-text-muted uppercase">Libre</p>
              <p className="text-xs font-mono font-medium text-emerald-400">{fmtSize(disk.freeBytes)}</p>
            </div>
          </div>
          <div className="flex items-center justify-center gap-2 mt-1.5 pt-1.5 border-t border-border-faint">
            <span className={cn('text-[10px] font-mono uppercase', disk.needsFormat ? 'text-amber-400' : 'text-text-muted')}>
              {disk.filesystem || 'sin formato'}
            </span>
            {disk.needsFormat && <span className="text-[10px] text-amber-400 font-medium">(incompatible)</span>}
            {!disk.removable && <span className="text-[10px] text-text-muted">· Interno</span>}
          </div>
        </div>
      </div>
      <div className="shrink-0 flex items-center gap-1.5">
        {/* Formatear está disponible esté el disco en uso o no (nunca para C:).
            El backend impide formatear si el disco ya guarda archivos. */}
        {!isSystemDrive && (
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => setFormatOpen(true)}
            className="text-red-400 hover:text-red-300"
            title="Formatear el disco (borra todo su contenido)"
          >
            <Eraser className="size-3.5 mr-1" /> Formatear
          </Button>
        )}
        {disk.active ? (
          <Button variant="ghost" size="sm" loading={busy} onClick={handleUnuse}>
            <Power className="size-3.5 mr-1" /> Dejar de usar
          </Button>
        ) : (
          <Button variant="secondary" size="sm" loading={busy} onClick={handleUse}>
            <FolderPlus className="size-3.5 mr-1" /> Usar este disco
          </Button>
        )}
      </div>

      <AgentFormatModal
        open={formatOpen}
        onClose={() => setFormatOpen(false)}
        agentId={agentId}
        disk={disk}
        onFormatted={onChanged}
      />
    </div>
  );
}

function ConnectorAgentsSection() {
  const { masterKey } = useAuth();
  const [agents, setAgents] = useState<AgentView[]>([]);
  const [loading, setLoading] = useState(true);
  const [pairing, setPairing] = useState(false);
  const [pairCode, setPairCode] = useState<string | null>(null);
  const [os, setOs] = useState<'windows' | 'macos' | 'linux' | 'other'>('other');

  useEffect(() => {
    const ua = navigator.userAgent.toLowerCase();
    setOs(
      ua.includes('win') ? 'windows'
        : ua.includes('mac') ? 'macos'
        : (ua.includes('linux') || ua.includes('x11')) ? 'linux'
        : 'other',
    );
  }, []);

  const fetchAgents = useCallback(async () => {
    if (!masterKey) return;
    try {
      const raw = await apiFetch<ApiAgent[]>('/api/v1/agent');
      setAgents(
        raw.map((a) => {
          let name = 'Agente';
          try {
            name = decryptString(fromB64(a.nameEncrypted), fromB64(a.nameNonce), masterKey);
          } catch { /* nombre no descifrable */ }
          return { id: a.id, name, platform: a.platform, online: a.online };
        }),
      );
    } catch { /* sin agentes todavía */ }
    setLoading(false);
  }, [masterKey]);

  useEffect(() => { fetchAgents(); }, [fetchAgents]);

  async function handlePair() {
    if (!masterKey) return;
    const name = window.prompt('Nombre para este agente (p. ej. "PC del salón"):', 'Mi equipo');
    if (!name?.trim()) return;
    setPairing(true);
    try {
      const enc = encryptString(name.trim().slice(0, 64), masterKey);
      const r = await apiFetch<{ code: string }>('/api/v1/agent/pair/begin', {
        method: 'POST',
        body: JSON.stringify({ nameEncrypted: toB64(enc.ciphertext), nameNonce: toB64(enc.nonce) }),
      });
      setPairCode(r.code);
    } catch (err: any) {
      toast.error(err.message ?? 'No se pudo generar el código de emparejamiento');
    } finally {
      setPairing(false);
    }
  }

  async function handleRevoke(id: string) {
    try {
      await apiFetch(`/api/v1/agent/${id}`, { method: 'DELETE' });
      toast.success('Agente desvinculado');
      setAgents((a) => a.filter((x) => x.id !== id));
    } catch {
      toast.error('No se pudo desvincular el agente');
    }
  }

  return (
    <section className="mb-8">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Server className="size-4 text-emerald-300" />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-text-secondary">
            Noctcom Connector
          </h2>
        </div>
        <Button size="sm" loading={pairing} onClick={handlePair}>
          <Plus className="size-4" />
          Vincular agente
        </Button>
      </div>

      <p className="text-xs text-text-tertiary mb-4">
        Instala el agente en tu equipo para gestionar sus discos desde aquí. Abre una
        conexión saliente cifrada (sin puertos abiertos) y tus claves nunca salen de tu máquina.
      </p>

      {/* Paso 1: descargar el binario */}
      <div className="mb-4 p-4 rounded-xl border border-border-faint bg-bg-surface">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <h3 className="text-sm font-medium">1 · Descarga e instala el agente</h3>
            <p className="text-xs text-text-tertiary mt-0.5">
              {os === 'windows'
                ? 'Detectamos Windows. Descarga el ejecutable y ábrelo.'
                : os === 'macos' || os === 'linux'
                  ? `Detectamos ${os === 'macos' ? 'macOS' : 'Linux'}: su binario llega pronto. De momento hay versión de Windows.`
                  : 'Descarga el agente para tu sistema.'}
            </p>
          </div>
          <a
            href={`${process.env.NEXT_PUBLIC_API_URL ?? ''}/api/v1/agent/download?platform=windows`}
            className="inline-flex items-center gap-2 h-9 px-4 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium transition-colors shrink-0"
          >
            <Download className="size-4" />
            Descargar para Windows
          </a>
        </div>
        {(os === 'macos' || os === 'linux') && (
          <p className="text-[10px] text-text-muted mt-2">
            Builds para macOS y Linux: próximamente.
          </p>
        )}
      </div>

      {pairCode && (
        <div className="mb-4 p-4 rounded-xl border border-emerald-500/30 bg-emerald-500/5">
          <p className="text-xs text-text-secondary">
            2 · Abre una terminal <strong>en la carpeta donde se descargó</strong> (normalmente
            Descargas) y ejecuta:
          </p>
          <div className="flex items-center gap-2 mt-2">
            <code className="flex-1 text-xs font-mono bg-bg-surface-2 px-3 py-2 rounded-lg break-all">
              .\noctcom-connector.exe pair --code {pairCode}
            </code>
            <button
              onClick={() => {
                navigator.clipboard?.writeText(`.\\noctcom-connector.exe pair --code ${pairCode}`);
                toast.success('Comando copiado');
              }}
              className="p-2 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-bg-surface-2 transition-colors"
              title="Copiar"
            >
              <Copy className="size-4" />
            </button>
          </div>
          <p className="text-[10px] text-text-muted mt-2">
            Luego déjalo conectado con{' '}
            <span className="font-mono text-text-tertiary">.\noctcom-connector.exe run</span>.
            El código caduca en 10 minutos y es de un solo uso.
            <br />
            <span className="text-text-tertiary">
              Truco: en el Explorador, entra en la carpeta de descargas, escribe <span className="font-mono">cmd</span> en
              la barra de direcciones y pulsa Enter para abrir la terminal ahí.
            </span>
          </p>
          <div className="mt-3">
            <Button size="sm" variant="outline" onClick={() => { setPairCode(null); fetchAgents(); }}>
              Ya lo he vinculado
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-1">
        {loading ? (
          <div className="flex items-center gap-2 p-4 text-sm text-text-tertiary">
            <Loader2 className="size-4 animate-spin" />
            Cargando agentes…
          </div>
        ) : agents.length === 0 ? (
          <p className="text-xs text-text-muted px-1">
            No tienes ningún agente vinculado todavía.
          </p>
        ) : (
          agents.map((a) => (
            <div
              key={a.id}
              className="rounded-xl border border-border-faint bg-bg-surface overflow-hidden"
            >
              <div className="flex items-center gap-4 p-4">
                <div className="size-10 rounded-lg bg-emerald-500/10 border border-emerald-500/20 grid place-items-center shrink-0">
                  <Server className="size-4 text-emerald-300" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-medium truncate">{a.name}</h3>
                  <p className="text-xs text-text-tertiary mt-0.5">
                    {a.platform ?? 'desconocido'} ·{' '}
                    {a.online ? (
                      <span className="text-emerald-400">en línea</span>
                    ) : (
                      <span>desconectado</span>
                    )}
                  </p>
                </div>
                <button
                  onClick={() => handleRevoke(a.id)}
                  className="p-2 rounded-lg text-text-tertiary hover:text-red-400 hover:bg-red-500/10 transition-colors"
                  title="Desvincular agente"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
