'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import {
  Shield, KeyRound, Monitor, Lock, HardDrive,
  AlertTriangle, Fingerprint, Smartphone, Usb, Plus, Power, Trash2, Disc,
  Download, Upload, Loader2, Mail, Server, Copy, Check, FolderPlus, Eraser,
  FileKey2, RefreshCw, Bell, BellOff, Gauge, CreditCard,
} from 'lucide-react';
import { FormatDiskModal } from '@/components/vault/FormatDiskModal';
import { AgentFormatModal } from '@/components/vault/AgentFormatModal';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useAuth } from '@/lib/auth-store';
import { useVault } from '@/lib/vault-store';
import { apiFetch } from '@/lib/api';
import { copyText, clearClipboard } from '@/lib/clipboard';
import { getStepUpToken } from '@/lib/step-up';
import { fromB64, decryptString, encryptString, toB64, initCrypto, wipe } from '@/lib/crypto';
import {
  generateRecoveryMnemonic, deriveRecoverySeed,
  deriveRecoverySignKeypair, deriveRecoveryBoxKeypair, sealToRecovery,
} from '@/lib/recovery';
import { getPushStatus, isPushChosen, enablePush, disablePush, type PushStatus } from '@/lib/firebase';
import { changeMasterPassword } from '@/lib/change-password';
import { fetchBillingStatus, openBillingPortal, fetchPlans, startCheckout, startUnlockCheckout, formatBytes, type BillingStatus, type PublicPlan } from '@/lib/billing';
import { cn } from '@/lib/utils';
import { useRouter } from '@/i18n/navigation';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

function parseDeviceName(raw: string, t: (key: string) => string): { browser: string; os: string } {
  let browser = t('devices.browserFallback');
  if (raw.includes('Firefox/')) browser = `Firefox ${raw.split('Firefox/')[1]?.split(' ')[0] ?? ''}`;
  else if (raw.includes('Edg/')) browser = `Edge ${raw.split('Edg/')[1]?.split(' ')[0] ?? ''}`;
  else if (raw.includes('Chrome/')) browser = `Chrome ${raw.split('Chrome/')[1]?.split(' ')[0] ?? ''}`;
  else if (raw.includes('Safari/') && !raw.includes('Chrome')) browser = 'Safari';

  let os = t('devices.osUnknown');
  if (raw.includes('Windows NT 10')) os = 'Windows 10/11';
  else if (raw.includes('Windows')) os = 'Windows';
  else if (raw.includes('Mac OS X')) os = 'macOS';
  else if (raw.includes('Linux')) os = 'Linux';
  else if (raw.includes('Android')) os = 'Android';
  else if (raw.includes('iPhone') || raw.includes('iPad')) os = 'iOS';

  return { browser, os };
}

