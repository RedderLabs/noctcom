'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import {
  Boxes,
  Container,
  Cpu,
  Database,
  Github,
  HardDrive,
  Layers,
  ShieldCheck,
  Terminal as TerminalIcon,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { CommandBlock } from './CommandBlock';

// Comandos: idénticos en cualquier idioma, viven en el código (no en i18n).
const INSTALL_CMD =
  'bash <(curl -fsSL https://raw.githubusercontent.com/RedderLabs/noctcom/main/proxmox/noctcom-lxc.sh)';
const UPDATE_CMD = "pct exec <CTID> -- bash -lc 'cd /opt/noctcom && bash update.sh'";
const STATUS_CMD = "pct exec <CTID> -- bash -lc 'cd /opt/noctcom && docker compose ps'";
const LOGS_CMD = "pct exec <CTID> -- bash -lc 'cd /opt/noctcom && docker compose logs -f backend'";

const strong = (c: ReactNode) => <strong className="text-text-primary font-medium">{c}</strong>;

const WHAT_KEYS = [
  { key: 'lxc', icon: Container },
  { key: 'docker', icon: Boxes },
  { key: 'stack', icon: Layers },
] as const;

const REQ_KEYS = [
  { key: 'host', icon: ShieldCheck },
  { key: 'cpu', icon: Cpu },
  { key: 'ram', icon: Zap },
  { key: 'disk', icon: HardDrive },
] as const;

// Nodos del stack del LXC — nombres propios, no traducibles.
const STACK_NODES = [
  { name: 'PostgreSQL', roleKey: 'db', icon: Database },
  { name: 'Redis', roleKey: 'cache', icon: Database },
  { name: 'MinIO', roleKey: 'storage', icon: HardDrive },
  { name: 'Backend', roleKey: 'api', icon: Boxes },
  { name: 'Frontend', roleKey: 'web', icon: Layers },
  { name: 'Caddy', roleKey: 'tls', icon: ShieldCheck },
] as const;

// Variables más útiles para personalizar — el resto, en la guía completa.
const VAR_ROWS = [
  { name: 'NOCTCOM_RAM', def: '4096', descKey: 'ram' },
  { name: 'NOCTCOM_DOMAIN', def: '—', descKey: 'domain' },
  { name: 'NOCTCOM_EMAIL', def: '—', descKey: 'email' },
  { name: 'NOCTCOM_CORES', def: '2', descKey: 'cores' },
  { name: 'NOCTCOM_DISK', def: '20', descKey: 'disk' },
  { name: 'NOCTCOM_NONINTERACTIVE', def: '0', descKey: 'noninteractive' },
] as const;

const FAQ_KEYS = ['notHost', 'oom', 'domain', 'ip'] as const;

/**
 * Bloque premium de instalación en Proxmox VE (LXC). Se renderiza sobre la
 * guía markdown en /self-host. Contenido derivado de docs/INSTALL_PROXMOX.md.
 */
