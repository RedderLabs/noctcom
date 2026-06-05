'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Link } from '@/i18n/navigation';
import {
  User, Shield, ShieldCheck, Monitor, Smartphone, HardDrive,
  Clock, Calendar, Settings, KeyRound, Fingerprint, Mail, MailCheck,
  Users, Crown, BarChart3,
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

// Agregados del servidor — nunca datos individuales (privacy by design).
interface AdminMetrics {
  users: {
    total: number; new7d: number; new30d: number;
    active7d: number; active30d: number; verified: number; with2fa: number;
  };
  storageUsedBytes: number;
  files: number;
  shares: number;
  agents: number;
  plans: Record<string, number>;
}

type TFn = (key: string, values?: Record<string, string | number>) => string;

function parseDeviceName(raw: string, t: TFn): { browser: string; os: string } {
  let browser = t('browserFallback');
  if (raw.includes('Firefox/')) browser = `Firefox ${raw.split('Firefox/')[1]?.split(' ')[0] ?? ''}`;
  else if (raw.includes('Edg/')) browser = `Edge ${raw.split('Edg/')[1]?.split(' ')[0] ?? ''}`;
  else if (raw.includes('Chrome/')) browser = `Chrome ${raw.split('Chrome/')[1]?.split(' ')[0] ?? ''}`;
  else if (raw.includes('Safari/') && !raw.includes('Chrome')) browser = 'Safari';

  let os = t('osUnknown');
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

function timeAgo(iso: string | null, t: TFn): string {
  if (!iso) return t('never');
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return t('justNow');
  if (mins < 60) return t('agoMinutes', { count: mins });
  const hours = Math.floor(mins / 60);
  if (hours < 24) return t('agoHours', { count: hours });
  const days = Math.floor(hours / 24);
  return t('agoDays', { count: days });
}

function fmtDate(iso: string, locale: string): string {
  return new Date(iso).toLocaleDateString(locale, {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

export default function ProfilePage() {
  const t = useTranslations('profile');
  const locale = useLocale();
  const { username, masterKey } = useAuth();
  const { storageUsed, storageQuota } = useVault();
  const [me, setMe] = useState<MeData | null>(null);
  const [devices, setDevices] = useState<DeviceView[]>([]);
  const [loadingDevices, setLoadingDevices] = useState(true);
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [togglingUserId, setTogglingUserId] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null);

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
        let browser = t('deviceFallback');
        let os = '';
        try {
          const name = decryptString(fromB64(d.nameEncrypted), fromB64(d.nameNonce), masterKey);
          const info = parseDeviceName(name, t);
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

  useEffect(() => {
    if (!me?.isAdmin) return;
    apiFetch<AdminMetrics>('/api/v1/admin/metrics')
      .then(setMetrics)
      .catch(() => {});
  }, [me?.isAdmin]);

  const toggleAdmin = async (userId: string, current: boolean) => {
    setTogglingUserId(userId);
    try {
      await apiFetch(`/api/v1/admin/users/${userId}/role`, {
        method: 'PATCH',
        body: JSON.stringify({ isAdmin: !current }),
      });
      toast.success(current ? t('toastAdminRevoked') : t('toastAdminGranted'));
      fetchAdminUsers();
    } catch (e: any) {
      toast.error(e.message ?? t('toastRoleError'));
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
              <h1 className="font-display text-2xl font-semibold tracking-tight">{username ?? t('defaultUsername')}</h1>
              {isAdmin ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider text-violet-300 bg-violet-500/15 border border-violet-500/30 px-2 py-0.5 rounded-full">
                  <ShieldCheck className="size-3" /> {t('roleAdmin')}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider text-text-muted bg-bg-surface-2 border border-border-faint px-2 py-0.5 rounded-full">
                  <User className="size-3" /> {t('roleUser')}
                </span>
              )}
            </div>
            <p className="text-sm text-text-tertiary mt-1">{t('freePlan')}</p>
            <div className="flex items-center gap-4 mt-3 flex-wrap">
              <div className="flex items-center gap-1.5 text-xs text-text-muted">
                <Monitor className="size-3.5" />
                <span>{t('deviceCount', { count: devices.length })}</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-text-muted">
                <HardDrive className="size-3.5" />
                <span>{t('storageUsedLabel', { size: fmtSize(storageUsed) })}</span>
              </div>
            </div>
          </div>
          <Link href="/vault/settings">
            <Button variant="ghost" size="sm">
              <Settings className="size-3.5 mr-1" /> {t('settings')}
            </Button>
          </Link>
        </div>
      </div>

      {/* Storage */}
      <section className="mb-8">
        <div className="flex items-center gap-2 mb-4">
          <HardDrive className="size-4 text-amber-300" />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-text-secondary">
            {t('storageHeading')}
          </h2>
        </div>
        <div className="p-5 rounded-xl border border-border-faint bg-bg-surface">
          <div className="flex items-end justify-between mb-3">
            <div>
              <span className="text-2xl font-mono font-medium">{fmtSize(storageUsed)}</span>
              <span className="text-sm text-text-tertiary ml-1">{t('storageOf', { size: fmtSize(storageQuota) })}</span>
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
            {t('sessionsHeading')}
          </h2>
        </div>
        <div className="space-y-1">
          {loadingDevices && (
            <p className="text-xs text-text-muted px-1 animate-pulse">{t('loadingDevices')}</p>
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
                        {t('current')}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-text-tertiary mt-0.5">{device.os}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-mono text-text-muted uppercase tracking-wider">
                    {device.isCurrent ? t('now') : timeAgo(device.lastSeenAt, t)}
                  </p>
                  <p className="text-[10px] text-text-muted">
                    {t('since', { date: fmtDate(device.createdAt, locale) })}
                  </p>
                </div>
              </div>
            );
          })}
          {!loadingDevices && devices.length === 0 && (
            <p className="text-xs text-text-muted px-1">{t('noDevices')}</p>
          )}
        </div>
      </section>

      {/* Security overview */}
      <section className="mb-8">
        <div className="flex items-center gap-2 mb-4">
          <Shield className="size-4 text-violet-300" />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-text-secondary">
            {t('securityHeading')}
          </h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="p-4 rounded-xl border border-border-faint bg-bg-surface">
            <KeyRound className="size-4 text-violet-300 mb-2" />
            <p className="text-xs font-medium">{t('e2eEncryption')}</p>
            <p className="text-[10px] font-mono text-emerald-400 uppercase tracking-wider mt-1">{t('statusActive')}</p>
          </div>
          <div className="p-4 rounded-xl border border-border-faint bg-bg-surface">
            <Fingerprint className="size-4 text-violet-300 mb-2" />
            <p className="text-xs font-medium">{t('twoFaPasskey')}</p>
            <Link href="/vault/settings" className="text-[10px] font-mono text-violet-400 uppercase tracking-wider mt-1 block hover:text-violet-300 transition-colors">
              {t('configure')}
            </Link>
          </div>
          <div className="p-4 rounded-xl border border-border-faint bg-bg-surface">
            <Shield className="size-4 text-violet-300 mb-2" />
            <p className="text-xs font-medium">{t('zeroKnowledge')}</p>
            <p className="text-[10px] font-mono text-emerald-400 uppercase tracking-wider mt-1">{t('statusVerified')}</p>
          </div>
        </div>
      </section>

      {/* Admin: métricas agregadas (privacy-first: solo totales, nada individual) */}
      {isAdmin && metrics && (
        <section className="mb-8">
          <div className="flex items-center gap-2 mb-1">
            <BarChart3 className="size-4 text-amber-300" />
            <h2 className="text-sm font-semibold uppercase tracking-wider text-text-secondary">
              {t('metricsHeading')}
            </h2>
          </div>
          <p className="text-[11px] text-text-muted mb-4">{t('metricsPrivacyNote')}</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="p-4 rounded-xl border border-border-faint bg-bg-surface">
              <p className="text-2xl font-display font-semibold">{metrics.users.total}</p>
              <p className="text-[11px] text-text-tertiary mt-0.5">{t('metricsUsers')}</p>
              <p className="text-[10px] font-mono text-emerald-400 mt-1">
                +{metrics.users.new7d} · 7d &nbsp; +{metrics.users.new30d} · 30d
              </p>
            </div>
            <div className="p-4 rounded-xl border border-border-faint bg-bg-surface">
              <p className="text-2xl font-display font-semibold">{metrics.users.active7d}</p>
              <p className="text-[11px] text-text-tertiary mt-0.5">{t('metricsActive7d')}</p>
              <p className="text-[10px] font-mono text-text-muted mt-1">
                {metrics.users.active30d} · 30d
              </p>
            </div>
            <div className="p-4 rounded-xl border border-border-faint bg-bg-surface">
              <p className="text-2xl font-display font-semibold">{fmtSize(metrics.storageUsedBytes)}</p>
              <p className="text-[11px] text-text-tertiary mt-0.5">{t('metricsStorage')}</p>
              <p className="text-[10px] font-mono text-text-muted mt-1">
                {t('metricsFiles', { count: metrics.files })}
              </p>
            </div>
            <div className="p-4 rounded-xl border border-border-faint bg-bg-surface">
              <p className="text-2xl font-display font-semibold">{metrics.users.with2fa}</p>
              <p className="text-[11px] text-text-tertiary mt-0.5">{t('metrics2fa')}</p>
              <p className="text-[10px] font-mono text-text-muted mt-1">
                {t('metricsVerified', { count: metrics.users.verified })}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4 mt-3 px-1 flex-wrap text-[11px] text-text-muted">
            <span>{t('metricsShares', { count: metrics.shares })}</span>
            <span>·</span>
            <span>{t('metricsAgents', { count: metrics.agents })}</span>
            <span>·</span>
            <span>
              {Object.entries(metrics.plans)
                .map(([plan, n]) => `${plan}: ${n}`)
                .join(' · ')}
            </span>
          </div>
        </section>
      )}

      {/* Admin: user management */}
      {isAdmin && (
        <section className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <Users className="size-4 text-amber-300" />
            <h2 className="text-sm font-semibold uppercase tracking-wider text-text-secondary">
              {t('adminUsersHeading')}
            </h2>
          </div>
          <div className="space-y-1">
            {loadingUsers && (
              <p className="text-xs text-text-muted px-1 animate-pulse">{t('loadingUsers')}</p>
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
                        {t('badgeAdmin')}
                      </span>
                    )}
                    {u.id === me?.id && (
                      <span className="text-[10px] font-mono uppercase tracking-wider text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                        {t('badgeYou')}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-text-tertiary mt-0.5">
                    {t('registered', { date: fmtDate(u.createdAt, locale) })} &middot; {u.lastLoginAt ? t('activeAgo', { ago: timeAgo(u.lastLoginAt, t) }) : t('noLogin')}
                  </p>
                </div>
                {u.id !== me?.id && (
                  <Button
                    variant={u.isAdmin ? 'danger' : 'outline'}
                    size="sm"
                    loading={togglingUserId === u.id}
                    onClick={() => toggleAdmin(u.id, u.isAdmin)}
                  >
                    {u.isAdmin ? t('revokeAdmin') : t('grantAdmin')}
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
