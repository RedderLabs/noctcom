'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  KeyRound, ShieldCheck, Fingerprint, Copy, Check, Monitor, Smartphone, Server,
  Usb, ShieldAlert,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/lib/auth-store';
import { apiFetch } from '@/lib/api';
import { copyText } from '@/lib/clipboard';
import { fromB64, decryptString } from '@/lib/crypto';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { PageHeader, SectionHead } from '@/components/selfhost/PageHeader';
import { StackChips } from '@/components/selfhost/StackChips';

interface ApiDevice {
  id: string; nameEncrypted: string; nameNonce: string;
  lastSeenAt: string | null; createdAt: string; isCurrent: boolean;
}
interface RecoveryStatus { recoveryEnabled: boolean; vaultsTotal: number; vaultsSealed: number; }
interface PasskeyView { id: string; nickname: string | null; created_at: string; }

function parseDevice(raw: string): { browser: string; os: string } {
  let browser = 'Navegador';
  if (raw.includes('Firefox/')) browser = `Firefox ${raw.split('Firefox/')[1]?.split(' ')[0] ?? ''}`;
  else if (raw.includes('Edg/')) browser = `Edge ${raw.split('Edg/')[1]?.split(' ')[0] ?? ''}`;
  else if (raw.includes('Chrome/')) browser = `Chrome ${raw.split('Chrome/')[1]?.split(' ')[0] ?? ''}`;
  else if (raw.includes('Safari/') && !raw.includes('Chrome')) browser = 'Safari';
  let os = '—';
  if (raw.includes('Windows')) os = 'Windows';
  else if (raw.includes('Mac OS X')) os = 'macOS';
  else if (raw.includes('Android')) os = 'Android';
  else if (raw.includes('iPhone') || raw.includes('iPad')) os = 'iOS';
  else if (raw.includes('Linux')) os = 'Linux';
  return { browser, os };
}

function deviceIcon(os: string) {
  if (os === 'Android' || os === 'iOS') return Smartphone;
  if (os === 'Linux') return Server;
  return Monitor;
}

