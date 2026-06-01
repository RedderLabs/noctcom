'use client';

import { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Loader2, Copy, Check, ShieldCheck, ShieldOff } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/lib/auth-store';
import { apiFetch } from '@/lib/api';
import { generateTotpSecret, toBase32, toB64 } from '@/lib/crypto';

function genBackupCodes(n = 8): string[] {
  return Array.from({ length: n }, () => {
    const arr = crypto.getRandomValues(new Uint8Array(5));
    const hex = Array.from(arr).map((b) => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 5)}-${hex.slice(5, 10)}`.toUpperCase();
  });
}

export function TwoFactorModal({
  open, enabled, onClose, onChanged,
}: {
  open: boolean;
  enabled: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { username } = useAuth();
  const [secret, setSecret] = useState<Uint8Array | null>(null);
  const [base32, setBase32] = useState('');
  const [otpauth, setOtpauth] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open || enabled) return;
    const s = generateTotpSecret();
    const b32 = toBase32(s);
    setSecret(s); setBase32(b32); setCode(''); setBackupCodes(null);
    setOtpauth(
      `otpauth://totp/Noctcom:${encodeURIComponent(username ?? 'cuenta')}` +
      `?secret=${b32}&issuer=Noctcom&period=30&digits=6&algorithm=SHA1`,
    );
  }, [open, enabled, username]);

  if (!open) return null;

  async function handleEnable() {
    if (!secret || code.length !== 6) return;
    setBusy(true);
    try {
      const codes = genBackupCodes();
      // El secret viaja una sola vez sobre TLS; el servidor lo cifra en reposo
      // con su propia clave (independiente de la contraseña). No se envía
      // ninguna clave derivada del usuario.
      await apiFetch('/api/v1/2fa/totp/enable', {
        method: 'POST',
        body: JSON.stringify({
          secret: toB64(secret),
          initialCode: code,
          backupCodes: codes,
        }),
      });
      setBackupCodes(codes);
      toast.success('2FA activado');
      onChanged();
    } catch (err: any) {
      toast.error(
        String(err.message).includes('initial TOTP code invalid')
          ? 'Código incorrecto. Revisa la app y vuelve a intentar.'
          : `Error: ${err.message}`,
      );
    } finally { setBusy(false); }
  }

  async function handleDisable() {
    if (code.length !== 6) return;
    setBusy(true);
    try {
      await apiFetch('/api/v1/2fa/totp/disable', {
        method: 'POST',
        body: JSON.stringify({ confirmCode: code }),
      });
      toast.success('2FA desactivado');
      onChanged();
      onClose();
    } catch (err: any) {
      toast.error(`Código incorrecto o error: ${err.message}`);
    } finally { setBusy(false); }
  }

  const copyCodes = () => {
    if (!backupCodes) return;
    navigator.clipboard.writeText(backupCodes.join('\n')).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] p-6 shadow-[0_20px_60px_-12px_rgba(0,0,0,0.7)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Códigos de respaldo (tras activar) */}
        {backupCodes ? (
          <>
            <div className="flex items-center gap-2 mb-2">
              <ShieldCheck className="size-5 text-emerald-300" />
              <h3 className="font-display text-lg font-medium">2FA activado</h3>
            </div>
            <p className="text-sm text-[var(--color-text-tertiary)] mb-4">
              Guarda estos códigos de respaldo en un lugar seguro. Te permiten entrar si pierdes tu
              dispositivo. <strong className="text-amber-300">No se volverán a mostrar.</strong>
            </p>
            <div className="grid grid-cols-2 gap-2 p-3 rounded-lg bg-[var(--color-bg-deep)] border border-[var(--color-border-faint)] mb-4 font-mono text-sm">
              {backupCodes.map((c) => <span key={c} className="text-[var(--color-text-secondary)]">{c}</span>)}
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" size="sm" leftIcon={copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />} onClick={copyCodes}>
                {copied ? 'Copiado' : 'Copiar'}
              </Button>
              <Button variant="primary" size="sm" onClick={onClose}>Hecho</Button>
            </div>
          </>
        ) : enabled ? (
          /* Desactivar */
          <>
            <div className="flex items-center gap-2 mb-2">
              <ShieldOff className="size-5 text-red-400" />
              <h3 className="font-display text-lg font-medium">Desactivar 2FA</h3>
            </div>
            <p className="text-sm text-[var(--color-text-tertiary)] mb-4">
              Introduce un código actual de tu app de autenticación para confirmar.
            </p>
            <input
              inputMode="numeric" maxLength={6} value={code} autoFocus
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              className="w-full text-center tracking-[0.5em] font-mono text-xl px-3 py-3 rounded-lg border border-[var(--color-border-faint)] bg-[var(--color-bg-deep)] text-[var(--color-text-primary)] focus:outline-none focus:border-violet-500/50 mb-4"
            />
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" size="sm" onClick={onClose}>Cancelar</Button>
              <Button variant="danger" size="sm" loading={busy} disabled={code.length !== 6} onClick={handleDisable}
                className="bg-red-600 hover:bg-red-500 text-white border-red-500">
                Desactivar
              </Button>
            </div>
          </>
        ) : (
          /* Activar: QR + código */
          <>
            <h3 className="font-display text-lg font-medium mb-1">Activar 2FA</h3>
            <p className="text-sm text-[var(--color-text-tertiary)] mb-4">
              Escanea el QR con Google Authenticator, Aegis, 1Password… y luego introduce el código de 6 dígitos.
            </p>
            <div className="flex justify-center mb-3">
              {otpauth
                ? <div className="rounded-lg border border-[var(--color-border-faint)] bg-white p-2">
                    <QRCodeSVG value={otpauth} size={176} level="M" />
                  </div>
                : <div className="size-[180px] grid place-items-center"><Loader2 className="size-6 animate-spin text-violet-400" /></div>}
            </div>
            <p className="text-[10px] text-center text-[var(--color-text-muted)] mb-1">¿No puedes escanear? Introduce esta clave:</p>
            <p className="text-center font-mono text-xs text-[var(--color-text-secondary)] break-all mb-4 px-4">{base32}</p>
            <input
              inputMode="numeric" maxLength={6} value={code} autoFocus
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              className="w-full text-center tracking-[0.5em] font-mono text-xl px-3 py-3 rounded-lg border border-[var(--color-border-faint)] bg-[var(--color-bg-deep)] text-[var(--color-text-primary)] focus:outline-none focus:border-violet-500/50 mb-4"
            />
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" size="sm" onClick={onClose}>Cancelar</Button>
              <Button variant="primary" size="sm" loading={busy} disabled={code.length !== 6} onClick={handleEnable}>
                Activar
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
