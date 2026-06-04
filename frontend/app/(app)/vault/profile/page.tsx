'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  User, Shield, ShieldCheck, Monitor, Smartphone, HardDrive,
  Clock, Calendar, Settings, KeyRound, Fingerprint, Mail, MailCheck,
  Users, Crown,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/lib/auth-store';
import { useVault } from '@/lib/vault-store';
import { apiFetch } from '@/lib/api';
import { fromB64, decryptString } from '@/lib/crypto';
import { cn } from '@/lib/utils';

interface MeData {
  id: string;
  username: string;
  isAdmin: boolean;
  storageQuotaBytes: number;
  storageUsedBytes: number;
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

interface AdminUser {
  id: string;
  username: string;
  isAdmin: boolean;
  createdAt: string;
  lastLoginAt: string | null;
}

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

function fmtSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0; let n = bytes;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
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

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-ES', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

export default function ProfilePage() {
  const { username, masterKey } = useAuth();
  const { storageUsed, storageQuota } = useVault();
  const [me, setMe] = useState<MeData | null>(null);
  const [devices, setDevices] = useState<DeviceView[]>([]);
  const [loadingDevices, setLoadingDevices] = useState(true);
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [togglingUserId, setTogglingUserId] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<MeData>('/api/v1/auth/me')
      .then(setMe)
      .catch(() => {});
  }, []);

  const fetchDevices = useCallback(async () => {
    if (!masterKey) return;
    try {
      const raw = await apiFetch<ApiDevice[]>('/api/v1/auth/devices');
      setDevices(raw.map((d) => {
        let browser = 'Dispositivo';
        let os = '';
        try {
          const name = decryptString(fromB64(d.nameEncrypted), fromB64(d.nameNonce), masterKey);
          const info = parseDeviceName(name);
          browser = info.browser;
          os = info.os;
        } catch { /* fallback */ }
        return { id: d.id, browser, os, lastSeenAt: d.lastSeenAt, createdAt: d.createdAt, isCurrent: d.isCurrent };
      }));
    } catch { /* ignore */ }
    setLoadingDevices(false);
  }, [masterKey]);

  useEffect(() => { fetchDevices(); }, [fetchDevices]);

  const fetchAdminUsers = useCallback(async () => {
    if (!me?.isAdmin) return;
    setLoadingUsers(true);
    try {
      const users = await apiFetch<AdminUser[]>('/api/v1/admin/users');
      setAdminUsers(users);
    } catch { /* ignore */ }
    setLoadingUsers(false);
  }, [me?.isAdmin]);

  useEffect(() => { fetchAdminUsers(); }, [fetchAdminUsers]);

  const toggleAdmin = async (userId: string, current: boolean) => {
    setTogglingUserId(userId);
    try {
      await apiFetch(`/api/v1/admin/users/${userId}/role`, {
        method: 'PATCH',
        body: JSON.stringify({ isAdmin: !current }),
      });
      toast.success(current ? 'Rol de admin revocado' : 'Rol de admin otorgado');
      fetchAdminUsers();
    } catch (e: any) {
      toast.error(e.message ?? 'Error al cambiar rol');
    }
    setTogglingUserId(null);
  };

  const usedPct = storageQuota > 0 ? Math.min(100, (storageUsed / storageQuota) * 100) : 0;
  const isAdmin = me?.isAdmin ?? false;

  return (
    <div className="px-8 py-6 max-w-3xl mx-auto">
      {/* Header / Identity card */}
      <div className="p-6 rounded-2xl border border-border-faint bg-bg-surface mb-8">
        <div className="flex items-start gap-5">
          <div className="size-20 rounded-2xl bg-gradient-to-br from-violet-400 to-violet-700 grid place-items-center text-2xl font-bold shadow-[0_0_32px_-8px_rgba(139,92,246,0.5)] shrink-0">
            {username?.[0]?.toUpperCase() ?? '?'}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="font-display text-2xl font-semibold tracking-tight">{username ?? 'Usuario'}</h1>
              {isAdmin ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider text-violet-300 bg-violet-500/15 border border-violet-500/30 px-2 py-0.5 rounded-full">
                  <ShieldCheck className="size-3" /> Admin
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider text-text-muted bg-bg-surface-2 border border-border-faint px-2 py-0.5 rounded-full">
                  <User className="size-3" /> Usuario
                </span>
              )}
            </div>
            <p className="text-sm text-text-tertiary mt-1">Plan gratuito</p>
            <div className="flex items-center gap-4 mt-3 flex-wrap">
              <div className="flex items-center gap-1.5 text-xs text-text-muted">
                <Monitor className="size-3.5" />
                <span>{devices.length} {devices.length === 1 ? 'dispositivo' : 'dispositivos'}</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-text-muted">
                <HardDrive className="size-3.5" />
                <span>{fmtSize(storageUsed)} usado</span>
              </div>
            </div>
          </div>
          <Link href="/vault/settings">
            <Button variant="ghost" size="sm">
              <Settings className="size-3.5 mr-1" /> Ajustes
            </Button>
          </Link>
        </div>
      </div>

      {/* Storage */}
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
            <span className="text-xs font-mono text-text-muted">{usedPct.toFixed(1)}%</span>
          </div>
          <div className="h-2 bg-bg-surface-2 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-violet-600 to-violet-400 rounded-full transition-all duration-500"
              style={{ width: `${usedPct}%` }}
            />
          </div>
        </div>
      </section>

      {/* Active devices */}
      <section className="mb-8">
        <div className="flex items-center gap-2 mb-4">
          <Monitor className="size-4 text-cyan-300" />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-text-secondary">
            Sesiones activas
          </h2>
        </div>
        <div className="space-y-1">
          {loadingDevices && (
            <p className="text-xs text-text-muted px-1 animate-pulse">Cargando dispositivos...</p>
          )}
          {devices.map((device) => {
            const isMobile = device.os.includes('iOS') || device.os.includes('Android');
            return (
              <div
                key={device.id}
                className={cn(
                  'flex items-center gap-4 p-4 rounded-xl border bg-bg-surface transition-all',
                  device.isCurrent ? 'border-emerald-500/20' : 'border-border-faint',
                )}
              >
                <div className={cn(
                  'size-10 rounded-lg grid place-items-center shrink-0 border',
                  device.isCurrent ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-bg-surface-2 border-border-faint',
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
                        actual
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-text-tertiary mt-0.5">{device.os}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-mono text-text-muted uppercase tracking-wider">
                    {device.isCurrent ? 'Ahora' : timeAgo(device.lastSeenAt)}
                  </p>
                  <p className="text-[10px] text-text-muted">
                    Desde {fmtDate(device.createdAt)}
                  </p>
                </div>
              </div>
            );
          })}
          {!loadingDevices && devices.length === 0 && (
            <p className="text-xs text-text-muted px-1">Sin dispositivos registrados.</p>
          )}
        </div>
      </section>

      {/* Security overview */}
      <section className="mb-8">
        <div className="flex items-center gap-2 mb-4">
          <Shield className="size-4 text-violet-300" />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-text-secondary">
            Seguridad
          </h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="p-4 rounded-xl border border-border-faint bg-bg-surface">
            <KeyRound className="size-4 text-violet-300 mb-2" />
            <p className="text-xs font-medium">Cifrado E2E</p>
            <p className="text-[10px] font-mono text-emerald-400 uppercase tracking-wider mt-1">Activo</p>
          </div>
          <div className="p-4 rounded-xl border border-border-faint bg-bg-surface">
            <Fingerprint className="size-4 text-violet-300 mb-2" />
            <p className="text-xs font-medium">2FA / Passkey</p>
            <Link href="/vault/settings" className="text-[10px] font-mono text-violet-400 uppercase tracking-wider mt-1 block hover:text-violet-300 transition-colors">
              Configurar
            </Link>
          </div>
          <div className="p-4 rounded-xl border border-border-faint bg-bg-surface">
            <Shield className="size-4 text-violet-300 mb-2" />
            <p className="text-xs font-medium">Zero-knowledge</p>
            <p className="text-[10px] font-mono text-emerald-400 uppercase tracking-wider mt-1">Verificado</p>
          </div>
        </div>
      </section>

      {/* Admin: user management */}
      {isAdmin && (
        <section className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <Users className="size-4 text-amber-300" />
            <h2 className="text-sm font-semibold uppercase tracking-wider text-text-secondary">
              Administrar usuarios
            </h2>
          </div>
          <div className="space-y-1">
            {loadingUsers && (
              <p className="text-xs text-text-muted px-1 animate-pulse">Cargando usuarios...</p>
            )}
            {adminUsers.map((u) => (
              <div
                key={u.id}
                className="flex items-center gap-4 p-4 rounded-xl border border-border-faint bg-bg-surface transition-all"
              >
                <div className={cn(
                  'size-10 rounded-lg grid place-items-center shrink-0 border',
                  u.isAdmin ? 'bg-violet-500/10 border-violet-500/20' : 'bg-bg-surface-2 border-border-faint',
                )}>
                  {u.isAdmin
                    ? <Crown className="size-4 text-violet-300" />
                    : <User className="size-4 text-text-tertiary" />
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-medium">{u.username}</h3>
                    {u.isAdmin && (
                      <span className="text-[10px] font-mono uppercase tracking-wider text-violet-300 bg-violet-500/10 px-1.5 py-0.5 rounded">
                        admin
                      </span>
                    )}
                    {u.id === me?.id && (
                      <span className="text-[10px] font-mono uppercase tracking-wider text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                        t&uacute;
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-text-tertiary mt-0.5">
                    Registro: {fmtDate(u.createdAt)} &middot; {u.lastLoginAt ? `Activo ${timeAgo(u.lastLoginAt)}` : 'Sin login'}
                  </p>
                </div>
                {u.id !== me?.id && (
                  <Button
                    variant={u.isAdmin ? 'danger' : 'outline'}
                    size="sm"
                    loading={togglingUserId === u.id}
                    onClick={() => toggleAdmin(u.id, u.isAdmin)}
                  >
                    {u.isAdmin ? 'Revocar admin' : 'Dar admin'}
                  </Button>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