export default function SeguridadPage() {
  const t = useTranslations('selfhost');
  const { username, identityPublicKey, masterKey } = useAuth();
  const [fingerprint, setFingerprint] = useState('');
  const [copied, setCopied] = useState(false);
  const [devices, setDevices] = useState<{ id: string; browser: string; os: string; isCurrent: boolean }[]>([]);
  const [recovery, setRecovery] = useState<RecoveryStatus | null>(null);
  const [passkeys, setPasskeys] = useState<PasskeyView[]>([]);

  // Huella de la clave pública de identidad (ed25519), SHA-256 en bloques de 4.
  useEffect(() => {
    if (!identityPublicKey) return;
    crypto.subtle.digest('SHA-256', identityPublicKey as BufferSource).then((buf) => {
      const hex = Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
      setFingerprint('SHA256:' + (hex.match(/.{1,4}/g)?.slice(0, 8).join(' ') ?? hex));
    });
  }, [identityPublicKey]);

  const fetchDevices = useCallback(async () => {
    if (!masterKey) return;
    try {
      const raw = await apiFetch<ApiDevice[]>('/api/v1/auth/devices');
      setDevices(raw.map((d) => {
        let parsed = { browser: 'Dispositivo', os: '—' };
        try { parsed = parseDevice(decryptString(fromB64(d.nameEncrypted), fromB64(d.nameNonce), masterKey)); } catch { /* */ }
        return { id: d.id, ...parsed, isCurrent: d.isCurrent };
      }));
    } catch { /* */ }
  }, [masterKey]);

  useEffect(() => {
    fetchDevices();
    apiFetch<RecoveryStatus>('/api/v1/2fa/recovery/status').then(setRecovery).catch(() => {});
    apiFetch<{ passkeys: PasskeyView[] }>('/api/v1/2fa/webauthn').then((r) => setPasskeys(r.passkeys)).catch(() => {});
  }, [fetchDevices]);

  const copyFingerprint = async () => {
    if (await copyText(fingerprint)) {
      setCopied(true); setTimeout(() => setCopied(false), 1500);
    }
  };

  const revokeOthers = async () => {
    try { await apiFetch('/api/v1/auth/devices', { method: 'DELETE' }); toast.success(t('security.othersClosed')); fetchDevices(); }
    catch { toast.error(t('security.revokeError')); }
  };
  const revoke = async (id: string) => {
    try { await apiFetch(`/api/v1/auth/devices/${id}`, { method: 'DELETE' }); toast.success(t('security.sessionClosed')); fetchDevices(); }
    catch { toast.error(t('security.revokeError')); }
  };

  return (
    <>
      <PageHeader crumbs={['cuenta', username ?? '—']} title={t('security.title')} />

      {/* ─── Clave de cifrado ─── */}
      <SectionHead title={t('security.keyTitle')} meta={<span className="font-mono">{t('security.argon')}</span>} />
      <div className="rounded-xl border border-border-faint bg-bg-surface p-5">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h3 className="text-sm font-semibold">{t('security.masterKey')}</h3>
            <p className="text-xs text-text-tertiary mt-1">{t('security.masterKeySub')}</p>
          </div>
          <span className="inline-flex items-center gap-1 text-xs text-success bg-success/10 px-2 py-1 rounded-full shrink-0"><Check className="size-3" />{t('security.active')}</span>
        </div>
        <div className="flex items-center gap-3 p-3 rounded-lg bg-bg-deep border border-border-faint">
          <Fingerprint className="size-[18px] text-violet-300 shrink-0" />
          <div className="min-w-0">
            <div className="font-mono text-[10px] text-text-muted uppercase tracking-wider">{t('security.fpLabel')}</div>
            <div className="font-mono text-xs text-text-secondary truncate">{fingerprint || '—'}</div>
          </div>
          <Button variant="ghost" size="sm" className="ml-auto shrink-0" onClick={copyFingerprint} aria-label={t('security.copyFp')}>
            {copied ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />}
          </Button>
        </div>
      </div>

      {/* ─── Recuperación + Passkeys ─── */}
      <SectionHead title={t('security.accessTitle')} />
      <div className="grid sm:grid-cols-2 gap-3">
        <div className="rounded-xl border border-border-faint bg-bg-surface p-5">
          <div className="flex items-center gap-2.5 mb-2">
            <KeyRound className="size-4 text-violet-300" />
            <h3 className="text-sm font-semibold">{t('security.recovery')}</h3>
          </div>
          {recovery ? (
            recovery.recoveryEnabled ? (
              <p className="text-xs text-text-tertiary">{t('security.recoveryOn', { sealed: recovery.vaultsSealed, total: recovery.vaultsTotal })}</p>
            ) : (
              <p className="text-xs text-amber-400/90 flex items-start gap-1.5"><ShieldAlert className="size-3.5 mt-0.5 shrink-0" />{t('security.recoveryOff')}</p>
            )
          ) : <p className="text-xs text-text-muted">…</p>}
        </div>
        <div className="rounded-xl border border-border-faint bg-bg-surface p-5">
          <div className="flex items-center gap-2.5 mb-2">
            <Usb className="size-4 text-violet-300" />
            <h3 className="text-sm font-semibold">{t('security.passkeys')}</h3>
          </div>
          <p className="text-xs text-text-tertiary">{t('security.passkeysCount', { count: passkeys.length })}</p>
        </div>
      </div>

      {/* ─── Sesiones ─── */}
      <SectionHead
        title={t('security.sessions')}
        meta={devices.length > 1 ? <button onClick={revokeOthers} className="text-violet-300 hover:text-violet-200">{t('security.closeOthers')}</button> : undefined}
      />
      <div className="rounded-xl border border-border-faint bg-bg-surface overflow-hidden">
        {devices.length === 0 && <div className="px-5 py-8 text-center text-sm text-text-tertiary">{t('security.noSessions')}</div>}
        {devices.map((d) => {
          const Icon = deviceIcon(d.os);
          return (
            <div key={d.id} className="flex items-center gap-3 px-5 py-3.5 border-b border-border-faint last:border-0">
              <span className="size-9 rounded-lg grid place-items-center bg-bg-surface-2 border border-border-faint shrink-0"><Icon className="size-4 text-text-secondary" /></span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium flex items-center gap-2">
                  {d.browser} · {d.os}
                  {d.isCurrent && <span className="text-[10px] text-success bg-success/10 px-1.5 py-0.5 rounded">{t('security.thisSession')}</span>}
                </div>
              </div>
              {!d.isCurrent && <Button variant="ghost" size="sm" onClick={() => revoke(d.id)}>{t('security.close')}</Button>}
            </div>
          );
        })}
      </div>

      {/* ─── Salud del stack ─── */}
      <SectionHead title={t('security.stackHealth')} />
      <StackChips />
      <p className="flex items-center gap-2.5 mt-3.5 px-0.5 text-[12.5px] text-text-tertiary">
        <ShieldCheck className="size-[15px] text-violet-300 shrink-0" />
        <span>{t.rich('security.stackNote', { b: (c) => <b className="text-text-secondary font-semibold">{c}</b> })}</span>
      </p>
    </>
  );
}