export function ProxmoxInstall() {
  const t = useTranslations('selfhostProxmox');

  return (
    <section
      aria-labelledby="proxmox-heading"
      className="relative mb-14 motion-safe:animate-[fadeIn_0.5s_ease-out]"
    >
      {/* ── Cabecera ───────────────────────────────────────── */}
      <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md bg-violet-500/10 border border-violet-500/20 mb-4">
        <Container className="size-3.5 text-violet-300" aria-hidden />
        <span className="text-xs text-violet-300 font-medium font-mono tracking-wide">
          {t('badge')}
        </span>
      </div>
      <h2
        id="proxmox-heading"
        className="font-display text-3xl md:text-4xl font-light tracking-tight leading-[1.1] mb-3"
      >
        {t('title')}
      </h2>
      <p className="text-text-secondary leading-relaxed max-w-xl mb-7">
        {t.rich('subtitle', { strong })}
      </p>

      {/* ── Comando estrella ───────────────────────────────── */}
      <CommandBlock
        label={t('installLabel')}
        comment={t('installComment')}
        command={INSTALL_CMD}
        className="mb-3"
      />
      <p className="text-xs text-text-muted leading-relaxed mb-10">{t('installNote')}</p>

      {/* ── Qué hace ───────────────────────────────────────── */}
      <h3 className="font-display text-lg font-medium tracking-tight mb-4">{t('what.title')}</h3>
      <div className="grid sm:grid-cols-3 gap-3 mb-12">
        {WHAT_KEYS.map(({ key, icon: Icon }) => (
          <div
            key={key}
            className="p-4 rounded-xl border border-border-faint bg-bg-surface hover:border-border-subtle transition-colors duration-200"
          >
            <div className="size-8 rounded-lg bg-violet-500/10 border border-violet-500/20 grid place-items-center mb-3">
              <Icon className="size-4 text-violet-300" aria-hidden />
            </div>
            <h4 className="font-medium text-sm mb-1 tracking-tight">{t(`what.${key}.title`)}</h4>
            <p className="text-sm text-text-tertiary leading-relaxed">{t(`what.${key}.body`)}</p>
          </div>
        ))}
      </div>

      {/* ── Requisitos ─────────────────────────────────────── */}
      <h3 className="font-display text-lg font-medium tracking-tight mb-4">{t('req.title')}</h3>
      <div className="flex flex-wrap gap-2.5 mb-3">
        {REQ_KEYS.map(({ key, icon: Icon }) => (
          <div
            key={key}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border-faint bg-bg-surface"
          >
            <Icon className="size-3.5 text-violet-300 shrink-0" aria-hidden />
            <span className="text-sm text-text-secondary">{t(`req.${key}`)}</span>
          </div>
        ))}
      </div>
      <div className="flex items-start gap-2 rounded-lg border border-warning/25 bg-warning/5 px-3.5 py-2.5 mb-12">
        <Zap className="size-4 text-warning shrink-0 mt-0.5" aria-hidden />
        <p className="text-sm text-text-secondary leading-relaxed">{t('req.ramWarning')}</p>
      </div>

      {/* ── Diagrama del stack ─────────────────────────────── */}
      <h3 className="font-display text-lg font-medium tracking-tight mb-1.5">{t('stack.title')}</h3>
      <p className="text-sm text-text-tertiary leading-relaxed mb-4 max-w-xl">{t('stack.subtitle')}</p>
      <div className="relative rounded-2xl border border-border-subtle bg-bg-surface p-5 md:p-6 mb-12 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-violet-500/[0.04] via-transparent to-violet-500/[0.04] pointer-events-none" />
        <div className="relative">
          <div className="flex items-center gap-2 mb-4">
            <Container className="size-4 text-violet-300" aria-hidden />
            <span className="font-mono text-xs text-text-secondary">{t('stack.containerLabel')}</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            {STACK_NODES.map(({ name, roleKey, icon: Icon }) => (
              <div
                key={name}
                className="flex items-center gap-2.5 rounded-lg border border-border-faint bg-bg-deep/60 px-3 py-2.5"
              >
                <Icon className="size-4 text-violet-300/80 shrink-0" aria-hidden />
                <div className="min-w-0">
                  <div className="font-mono text-xs text-text-primary truncate">{name}</div>
                  <div className="text-[11px] text-text-muted truncate">
                    {t(`stack.roles.${roleKey}`)}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-text-muted leading-relaxed mt-4 flex items-center gap-1.5">
            <ShieldCheck className="size-3.5 text-success shrink-0" aria-hidden />
            {t('stack.note')}
          </p>
        </div>
      </div>

      {/* ── Variables de entorno ───────────────────────────── */}
      <h3 className="font-display text-lg font-medium tracking-tight mb-1.5">{t('vars.title')}</h3>
      <p className="text-sm text-text-tertiary leading-relaxed mb-4 max-w-xl">{t('vars.subtitle')}</p>
      <div className="overflow-hidden rounded-xl border border-border-faint bg-bg-surface mb-12">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border-faint text-left">
              <th className="px-4 py-2.5 font-medium text-text-tertiary text-xs uppercase tracking-wider">
                {t('vars.colVar')}
              </th>
              <th className="px-4 py-2.5 font-medium text-text-tertiary text-xs uppercase tracking-wider">
                {t('vars.colDefault')}
              </th>
              <th className="px-4 py-2.5 font-medium text-text-tertiary text-xs uppercase tracking-wider">
                {t('vars.colDesc')}
              </th>
            </tr>
          </thead>
          <tbody>
            {VAR_ROWS.map(({ name, def, descKey }) => (
              <tr key={name} className="border-b border-border-faint/60 last:border-0">
                <td className="px-4 py-2.5 align-top">
                  <code className="font-mono text-xs text-violet-200 whitespace-nowrap">{name}</code>
                </td>
                <td className="px-4 py-2.5 align-top">
                  <code className="font-mono text-xs text-text-muted">{def}</code>
                </td>
                <td className="px-4 py-2.5 align-top text-text-secondary leading-relaxed">
                  {t(`vars.rows.${descKey}`)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Mantenimiento ──────────────────────────────────── */}
      <h3 className="font-display text-lg font-medium tracking-tight mb-1.5">{t('maint.title')}</h3>
      <p className="text-sm text-text-tertiary leading-relaxed mb-4 max-w-xl">{t('maint.subtitle')}</p>
      <div className="space-y-3 mb-12">
        <CommandBlock label={t('maint.updateLabel')} comment={t('maint.updateComment')} command={UPDATE_CMD} />
        <CommandBlock label={t('maint.statusLabel')} comment={t('maint.statusComment')} command={STATUS_CMD} />
        <CommandBlock label={t('maint.logsLabel')} comment={t('maint.logsComment')} command={LOGS_CMD} />
      </div>

      {/* ── FAQ ────────────────────────────────────────────── */}
      <h3 className="font-display text-lg font-medium tracking-tight mb-4">{t('faq.title')}</h3>
      <div className="space-y-2.5 mb-12">
        {FAQ_KEYS.map((key) => (
          <details
            key={key}
            className="group rounded-xl border border-border-faint bg-bg-surface overflow-hidden"
          >
            <summary className="flex items-center justify-between gap-3 cursor-pointer list-none px-4 py-3.5 text-sm font-medium text-text-primary hover:bg-bg-surface-2 transition-colors">
              <span>{t(`faq.${key}.q`)}</span>
              <span
                className="size-5 shrink-0 grid place-items-center text-text-muted transition-transform duration-200 group-open:rotate-45"
                aria-hidden
              >
                +
              </span>
            </summary>
            <div className="px-4 pb-4 -mt-1 text-sm text-text-secondary leading-relaxed">
              {t(`faq.${key}.a`)}
            </div>
          </details>
        ))}
      </div>

      {/* ── Cierre ─────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3 pb-4">
        <a href="https://github.com/RedderLabs/noctcom" target="_blank" rel="noopener noreferrer">
          <Button variant="primary" size="md" leftIcon={<Github className="size-4" />}>
            {t('cta.github')}
          </Button>
        </a>
        <a href="#guia-completa">
          <Button variant="outline" size="md" leftIcon={<TerminalIcon className="size-4" />}>
            {t('cta.guide')}
          </Button>
        </a>
      </div>

      {/* Separador hacia la guía markdown completa de abajo */}
      <div className="mt-2 pt-8 border-t border-border-faint">
        <p className="text-xs text-text-muted uppercase tracking-wider font-mono">{t('fullGuideLabel')}</p>
      </div>
    </section>
  );
}