function timeAgo(iso: string | null, t: (key: string, values?: Record<string, any>) => string): string {
  if (!iso) return t('timeAgo.never');
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return t('timeAgo.justNow');
  if (mins < 60) return t('timeAgo.minutes', { count: mins });
  const hours = Math.floor(mins / 60);
  if (hours < 24) return t('timeAgo.hours', { count: hours });
  const days = Math.floor(hours / 24);
  return t('timeAgo.days', { count: days });
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
  const t = useTranslations('settings');
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
        let browser = t('devices.deviceFallback');
        let os = '';
        try {
          const name = decryptString(fromB64(d.nameEncrypted), fromB64(d.nameNonce), masterKey);
          const info = parseDeviceName(name, t);
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
        let name = t('connector.agentFallback');
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
      toast.error(`${t('danger.deleteError')}: ${err.message}`);
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
        <h1 className="font-display text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-sm text-text-tertiary mt-1">
          {t('subtitle')}
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
              {t('devices.title')}
            </h2>
          </div>
          {devices.filter((d) => !d.isCurrent).length > 0 && (
            <Button variant="danger" size="sm" onClick={async () => {
              try {
                await apiFetch('/api/v1/auth/devices', { method: 'DELETE' });
                toast.success(t('devices.allRevoked'));
                fetchDevices();
              } catch { toast.error(t('devices.revokeSessionsError')); }
            }}>
              {t('devices.closeOthers')}
            </Button>
          )}
        </div>
        <div className="space-y-1">
          {loadingDevices && (
            <p className="text-xs text-text-muted px-1 animate-pulse">
              {t('devices.loading')}
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
                        {t('devices.activeBadge')}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-text-tertiary mt-0.5">
                    {device.os}
                  </p>
                  <span className="text-[10px] text-text-muted font-mono uppercase tracking-wider">
                    {device.isCurrent ? t('devices.currentSession') : timeAgo(device.lastSeenAt, t)}
                  </span>
                </div>
                {!device.isCurrent && (
                  <Button variant="ghost" size="sm" onClick={async () => {
                    try {
                      await apiFetch(`/api/v1/auth/devices/${device.id}`, { method: 'DELETE' });
                      toast.success(t('devices.revoked', { name: device.browser }));
                      fetchDevices();
                    } catch { toast.error(t('devices.revokeError')); }
                  }}>
                    {t('devices.revoke')}
                  </Button>
                )}
              </div>
            );
          })}

          {!loadingDevices && devices.length <= 1 && (
            <p className="text-xs text-text-muted mt-2 px-1">
              {t('devices.noOthers')}
            </p>
          )}
        </div>
      </section>

      {/* Storage — se poblará desde GET /api/v1/auth/me */}
      <section className="mb-8">
        <div className="flex items-center gap-2 mb-4">
          <HardDrive className="size-4 text-amber-300" />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-text-secondary">
            {t('storage.title')}
          </h2>
        </div>
        <div className="p-5 rounded-xl border border-border-faint bg-bg-surface">
          <div className="flex items-end justify-between mb-3">
            <div>
              <span className="text-2xl font-mono font-medium">{fmtSize(storageUsed)}</span>
              <span className="text-sm text-text-tertiary ml-1">{t('storage.of', { total: fmtSize(storageQuota) })}</span>
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
              ? t('storage.emptyBreakdown')
              : t('storage.usedPct', { pct: ((storageUsed / storageQuota) * 100).toFixed(1) })}
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
            {t('disks.title')}
          </h2>
        </div>

        {/* Discos servidos por el agente (cloud): los reales de tu máquina */}
        {onlineAgents.map((a) => (
          <div key={a.id} className="mb-4">
            <p className="text-xs text-text-secondary mb-2 px-1 flex items-center gap-1.5">
              <Server className="size-3.5 text-emerald-300" />
              {t.rich('disks.diskOf', {
                name: a.name,
                strong: (chunks) => <strong className="font-medium">{chunks}</strong>,
              })}
            </p>
            {(agentDisks[a.id] ?? []).length === 0 ? (
              <p className="text-xs text-text-muted px-1">{t('disks.agentNoDisks')}</p>
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
            {t.rich('disks.useDiskHint', {
              folder: () => <span className="font-mono">noctcom-blobs</span>,
            })}
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
                        {t('disks.activeBadge')}
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
                          <p className="text-[10px] text-text-muted uppercase">{t('disks.total')}</p>
                          <p className="text-xs font-mono font-medium">{fmtSize(vol.totalBytes)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-text-muted uppercase">{t('disks.used')}</p>
                          <p className="text-xs font-mono font-medium text-amber-400">{fmtSize(vol.usedBytes)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-text-muted uppercase">{t('disks.free')}</p>
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
                      toast.success(vol.active ? t('disks.volumeDeactivated') : t('disks.volumeActivated'));
                      fetchVolumes();
                      fetchDisks();
                    } catch { toast.error(t('disks.volumeUpdateError')); }
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
                        toast.success(t('disks.volumeDeleted'));
                        fetchVolumes();
                        fetchDisks();
                      } catch (e: any) { toast.error(e.message ?? t('disks.deleteError')); }
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
            <p className="text-xs text-text-muted mb-2 px-1">{t('disks.detected')}</p>
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
                          <p className="text-[10px] text-text-muted uppercase">{t('disks.total')}</p>
                          <p className="text-xs font-mono font-medium">{fmtSize(disk.totalBytes)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-text-muted uppercase">{t('disks.used')}</p>
                          <p className="text-xs font-mono font-medium text-amber-400">{fmtSize(disk.totalBytes - disk.freeBytes)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-text-muted uppercase">{t('disks.free')}</p>
                          <p className="text-xs font-mono font-medium text-emerald-400">{fmtSize(disk.freeBytes)}</p>
                        </div>
                      </div>
                      <div className="flex items-center justify-center gap-2 mt-1.5 pt-1.5 border-t border-border-faint">
                        <span className={cn('text-[10px] font-mono uppercase', disk.needsFormat ? 'text-amber-400' : 'text-text-muted')}>
                          {disk.filesystem || t('disks.noFilesystem')}
                        </span>
                        {disk.needsFormat && <span className="text-[10px] text-amber-400 font-medium">{t('disks.incompatible')}</span>}
                        {!disk.removable && <span className="text-[10px] text-text-muted">{t('disks.internalSuffix')}</span>}
                      </div>
                    </div>
                  </div>
                  {disk.needsFormat ? (
                    <Button variant="danger" size="sm" onClick={() => {
                      setFormatDisk(disk);
                      setFormatOpen(true);
                    }}>
                      <Disc className="size-3.5 mr-1" /> {t('disks.format')}
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
                        toast.success(t('disks.mountedAdded', { label: disk.label }));
                        fetchVolumes();
                        fetchDisks();
                      } catch (e: any) { toast.error(e.message ?? t('disks.mountError')); }
                    }}>
                      <Plus className="size-3.5 mr-1" /> {t('disks.mount')}
                    </Button>
                  ) : (
                    <Button variant="outline" size="sm" onClick={async () => {
                      try {
                        await apiFetch('/api/v1/storage/volumes', {
                          method: 'POST',
                          body: JSON.stringify({ path: disk.path, label: disk.label }),
                        });
                        toast.success(t('disks.addedAsVolume', { label: disk.label }));
                        fetchVolumes();
                        fetchDisks();
                      } catch (e: any) { toast.error(e.message ?? t('disks.addError')); }
                    }}>
                      <Plus className="size-3.5 mr-1" /> {t('disks.add')}
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
              {t('disks.noServerDisks')}
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
            {t('danger.title')}
          </h2>
        </div>
        <div className="p-5 rounded-xl border border-red-500/20 bg-red-500/5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-medium text-red-300">{t('danger.deleteAccount')}</h3>
              <p className="text-xs text-text-tertiary mt-0.5">
                {t('danger.deleteDesc')}
              </p>
            </div>
            <Button
              variant="danger"
              size="sm"
              loading={deleting}
              onClick={() => setConfirmDelete(true)}
            >
              {t('danger.delete')}
            </Button>
          </div>
        </div>
      </section>

      <ConfirmDialog
        open={confirmDelete}
        danger
        title={t('danger.confirmTitle')}
        message={t('danger.confirmMessage')}
        confirmLabel={t('danger.confirmLabel')}
        cancelLabel={t('danger.cancel')}
        onConfirm={handleDeleteAccount}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}

// ─── Export / Import Section ─────────────────────────────────────

function ExportImportSection() {
  const t = useTranslations('settings');
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
      toast.success(t('exportImport.exported'));
    } catch (err: any) {
      toast.error(`${t('exportImport.exportError')}: ${err.message}`);
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
        toast.error(t('exportImport.wrongPassword'));
      } else {
        toast.error(`${t('exportImport.errorPrefix')}: ${err.message}`);
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
      toast.success(t('exportImport.imported'));
      setImportFile(null);
      setImportPassword('');
      setPasswordValidated(false);
      setVaultName(null);
      setVaultKeyRef(null);
      useVault.getState().init();
    } catch (err: any) {
      toast.error(`${t('exportImport.importError')}: ${err.message}`);
    } finally {
      setImporting(false);
      setImportPhase('');
      setImportPct(0);
    }
  };

  const phaseLabel: Record<string, string> = {
    parsing: t('exportImport.phaseParsing'),
    validating: t('exportImport.phaseValidating'),
    rewrapping: t('exportImport.phaseRewrapping'),
    uploading: t('exportImport.phaseUploading'),
    done: t('exportImport.phaseDone'),
  };

  return (
    <section>
      <div className="flex items-center gap-2 mb-4">
        <Download className="size-4 text-violet-300" />
        <h2 className="text-sm font-semibold uppercase tracking-wider text-text-secondary">
          {t('exportImport.title')}
        </h2>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Export */}
        <div className="p-5 rounded-xl border border-border-faint bg-bg-surface">
          <div className="flex items-center gap-2 mb-2">
            <Download className="size-4 text-emerald-300" />
            <h3 className="text-sm font-medium">{t('exportImport.exportTitle')}</h3>
          </div>
          <p className="text-xs text-text-tertiary mb-4">
            {t.rich('exportImport.exportDesc', {
              code: () => <code className="text-[10px] bg-bg-surface-2 px-1 py-0.5 rounded">.noctcom</code>,
            })}
          </p>
          <Button
            variant="outline"
            size="sm"
            leftIcon={exporting ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
            onClick={handleExport}
            disabled={exporting || !currentVaultId}
          >
            {exporting ? t('exportImport.exporting') : t('exportImport.exportButton')}
          </Button>
        </div>

        {/* Import */}
        <div className="p-5 rounded-xl border border-border-faint bg-bg-surface">
          <div className="flex items-center gap-2 mb-2">
            <Upload className="size-4 text-violet-300" />
            <h3 className="text-sm font-medium">{t('exportImport.importTitle')}</h3>
          </div>
          <p className="text-xs text-text-tertiary mb-4">
            {t.rich('exportImport.importDesc', {
              code: () => <code className="text-[10px] bg-bg-surface-2 px-1 py-0.5 rounded">.noctcom</code>,
            })}
          </p>

          <div className="space-y-3">
            <label className="block">
              <span className="text-xs text-text-tertiary">{t('exportImport.fileLabel')}</span>
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
                  <span className="text-xs text-text-tertiary">{t('exportImport.sourcePasswordLabel')}</span>
                  <input
                    type="password"
                    value={importPassword}
                    onChange={(e) => setImportPassword(e.target.value)}
                    placeholder={t('exportImport.sourcePasswordPlaceholder')}
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
                  {validatingPw ? t('exportImport.verifying') : t('exportImport.verifyPassword')}
                </Button>
              </>
            )}

            {passwordValidated && vaultName && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                  <Shield className="size-3.5 text-emerald-300" />
                  <span className="text-xs text-emerald-300">
                    {t.rich('exportImport.vaultLabel', {
                      name: vaultName,
                      strong: (chunks) => <strong>{chunks}</strong>,
                    })}
                  </span>
                </div>
                <Button
                  variant="primary"
                  size="sm"
                  leftIcon={importing ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
                  onClick={handleImport}
                  disabled={importing}
                >
                  {importing ? t('exportImport.importing') : t('exportImport.importButton')}
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
  const t = useTranslations('settings');
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
        toast.success(t('emailOtp.disabled'));
      } else {
        await apiFetch('/api/v1/2fa/email/enable', { method: 'POST' });
        setEnabled(true);
        toast.success(t('emailOtp.enabled'));
      }
    } catch (err: any) {
      toast.error(err.message ?? t('emailOtp.toggleError'));
    } finally {
      setWorking(false);
    }
  }

  return (
    <section className="mb-8">
      <div className="flex items-center gap-2 mb-4">
        <Mail className="size-4 text-violet-300" />
        <h2 className="text-sm font-semibold uppercase tracking-wider text-text-secondary">
          {t('emailOtp.title')}
        </h2>
      </div>

      <div className="flex items-center gap-4 p-4 rounded-xl border border-border-faint bg-bg-surface">
        <div className="size-10 rounded-lg bg-violet-500/10 border border-violet-500/20 grid place-items-center shrink-0">
          <Mail className="size-4 text-violet-300" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-medium">{t('emailOtp.cardTitle')}</h3>
          <p className="text-xs text-text-tertiary mt-0.5">
            {emailVerified
              ? t('emailOtp.descVerified')
              : t('emailOtp.descUnverified')}
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
            {enabled ? t('emailOtp.deactivate') : t('emailOtp.activate')}
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
  const t = useTranslations('settings');
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
      toast.error(t('recovery.sessionLocked'));
      return;
    }
    const vaultKeys = Object.values(auth.vaultKeys);
    if (vaultKeys.length === 0) {
      toast.error(t('recovery.noVaultsLoaded'));
      return;
    }

    const seed = deriveRecoverySeed(mnemonicWords);
    const signKp = deriveRecoverySignKeypair(seed);

    if (!rotate) {
      // La frase introducida debe ser LA de la cuenta: misma pública de firma.
      if (!status?.recoveryPublicKey || toB64(signKp.publicKey) !== status.recoveryPublicKey) {
        wipe(seed, signKp.privateKey);
        toast.error(t('recovery.phraseMismatch'));
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
      toast.success(t('recovery.kitActivated'));
      setMode('idle');
      setWords(Array(12).fill(''));
      fetchStatus();
    } catch (err: any) {
      toast.error(err.message ?? t('recovery.kitActivateError'));
    } finally {
      setWorking(false);
    }
  }

  async function handleGenerateConfirm() {
    if (!savedConfirmed) return;
    setWorking(true);
    try {
      await uploadKit(newMnemonic, true);
      toast.success(t('recovery.newPhraseActivated'));
      setMode('idle');
      setNewMnemonic([]);
      setSavedConfirmed(false);
      fetchStatus();
    } catch (err: any) {
      toast.error(err.message ?? t('recovery.regenerateError'));
    } finally {
      setWorking(false);
    }
  }

  return (
    <section className="mb-8">
      <div className="flex items-center gap-2 mb-4">
        <FileKey2 className="size-4 text-violet-300" />
        <h2 className="text-sm font-semibold uppercase tracking-wider text-text-secondary">
          {t('recovery.title')}
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
              {loading ? t('recovery.checking') : complete ? t('recovery.kitComplete') : t('recovery.kitIncomplete')}
            </h3>
            <p className="text-xs text-text-tertiary mt-0.5">
              {loading
                ? t('recovery.checkingDesc')
                : complete
                  ? t('recovery.completeDesc', { count: status!.vaultsTotal })
                  : t('recovery.incompleteDesc')}
            </p>
          </div>
          {!loading && mode === 'idle' && (
            <div className="flex gap-2 shrink-0">
              {!complete && (
                <Button size="sm" variant="primary" onClick={() => setMode('enter')}>
                  {t('recovery.haveMyPhrase')}
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
                {complete ? t('recovery.regeneratePhrase') : t('recovery.newPhrase')}
              </Button>
            </div>
          )}
        </div>

        {mode === 'enter' && (
          <form onSubmit={handleEnterSubmit} className="space-y-3 pt-3 border-t border-border-faint">
            <p className="text-xs text-text-secondary">
              {t('recovery.enterInstructions')}
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
                {t('recovery.cancel')}
              </Button>
              <Button type="submit" size="sm" variant="primary" loading={working} disabled={words.some((w) => !w)}>
                {t('recovery.verifyActivate')}
              </Button>
            </div>
          </form>
        )}

        {mode === 'generate' && (
          <div className="space-y-3 pt-3 border-t border-border-faint">
            <div className="flex gap-2 p-3 rounded-lg bg-amber-500/5 border border-amber-500/20">
              <AlertTriangle className="size-4 text-amber-300 mt-0.5 shrink-0" />
              <p className="text-xs text-text-secondary leading-relaxed">
                {t.rich('recovery.generateWarning', {
                  strong: (chunks) => <strong className="text-amber-200">{chunks}</strong>,
                })}
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
              onClick={async () => {
                const ok = await copyText(newMnemonic.join(' '));
                if (!ok) { toast.error(t('recovery.copyFailed')); return; }
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
                setTimeout(() => clearClipboard(), 60_000);
                toast.success(t('recovery.copiedClipboard'));
              }}
            >
              {copied ? t('recovery.copied') : t('recovery.copyPhrase')}
            </Button>
            <label className="flex items-start gap-2 text-xs cursor-pointer p-2 rounded-lg hover:bg-bg-surface-2 transition-colors">
              <input
                type="checkbox"
                checked={savedConfirmed}
                onChange={(e) => setSavedConfirmed(e.target.checked)}
                className="mt-0.5 size-3.5 accent-violet-500"
              />
              <span className="text-text-secondary">
                {t('recovery.savedConfirmLabel')}
              </span>
            </label>
            <div className="flex gap-2 justify-end">
              <Button size="sm" variant="ghost" onClick={() => { setMode('idle'); setNewMnemonic([]); setSavedConfirmed(false); }}>
                {t('recovery.cancel')}
              </Button>
              <Button size="sm" variant="primary" loading={working} disabled={!savedConfirmed} onClick={handleGenerateConfirm}>
                {t('recovery.activateNewPhrase')}
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
  const t = useTranslations('settings');
  const { storageUsed, storageQuota, refreshStorage } = useVault();
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [working, setWorking] = useState(false);
  const [showPlans, setShowPlans] = useState(false);

  const reloadStatus = useCallback(() => {
    fetchBillingStatus().then(setStatus).catch(() => {});
  }, []);

  useEffect(() => { reloadStatus(); }, [reloadStatus]);

  const pct = storageQuota > 0 ? Math.min(100, Math.round((storageUsed / storageQuota) * 100)) : 0;
  const near = pct >= 90;
  const isPaid = !!status && status.plan !== 'free';
  // Self-host es gratis (AGPL): nunca se ofrece mejorar/cambiar de plan, aunque
  // el operador tuviera Stripe configurado en su instancia.
  const isSelfHost = process.env.NEXT_PUBLIC_SELF_HOST === 'true';

  async function manage() {
    setWorking(true);
    try {
      await openBillingPortal();
    } catch (err: any) {
      toast.error(err?.message ?? t('plan.portalError'));
      setWorking(false);
    }
  }

  const [unlockWorking, setUnlockWorking] = useState(false);
  async function buyUnlock() {
    setUnlockWorking(true);
    try {
      const res = await startUnlockCheckout();
      if (res.alreadyUnlocked) { toast.success(t('unlock.already')); reloadStatus(); }
      // si hay url, startUnlockCheckout ya redirige a Stripe.
    } catch (err: any) {
      toast.error(err?.message ?? t('unlock.error'));
    } finally {
      setUnlockWorking(false);
    }
  }
  // El desbloqueo "Tus discos" de por vida solo tiene sentido en la nube
  // gestionada (en self-host ya es gratis). Se muestra si Stripe lo ofrece.
  const showUnlock = !isSelfHost && !!status && (status.agentUnlock || status.unlockAvailable);

  return (
    <section className="mb-8">
      <div className="flex items-center gap-2 mb-4">
        <Gauge className="size-4 text-violet-300" />
        <h2 className="text-sm font-semibold uppercase tracking-wider text-text-secondary">
          {t('plan.title')}
        </h2>
      </div>

      <div className="p-4 rounded-xl border border-border-faint bg-bg-surface space-y-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h3 className="text-sm font-medium">
              {t('plan.planPrefix', { label: status?.planLabel ?? '—' })}
              {isPaid && status?.subscriptionStatus && status.subscriptionStatus !== 'active' && (
                <span className="ml-2 text-[10px] font-mono uppercase text-amber-300">{status.subscriptionStatus}</span>
              )}
            </h3>
            <p className="text-xs text-text-tertiary mt-0.5">
              {t('plan.usage', { used: formatBytes(storageUsed), total: formatBytes(storageQuota) })}
            </p>
            {isPaid && status?.currentPeriodEnd && (
              status.cancelAtPeriodEnd ? (
                <p className="text-xs text-amber-300 mt-1">
                  {t('plan.revertsToFree', { date: new Date(status.currentPeriodEnd).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }) })}
                </p>
              ) : (
                <p className="text-[11px] text-text-muted mt-1">
                  {t('plan.renews', { date: new Date(status.currentPeriodEnd).toLocaleDateString('es-ES', { day: 'numeric', month: 'long' }) })}
                </p>
              )
            )}
          </div>
          <div className="flex gap-2">
            {!isSelfHost && status?.billingEnabled && (
              <Button size="sm" variant={isPaid ? 'ghost' : 'primary'} onClick={() => setShowPlans(true)}>
                {isPaid ? t('plan.changePlan') : t('plan.upgradePlan')}
              </Button>
            )}
            {isPaid && status?.hasCustomer && (
              <Button size="sm" variant="outline" loading={working} leftIcon={<CreditCard className="size-3.5" />} onClick={manage}>
                {t('plan.manage')}
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
              {t('plan.nearLimit')} {status?.billingEnabled ? t('plan.expandHint') : ''}
            </p>
          )}
        </div>
      </div>

      {/* Desbloqueo "Tus discos" de por vida (pago único). Usa tus propios discos
          vía Connector sin cuota de nube ni suscripción mensual. */}
      {showUnlock && (
        <div className={cn(
          'mt-3 p-4 rounded-xl border bg-bg-surface',
          status?.agentUnlock ? 'border-emerald-500/40' : 'border-border-faint',
        )}>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-start gap-3">
              <HardDrive className={cn('size-4 mt-0.5', status?.agentUnlock ? 'text-emerald-300' : 'text-amber-300')} />
              <div>
                <h3 className="text-sm font-medium flex items-center gap-2">
                  {t('unlock.title')}
                  {status?.agentUnlock && (
                    <span className="text-[10px] font-mono uppercase text-emerald-300 border border-emerald-500/40 rounded px-1.5 py-0.5">
                      {t('unlock.activeBadge')}
                    </span>
                  )}
                </h3>
                <p className="text-xs text-text-tertiary mt-1 max-w-md">
                  {status?.agentUnlock ? t('unlock.activeBody') : t('unlock.body')}
                </p>
              </div>
            </div>
            {!status?.agentUnlock && (
              <Button size="sm" variant="primary" loading={unlockWorking} onClick={buyUnlock}>
                {t('unlock.buy')}
              </Button>
            )}
          </div>
        </div>
      )}

      {showPlans && (
        <PlanPickerModal
          currentPlan={status?.plan ?? 'free'}
          onClose={() => setShowPlans(false)}
          onUpdated={() => { reloadStatus(); refreshStorage(); }}
        />
      )}
    </section>
  );
}

// Modal in-app para elegir/cambiar de plan sin salir del shell de la app.
// Primera compra → redirige a Stripe Checkout. Cambio de plan → actualiza la
// suscripción (prorrateo) y refresca el estado sin recargar.
function PlanPickerModal({ currentPlan, onClose, onUpdated }: {
  currentPlan: string;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const t = useTranslations('settings');
  const [plans, setPlans] = useState<PublicPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    fetchPlans()
      .then((r) => setPlans(r.plans.filter((p) => p.priceEurMonth > 0)))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function pick(plan: PublicPlan) {
    if (plan.id === currentPlan) return;
    setBusy(plan.id);
    try {
      const res = await startCheckout(plan.id);
      if (res.updated) {
        toast.success(res.unchanged ? t('planPicker.alreadyOnPlan') : t('planPicker.planUpdated', { plan: plan.label }));
        // La cuota se ajusta vía webhook: refrescamos un par de veces.
        setTimeout(onUpdated, 1500);
        setTimeout(onUpdated, 4000);
        onClose();
        return;
      }
      // Si hay url, el navegador ya está redirigiendo a Stripe Checkout.
    } catch (err: any) {
      toast.error(err?.message ?? t('planPicker.changeError'));
      setBusy(null);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={() => !busy && onClose()}
    >
      <div
        className="w-full max-w-lg rounded-2xl border border-border-subtle bg-bg-surface p-6 shadow-[0_20px_60px_-12px_rgba(0,0,0,0.7)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-1">
          <h3 className="font-display text-lg font-medium">{t('planPicker.title')}</h3>
          <button onClick={() => !busy && onClose()} className="p-1 rounded-md hover:bg-bg-surface-2 text-text-tertiary" aria-label={t('planPicker.close')}>✕</button>
        </div>
        <p className="text-xs text-text-tertiary mb-5">
          {t('planPicker.subtitle')}
        </p>

        {loading ? (
          <div className="grid place-items-center py-10">
            <div className="size-5 rounded-full border-2 border-border-subtle border-t-violet-500 animate-spin" />
          </div>
        ) : (
          <div className="space-y-2">
            {plans.map((plan) => {
              const isCurrent = plan.id === currentPlan;
              const soon = !plan.available;
              return (
                <div
                  key={plan.id}
                  className={cn(
                    'flex items-center gap-4 p-3.5 rounded-xl border transition-colors',
                    isCurrent ? 'border-violet-500/40 bg-violet-500/[0.06]' : 'border-border-faint bg-bg-surface-2',
                  )}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className="text-sm font-semibold">{plan.label}</span>
                      <span className="font-mono text-sm text-violet-200 font-bold">{plan.priceEurMonth}€<span className="text-[10px] text-text-tertiary font-sans">{t('planPicker.perMonth')}</span></span>
                    </div>
                    <p className="text-[11px] text-text-tertiary mt-0.5">{t('planPicker.encryptedQuota', { quota: formatBytes(plan.quotaBytes) })}</p>
                  </div>
                  {isCurrent ? (
                    <span className="text-[10px] font-mono uppercase tracking-wider text-violet-300 bg-violet-500/10 px-2 py-1 rounded">{t('planPicker.current')}</span>
                  ) : (
                    <Button size="sm" variant="outline" disabled={soon} loading={busy === plan.id} onClick={() => pick(plan)}>
                      {soon ? t('planPicker.soon') : t('planPicker.choose')}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <p className="text-[11px] text-text-tertiary text-center mt-5">
          {t('planPicker.securePayment')}
        </p>
      </div>
    </div>
  );
}

// ─── Cambiar contraseña maestra ──────────────────────────────────
// Re-cifra (re-envuelve) todas las claves con una MK nueva. Zero-knowledge: el
// cliente ya tiene las vault keys en memoria, solo cambia el envoltorio. La
// contraseña actual se exige para probar identidad (firma del challenge).

function ChangePasswordSection() {
  const t = useTranslations('settings');
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
    if (next.length < 8) { toast.error(t('password.tooShort')); return; }
    if (next !== confirm) { toast.error(t('password.mismatch')); return; }
    if (next === current) { toast.error(t('password.mustDiffer')); return; }
    setWorking(true);
    try {
      await changeMasterPassword(current, next);
      toast.success(t('password.changed'));
      reset();
      setOpen(false);
    } catch (err: any) {
      const msg = err?.message ?? '';
      toast.error(/incorrecta|invalid|401/i.test(msg)
        ? t('password.currentWrong')
        : (msg || t('password.changeError')));
    } finally {
      setWorking(false);
    }
  }

  return (
    <section className="mb-8">
      <div className="flex items-center gap-2 mb-4">
        <Lock className="size-4 text-violet-300" />
        <h2 className="text-sm font-semibold uppercase tracking-wider text-text-secondary">
          {t('password.sectionTitle')}
        </h2>
      </div>

      <div className="flex items-center gap-4 p-4 rounded-xl border border-border-faint bg-bg-surface">
        <div className="size-10 rounded-lg bg-violet-500/10 border border-violet-500/20 grid place-items-center shrink-0">
          <Lock className="size-4 text-violet-300" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-medium">{t('password.cardTitle')}</h3>
          <p className="text-xs text-text-tertiary mt-0.5">
            {t('password.cardDesc')}
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}>{t('password.change')}</Button>
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
              <h3 className="font-display text-lg font-medium">{t('password.modalTitle')}</h3>
              <p className="text-xs text-text-tertiary mt-1 leading-relaxed">
                {t('password.modalDesc')}
              </p>
            </div>
            <Input
              label={t('password.currentLabel')}
              type="password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              leftIcon={<Lock className="size-4" />}
              required
              autoFocus
            />
            <Input
              label={t('password.newLabel')}
              type="password"
              value={next}
              onChange={(e) => setNext(e.target.value.slice(0, 128))}
              leftIcon={<KeyRound className="size-4" />}
              required
            />
            <Input
              label={t('password.repeatLabel')}
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value.slice(0, 128))}
              leftIcon={<KeyRound className="size-4" />}
              required
              error={confirm.length > 0 && next !== confirm ? t('password.noMatch') : undefined}
            />
            <div className="flex gap-2 justify-end pt-1">
              <Button type="button" variant="ghost" size="sm" disabled={working} onClick={() => setOpen(false)}>
                {t('password.cancel')}
              </Button>
              <Button type="submit" variant="primary" size="sm" loading={working}>
                {working ? t('password.rewrapping') : t('password.submit')}
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
  const t = useTranslations('settings');
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
        toast.success(t('push.disabledToast'));
      } else {
        const result = await enablePush();
        setStatus(result);
        if (result === 'granted') {
          setChosen(true);
          toast.success(t('push.enabledToast'));
        } else if (result === 'denied') {
          toast.error(t('push.deniedToast'));
        }
      }
    } catch (err: any) {
      toast.error(err.message ?? t('push.toggleError'));
    } finally {
      setWorking(false);
    }
  }

  return (
    <section className="mb-8">
      <div className="flex items-center gap-2 mb-4">
        <Bell className="size-4 text-violet-300" />
        <h2 className="text-sm font-semibold uppercase tracking-wider text-text-secondary">
          {t('push.title')}
        </h2>
      </div>

      <div className="flex items-center gap-4 p-4 rounded-xl border border-border-faint bg-bg-surface">
        <div className="size-10 rounded-lg bg-violet-500/10 border border-violet-500/20 grid place-items-center shrink-0">
          {active ? <Bell className="size-4 text-violet-300" /> : <BellOff className="size-4 text-text-tertiary" />}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-medium">{t('push.cardTitle')}</h3>
          <p className="text-xs text-text-tertiary mt-0.5">
            {status === 'unsupported'
              ? t('push.unsupported')
              : status === 'denied'
                ? t('push.denied')
                : active
                  ? t('push.activeDesc')
                  : t('push.inactiveDesc')}
          </p>
        </div>
        {status !== 'unsupported' && status !== 'denied' && (
          <Button
            size="sm"
            variant={active ? 'outline' : 'primary'}
            loading={working}
            onClick={toggle}
          >
            {active ? t('push.deactivate') : t('push.activate')}
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
  const t = useTranslations('settings');
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
      toast.error(t('passkeys.unsupported'));
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
          toast.info(t('passkeys.registerCancelled'));
          return;
        }
        if (err?.name === 'InvalidStateError') {
          toast.info(t('passkeys.alreadyRegistered'));
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
      toast.success(t('passkeys.registered'));
      fetchPasskeys();
    } catch {
      toast.error(t('passkeys.registerError'));
    } finally {
      setRegistering(false);
    }
  }

  async function handleRevoke(id: string) {
    try {
      await apiFetch(`/api/v1/2fa/webauthn/${id}`, { method: 'DELETE' });
      toast.success(t('passkeys.revoked'));
      setPasskeys((p) => p.filter((k) => k.id !== id));
    } catch {
      toast.error(t('passkeys.revokeError'));
    }
  }

  return (
    <section className="mb-8">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Fingerprint className="size-4 text-violet-300" />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-text-secondary">
            {t('passkeys.title')}
          </h2>
        </div>
        <Button size="sm" loading={registering} onClick={handleRegister}>
          <Plus className="size-4" />
          {t('passkeys.add')}
        </Button>
      </div>

      <p className="text-xs text-text-tertiary mb-4">
        {t('passkeys.desc')}
      </p>

      <div className="space-y-1">
        {loading ? (
          <div className="flex items-center gap-2 p-4 text-sm text-text-tertiary">
            <Loader2 className="size-4 animate-spin" />
            {t('passkeys.loading')}
          </div>
        ) : passkeys.length === 0 ? (
          <div className="p-4 rounded-xl border border-dashed border-border-faint text-sm text-text-tertiary">
            {t('passkeys.empty')}
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
                  {pk.device_type === 'multiDevice' ? t('passkeys.synced') : t('passkeys.thisDevice')}
                  {' · '}
                  {pk.last_used_at ? t('passkeys.usedAgo', { ago: timeAgo(pk.last_used_at, t) }) : t('passkeys.neverUsed')}
                </p>
              </div>
              <button
                onClick={() => handleRevoke(pk.id)}
                className="p-2 rounded-lg text-text-tertiary hover:text-red-400 hover:bg-red-500/10 transition-colors"
                title={t('passkeys.revokeTitle')}
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
  const t = useTranslations('settings');
  const usedPct = disk.totalBytes > 0 ? Math.min(100, (disk.usedBytes / disk.totalBytes) * 100) : 0;
  const [busy, setBusy] = useState(false);
  const [formatOpen, setFormatOpen] = useState(false);
  // Nunca ofrecemos formatear el disco de sistema. En Windows es C:; en Linux,
  // el que monta la raíz o el arranque (`/`, `/boot…`). El agente lo vuelve a
  // rechazar comparando el disco padre con el que monta `/` (última palabra).
  const isSystemDrive =
    /^c[:\\]?/i.test(disk.device || disk.path || '') ||
    disk.path === '/' ||
    disk.path.startsWith('/boot');

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
      toast.success(t('disks.diskReady', { name: disk.label || disk.device }));
      onChanged();
      // Refresca el "Almacenamiento": ahora suma la capacidad del disco.
      void useVault.getState().refreshStorage();
    } catch (err: any) {
      toast.error(err.message ?? t('disks.prepareError'));
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
      toast.success(t('disks.diskUnused'));
      onChanged();
      void useVault.getState().refreshStorage();
    } catch (err: any) {
      toast.error(err.message ?? t('disks.unuseError'));
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
              <Check className="size-3" /> {t('disks.inUse')}
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
              <p className="text-[10px] text-text-muted uppercase">{t('disks.total')}</p>
              <p className="text-xs font-mono font-medium">{fmtSize(disk.totalBytes)}</p>
            </div>
            <div>
              <p className="text-[10px] text-text-muted uppercase">{t('disks.used')}</p>
              <p className="text-xs font-mono font-medium text-amber-400">{fmtSize(disk.usedBytes)}</p>
            </div>
            <div>
              <p className="text-[10px] text-text-muted uppercase">{t('disks.free')}</p>
              <p className="text-xs font-mono font-medium text-emerald-400">{fmtSize(disk.freeBytes)}</p>
            </div>
          </div>
          <div className="flex items-center justify-center gap-2 mt-1.5 pt-1.5 border-t border-border-faint">
            <span className={cn('text-[10px] font-mono uppercase', disk.needsFormat ? 'text-amber-400' : 'text-text-muted')}>
              {disk.filesystem || t('disks.noFilesystem')}
            </span>
            {disk.needsFormat && <span className="text-[10px] text-amber-400 font-medium">{t('disks.incompatible')}</span>}
            {!disk.removable && <span className="text-[10px] text-text-muted">{t('disks.internalSuffix')}</span>}
          </div>
        </div>
      </div>
      <div className="shrink-0 flex items-center gap-1.5">
        {/* Formatear está disponible esté el disco en uso o no (nunca para C:).
            El backend impide formatear si el disco ya guarda archivos.
            Si el disco está en crudo/incompatible (needsFormat) NO ofrecemos
            "usar tal cual" — sin filesystem usable el agente no podría escribir,
            así que formatear es el único camino (formato obligatorio del disco
            dedicado). Formatear pasa por confirmación de etiqueta + 2FA. */}
        {!isSystemDrive && (
          <Button
            variant={disk.needsFormat && !disk.active ? 'secondary' : 'ghost'}
            size="sm"
            disabled={busy}
            onClick={() => setFormatOpen(true)}
            className={disk.needsFormat && !disk.active ? undefined : 'text-red-400 hover:text-red-300'}
            title={t('disks.formatTitle')}
          >
            <Eraser className="size-3.5 mr-1" /> {disk.needsFormat && !disk.active ? t('disks.formatAndUse') : t('disks.format')}
          </Button>
        )}
        {disk.active ? (
          <Button variant="ghost" size="sm" loading={busy} onClick={handleUnuse}>
            <Power className="size-3.5 mr-1" /> {t('disks.stopUsing')}
          </Button>
        ) : !disk.needsFormat ? (
          <Button variant="secondary" size="sm" loading={busy} onClick={handleUse}>
            <FolderPlus className="size-3.5 mr-1" /> {t('disks.useThisDisk')}
          </Button>
        ) : null}
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
  const t = useTranslations('settings');
  const { masterKey } = useAuth();
  const [agents, setAgents] = useState<AgentView[]>([]);
  const [loading, setLoading] = useState(true);
  const [pairing, setPairing] = useState(false);
  const [pairCode, setPairCode] = useState<string | null>(null);
  const [os, setOs] = useState<'windows' | 'macos' | 'linux' | 'other'>('other');
  const [release, setRelease] = useState<{ sha256: string | null; virusTotalUrl: string | null; available: boolean }>({
    sha256: null,
    virusTotalUrl: null,
    available: false,
  });

  useEffect(() => {
    const ua = navigator.userAgent.toLowerCase();
    setOs(
      ua.includes('win') ? 'windows'
        : ua.includes('mac') ? 'macos'
        : (ua.includes('linux') || ua.includes('x11')) ? 'linux'
        : 'other',
    );
  }, []);

  // Datos de release (disponibilidad + SHA256 + VirusTotal) del binario para el
  // SO detectado: Windows o Linux. En macOS/otros consultamos Windows (el binario
  // siempre publicado, que es lo que ofrece el botón por defecto). Endpoint
  // público; si no hay hash configurado, no se muestra el bloque de checksum.
  useEffect(() => {
    const platform = os === 'linux' ? 'linux' : 'windows';
    apiFetch<{ sha256: string | null; virusTotalUrl: string | null; available: boolean }>(
      `/api/v1/agent/version?platform=${platform}`,
    )
      .then((r) => setRelease({
        sha256: r.sha256 ?? null,
        virusTotalUrl: r.virusTotalUrl ?? null,
        available: Boolean(r.available),
      }))
      .catch(() => { /* sin datos de release: solo se omite el bloque de checksum */ });
  }, [os]);

  // Plataforma cuyo binario ofrece el botón principal. Windows está siempre
  // publicado; Linux solo cuando su binario está en B2 (release.available).
  const downloadOs: 'windows' | 'linux' = os === 'linux' && release.available ? 'linux' : 'windows';

  const fetchAgents = useCallback(async () => {
    if (!masterKey) return;
    try {
      const raw = await apiFetch<ApiAgent[]>('/api/v1/agent');
      setAgents(
        raw.map((a) => {
          let name = t('connector.agentFallback');
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
    const name = window.prompt(t('connector.namePrompt'), t('connector.nameDefault'));
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
      // En el cloud, el Connector es de los planes de pago (cualquiera).
      if (String(err.message ?? '').includes('plan-required')) {
        toast.error(t('connector.planRequired'));
      } else {
        toast.error(err.message ?? t('connector.pairCodeError'));
      }
    } finally {
      setPairing(false);
    }
  }

  async function handleRevoke(id: string) {
    try {
      await apiFetch(`/api/v1/agent/${id}`, { method: 'DELETE' });
      toast.success(t('connector.unlinked'));
      setAgents((a) => a.filter((x) => x.id !== id));
    } catch {
      toast.error(t('connector.unlinkError'));
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
          {t('connector.linkAgent')}
        </Button>
      </div>

      <p className="text-xs text-text-tertiary mb-4">
        {t('connector.intro')}
      </p>

      {/* Paso 1: descargar el binario */}
      <div className="mb-4 p-4 rounded-xl border border-border-faint bg-bg-surface">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <h3 className="text-sm font-medium">{t('connector.step1Title')}</h3>
            <p className="text-xs text-text-tertiary mt-0.5">
              {os === 'windows'
                ? t('connector.step1Windows')
                : os === 'linux'
                  ? t('connector.step1Linux')
                  : os === 'macos'
                    ? t('connector.step1Macos')
                    : t('connector.step1Generic')}
            </p>
          </div>
          <a
            href={`${process.env.NEXT_PUBLIC_API_URL ?? ''}/api/v1/agent/download?platform=${downloadOs}`}
            className="inline-flex items-center gap-2 h-9 px-4 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium transition-colors shrink-0"
          >
            <Download className="size-4" />
            {downloadOs === 'linux' ? t('connector.downloadLinux') : t('connector.downloadWindows')}
          </a>
        </div>
        {os === 'linux' && !release.available && (
          <p className="text-[10px] text-text-muted mt-2">
            {t('connector.linuxSoon')}
          </p>
        )}
        {os === 'macos' && (
          <p className="text-[10px] text-text-muted mt-2">
            {t('connector.macosUnavailable')}
          </p>
        )}

        {/* Aviso de SmartScreen: el binario aún no está firmado. Solo Windows. */}
        {os === 'windows' && (
          <p className="flex items-start gap-2 text-[11px] text-text-muted mt-3 leading-relaxed">
            <AlertTriangle className="size-3.5 mt-0.5 shrink-0 text-amber-400/80" />
            <span>
              {t.rich('connector.unsignedNote', {
                strong: (chunks) => <strong className="text-text-tertiary">{chunks}</strong>,
              })}
            </span>
          </p>
        )}

        {/* Transparencia: SHA256 + informe de VirusTotal del binario servido. */}
        {release.sha256 && (
          <div className="mt-3 pt-3 border-t border-border-faint">
            <div className="flex items-center gap-2 flex-wrap">
              <FileKey2 className="size-3.5 shrink-0 text-text-muted" />
              <span className="text-[10px] uppercase tracking-wider text-text-muted">
                {t('connector.checksumLabel')}
              </span>
              <code className="text-[10px] font-mono text-text-tertiary break-all">
                {release.sha256}
              </code>
              <button
                onClick={async () => {
                  const ok = await copyText(release.sha256 ?? '');
                  toast[ok ? 'success' : 'error'](t(ok ? 'connector.checksumCopied' : 'connector.copyFailed'));
                }}
                className="p-1 rounded text-text-muted hover:text-text-primary transition-colors"
                title={t('connector.copy')}
              >
                <Copy className="size-3" />
              </button>
            </div>
            {release.virusTotalUrl && (
              <a
                href={release.virusTotalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block mt-1.5 text-[11px] text-violet-400 hover:text-violet-300 underline underline-offset-2"
              >
                {t('connector.virusTotalLink')}
              </a>
            )}
          </div>
        )}
      </div>

      {pairCode && (
        <div className="mb-4 p-4 rounded-xl border border-emerald-500/30 bg-emerald-500/5">
          <p className="text-xs text-text-secondary">
            {t.rich('connector.step2', {
              strong: (chunks) => <strong>{chunks}</strong>,
            })}
          </p>
          <div className="flex items-center gap-2 mt-2">
            <code className="flex-1 text-xs font-mono bg-bg-surface-2 px-3 py-2 rounded-lg break-all">
              .\noctcom-connector.exe pair --code {pairCode}
            </code>
            <button
              onClick={async () => {
                const ok = await copyText(`.\\noctcom-connector.exe pair --code ${pairCode}`);
                toast[ok ? 'success' : 'error'](t(ok ? 'connector.commandCopied' : 'connector.copyFailed'));
              }}
              className="p-2 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-bg-surface-2 transition-colors"
              title={t('connector.copy')}
            >
              <Copy className="size-4" />
            </button>
          </div>
          <p className="text-[10px] text-text-muted mt-2">
            {t.rich('connector.runHint', {
              run: () => <span className="font-mono text-text-tertiary">.\noctcom-connector.exe run</span>,
              br: () => <br />,
              tip: (chunks) => <span className="text-text-tertiary">{chunks}</span>,
              cmd: () => <span className="font-mono">cmd</span>,
            })}
          </p>
          <div className="mt-3">
            <Button size="sm" variant="outline" onClick={() => { setPairCode(null); fetchAgents(); }}>
              {t('connector.alreadyLinked')}
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-1">
        {loading ? (
          <div className="flex items-center gap-2 p-4 text-sm text-text-tertiary">
            <Loader2 className="size-4 animate-spin" />
            {t('connector.loadingAgents')}
          </div>
        ) : agents.length === 0 ? (
          <p className="text-xs text-text-muted px-1">
            {t('connector.noAgents')}
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
                    {a.platform ?? t('connector.unknownPlatform')} ·{' '}
                    {a.online ? (
                      <span className="text-emerald-400">{t('connector.online')}</span>
                    ) : (
                      <span>{t('connector.offline')}</span>
                    )}
                  </p>
                </div>
                <button
                  onClick={() => handleRevoke(a.id)}
                  className="p-2 rounded-lg text-text-tertiary hover:text-red-400 hover:bg-red-500/10 transition-colors"
                  title={t('connector.unlinkTitle')}
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
