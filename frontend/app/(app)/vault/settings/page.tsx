'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Shield, KeyRound, Monitor, Lock, Bell, Palette, HardDrive,
  ChevronRight, AlertTriangle, Check, Fingerprint, Smartphone,
  Globe, Trash2, Download,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/lib/auth-store';
import { cn } from '@/lib/utils';

interface Device {
  id: string;
  name: string;
  browser: string;
  os: string;
  lastSeen: string;
  current: boolean;
  ip: string;
}

const MOCK_DEVICES: Device[] = [
  { id: '1', name: 'Este dispositivo', browser: 'Chrome 126', os: 'Windows 10', lastSeen: 'Ahora', current: true, ip: '82.45.xxx.xxx' },
  { id: '2', name: 'MacBook Pro', browser: 'Safari 18', os: 'macOS 15', lastSeen: 'Hace 2 horas', current: false, ip: '91.12.xxx.xxx' },
  { id: '3', name: 'iPhone 16', browser: 'Safari Mobile', os: 'iOS 19', lastSeen: 'Hace 3 días', current: false, ip: '82.45.xxx.xxx' },
];

export default function SettingsPage() {
  const { username } = useAuth();
  const [totpEnabled, setTotpEnabled] = useState(true);
  const [passkeysEnabled, setPasskeysEnabled] = useState(false);
  const [emailNotifications, setEmailNotifications] = useState(true);

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
          <Button variant="danger" size="sm" onClick={() => toast.info('Cerrando otras sesiones…')}>
            Cerrar otras sesiones
          </Button>
        </div>
        <div className="space-y-1">
          {MOCK_DEVICES.map((device) => (
            <div
              key={device.id}
              className="flex items-center gap-4 p-4 rounded-xl border border-[var(--color-border-faint)] bg-[var(--color-bg-surface)] hover:border-[var(--color-border-subtle)] transition-all"
            >
              <div className={cn(
                'size-10 rounded-lg grid place-items-center shrink-0',
                device.current ? 'bg-emerald-500/10 border border-emerald-500/20' : 'bg-[var(--color-bg-surface-2)] border border-[var(--color-border-faint)]',
              )}>
                {device.os.includes('iOS') || device.os.includes('Android')
                  ? <Smartphone className={cn('size-4', device.current ? 'text-emerald-300' : 'text-[var(--color-text-tertiary)]')} />
                  : <Monitor className={cn('size-4', device.current ? 'text-emerald-300' : 'text-[var(--color-text-tertiary)]')} />
                }
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-medium">{device.name}</h3>
                  {device.current && (
                    <span className="text-[10px] font-mono uppercase tracking-wider text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                      actual
                    </span>
                  )}
                </div>
                <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">
                  {device.browser} · {device.os} · <span className="font-mono">{device.ip}</span>
                </p>
                <span className="text-[10px] text-[var(--color-text-muted)] font-mono uppercase tracking-wider">
                  {device.lastSeen}
                </span>
              </div>
              {!device.current && (
                <Button variant="ghost" size="sm" onClick={() => toast.success('Sesión revocada')}>
                  Revocar
                </Button>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Storage */}
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
              <span className="text-2xl font-mono font-medium">1.2 GB</span>
              <span className="text-sm text-[var(--color-text-tertiary)] ml-1">de 10 GB</span>
            </div>
            <span className="text-[10px] font-mono text-[var(--color-text-muted)] uppercase tracking-wider">
              Plan gratuito
            </span>
          </div>
          <div className="h-2 bg-[var(--color-bg-surface-2)] rounded-full overflow-hidden mb-4">
            <div className="h-full bg-gradient-to-r from-violet-600 to-violet-400 rounded-full" style={{ width: '12%' }} />
          </div>
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: 'Documentos', size: '480 MB', pct: 40, color: 'bg-violet-500' },
              { label: 'Imágenes', size: '320 MB', pct: 27, color: 'bg-blue-500' },
              { label: 'Vídeos', size: '280 MB', pct: 23, color: 'bg-cyan-500' },
              { label: 'Otros', size: '120 MB', pct: 10, color: 'bg-slate-500' },
            ].map((cat) => (
              <div key={cat.label} className="text-center">
                <div className={cn('h-1 rounded-full mb-2', cat.color)} style={{ width: `${cat.pct}%`, minWidth: '20%', margin: '0 auto' }} />
                <span className="text-[10px] text-[var(--color-text-tertiary)] uppercase tracking-wider block">{cat.label}</span>
                <span className="text-xs font-mono text-[var(--color-text-secondary)]">{cat.size}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

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
