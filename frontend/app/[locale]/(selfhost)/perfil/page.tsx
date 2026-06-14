'use client';

import { useEffect, useState, type ComponentType } from 'react';
import { useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/navigation';
import {
  Fingerprint, Copy, Check, Crown, Users, FileText, Share2, Server,
  Shield, ShieldCheck, LogOut,
} from 'lucide-react';
import { useAuth } from '@/lib/auth-store';
import { useVault } from '@/lib/vault-store';
import { apiFetch } from '@/lib/api';
import { copyText } from '@/lib/clipboard';
import { formatBytes } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { PageHeader, SectionHead } from '@/components/selfhost/PageHeader';
import { StackChips } from '@/components/selfhost/StackChips';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { LanguageSwitcher } from '@/components/ui/LanguageSwitcher';

interface MeData {
  id: string; username: string; isAdmin: boolean;
  storageQuotaBytes: number; storageUsedBytes: number;
}
interface AdminUser {
  id: string; username: string; isAdmin: boolean;
  createdAt: string; lastLoginAt: string | null;
}
interface AdminMetrics {
  users: {
    total: number; new7d: number; new30d: number;
    active7d: number; active30d: number; verified: number; with2fa: number;
  };
  storageUsedBytes: number; files: number; shares: number; agents: number;
  plans: Record<string, number>;
}

function fmtDate(s: string | null, fallback: string): string {
  if (!s) return fallback;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? fallback : d.toLocaleDateString();
}

export default function PerfilPage() {
  const t = useTranslations('selfhost');
  const router = useRouter();
  const { username, identityPublicKey, logout } = useAuth();
  const { storageUsed, storageQuota, reset: resetVault } = useVault();

  const [me, setMe] = useState<MeData | null>(null);
  const [fingerprint, setFingerprint] = useState('');
  const [copied, setCopied] = useState(false);
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);

  useEffect(() => {
    apiFetch<MeData>('/api/v1/auth/me').then(setMe).catch(() => {});
  }, []);

  // Huella de la clave pública de identidad (ed25519), SHA-256 en bloques de 4.
  useEffect(() => {
    if (!identityPublicKey) return;
    crypto.subtle.digest('SHA-256', identityPublicKey as BufferSource).then((buf) => {
      const hex = Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
      setFingerprint('SHA256:' + (hex.match(/.{1,4}/g)?.slice(0, 8).join(' ') ?? hex));
    });
  }, [identityPublicKey]);

  const isAdmin = me?.isAdmin ?? false;

  // Datos de administración: solo si el usuario es admin (el operador del LXC).
  useEffect(() => {
    if (!isAdmin) return;
    apiFetch<AdminMetrics>('/api/v1/admin/metrics').then(setMetrics).catch(() => {});
    apiFetch<AdminUser[]>('/api/v1/admin/users').then(setUsers).catch(() => {});
  }, [isAdmin]);

  const copyFp = async () => {
    if (await copyText(fingerprint)) { setCopied(true); setTimeout(() => setCopied(false), 1500); }
  };

  const signOut = () => { resetVault(); logout(); router.push('/login'); };

  const used = storageUsed || me?.storageUsedBytes || 0;
  const quota = storageQuota || me?.storageQuotaBytes || 0;
  const pct = quota > 0 ? Math.min(100, (used / quota) * 100) : 0;

  return (
    <>
      <PageHeader crumbs={['cuenta', username ?? '—']} title={t('profile.title')} />

      {/* ─── Identidad ─── */}
      <div className="rounded-xl border border-border-faint bg-bg-surface p-5 flex items-center gap-4">
        <span className="size-14 rounded-full bg-gradient-to-br from-violet-400 to-violet-600 grid place-items-center text-xl font-semibold shrink-0">
          {username?.[0]?.toUpperCase() ?? '?'}
        </span>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-lg font-semibold truncate">{username ?? '—'}</h2>
            {isAdmin && (
              <span className="inline-flex items-center gap-1 text-[11px] text-violet-300 bg-violet-500/10 border border-border-strong px-2 py-0.5 rounded-full">
                <Crown className="size-3" />{t('profile.admin')}
              </span>
            )}
          </div>
          <p className="text-xs text-text-tertiary mt-0.5">{isAdmin ? t('profile.roleAdmin') : t('profile.roleUser')}</p>
        </div>
        <Button variant="ghost" size="sm" className="ml-auto shrink-0" onClick={signOut}>
          <LogOut className="size-3.5 mr-1.5" />{t('profile.signOut')}
        </Button>
      </div>

      {/* ─── Identidad criptográfica ─── */}
      <SectionHead title={t('profile.identityTitle')} meta={<span className="font-mono">ed25519</span>} />
      <div className="rounded-xl border border-border-faint bg-bg-surface p-5">
        <div className="flex items-center gap-3 p-3 rounded-lg bg-bg-deep border border-border-faint">
          <Fingerprint className="size-[18px] text-violet-300 shrink-0" />
          <div className="min-w-0">
            <div className="font-mono text-[10px] text-text-muted uppercase tracking-wider">{t('profile.fpLabel')}</div>
            <div className="font-mono text-xs text-text-secondary truncate">{fingerprint || '—'}</div>
          </div>
          <Button variant="ghost" size="sm" className="ml-auto shrink-0" onClick={copyFp} aria-label={t('profile.copyFp')}>
            {copied ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />}
          </Button>
        </div>
        <Link href={'/seguridad' as any} className="inline-flex items-center gap-1.5 mt-3 text-xs text-violet-300 hover:text-violet-200">
          <Shield className="size-3.5" />{t('profile.toSecurity')}
        </Link>
      </div>

      {/* ─── Uso ─── */}
      <SectionHead title={t('profile.usageTitle')} meta={<span className="font-mono">{Math.round(pct)}%</span>} />
      <div className="rounded-xl border border-border-faint bg-bg-surface p-5">
        <div className="flex items-baseline gap-2 mb-3 flex-wrap">
          <span className="text-2xl font-semibold tracking-tight font-mono">{formatBytes(used)}</span>
          <span className="text-sm text-text-tertiary">{t('shell.of')} {formatBytes(quota)}</span>
        </div>
        <div className="h-2 bg-bg-surface-2 rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-violet-500 to-violet-400 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {/* ─── Preferencias ─── */}
      <SectionHead title={t('profile.prefsTitle')} />
      <div className="rounded-xl border border-border-faint bg-bg-surface p-5 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold">{t('profile.prefsAppearance')}</h3>
          <p className="text-xs text-text-tertiary mt-1">{t('profile.prefsSub')}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <ThemeToggle />
          <LanguageSwitcher />
        </div>
      </div>

      {/* ─── Administración del servidor (solo admin) ─── */}
      {isAdmin && (
        <>
          <SectionHead title={t('profile.adminTitle')} meta={<span className="font-mono">{t('profile.adminMeta')}</span>} />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Stat icon={Users} label={t('profile.mUsers')} value={metrics?.users.total}
              sub={metrics ? t('profile.mActive', { n: metrics.users.active30d }) : undefined} />
            <Stat icon={FileText} label={t('profile.mFiles')} value={metrics?.files} />
            <Stat icon={Share2} label={t('profile.mShares')} value={metrics?.shares} />
            <Stat icon={Server} label={t('profile.mAgents')} value={metrics?.agents} />
          </div>

          <SectionHead title={t('profile.usersTitle')} meta={<span className="font-mono">{users.length}</span>} />
          <div className="rounded-xl border border-border-faint bg-bg-surface overflow-hidden">
            {users.length === 0 && (
              <div className="px-5 py-8 text-center text-sm text-text-tertiary">{t('profile.noUsers')}</div>
            )}
            {users.map((u) => (
              <div key={u.id} className="flex items-center gap-3 px-5 py-3.5 border-b border-border-faint last:border-0">
                <span className="size-8 rounded-full bg-bg-surface-2 border border-border-faint grid place-items-center text-xs font-medium shrink-0">
                  {u.username?.[0]?.toUpperCase() ?? '?'}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium flex items-center gap-2">
                    {u.username}
                    {u.isAdmin && <span className="text-[10px] text-violet-300 bg-violet-500/10 px-1.5 py-0.5 rounded">{t('profile.admin')}</span>}
                  </div>
                  <div className="text-[11px] text-text-muted font-mono">
                    {t('profile.memberSince')} {fmtDate(u.createdAt, '—')} · {t('profile.lastLogin')} {fmtDate(u.lastLoginAt, t('profile.never'))}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <SectionHead title={t('profile.stackTitle')} meta={<span className="font-mono">ct · docker</span>} />
          <StackChips />
        </>
      )}

      <p className="flex items-center gap-2.5 mt-4 px-0.5 text-[12.5px] text-text-tertiary">
        <ShieldCheck className="size-[15px] text-violet-300 shrink-0" />
        <span>{t.rich('profile.note', { b: (c) => <b className="text-text-secondary font-semibold">{c}</b> })}</span>
      </p>
    </>
  );
}

function Stat({ icon: Icon, label, value, sub }: {
  icon: ComponentType<{ className?: string }>;
  label: string; value: number | undefined; sub?: string;
}) {
  return (
    <div className="rounded-xl border border-border-faint bg-bg-surface p-4">
      <div className="flex items-center gap-2 text-text-tertiary mb-2">
        <Icon className="size-4" /><span className="text-xs">{label}</span>
      </div>
      <div className="text-2xl font-semibold tracking-tight font-mono">{value ?? '—'}</div>
      {sub && <div className="text-[11px] text-text-muted mt-0.5">{sub}</div>}
    </div>
  );
}
