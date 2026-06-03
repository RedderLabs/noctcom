'use client';

import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, AlertTriangle, HardDrive, Usb, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { apiFetch } from '@/lib/api';
import { getStepUpToken } from '@/lib/step-up';
import { useVault } from '@/lib/vault-store';

interface AgentDiskLite {
  device: string;
  path: string;
  label: string;
  totalBytes: number;
  filesystem: string;
  removable: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
  agentId: string;
  disk: AgentDiskLite | null;
  onFormatted: () => void;
}

function fmtSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0; let n = bytes;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}

/** Letra de unidad a partir del dispositivo/ruta de Windows (p.ej. "D:" → "D"). */
function driveLetterOf(disk: AgentDiskLite): string {
  const src = disk.device || disk.path || '';
  return (src.match(/[A-Za-z]/)?.[0] ?? '').toUpperCase();
}

/**
 * Formateo de un disco de la máquina del usuario a través del agente. DESTRUCTIVO
 * pero acotado: el agente solo formatea discos VACÍOS y nunca el de sistema.
 * Pide re-autenticación (step-up) y confirmación escrita de la etiqueta.
 */
export function AgentFormatModal({ open, onClose, agentId, disk, onFormatted }: Props) {
  const [label, setLabel] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [loading, setLoading] = useState(false);

  function reset() {
    setLabel('');
    setConfirmText('');
    setLoading(false);
  }
  function handleClose() {
    reset();
    onClose();
  }

  const labelValid = label.length > 0 && label.length <= 12 && /^[a-zA-Z0-9_-]+$/.test(label);
  const confirmed = labelValid && confirmText === label;

  async function handleFormat() {
    if (!disk || !confirmed) return;
    const letter = driveLetterOf(disk);
    setLoading(true);
    try {
      // Re-autenticación obligatoria antes de una operación irreversible.
      const stepUpToken = await getStepUpToken();
      await apiFetch('/api/v1/storage/disks/agent-format', {
        method: 'POST',
        headers: { 'x-step-up-token': stepUpToken },
        body: JSON.stringify({
          agentId,
          driveLetter: letter,
          label,
          confirmLabel: confirmText,
          totalBytes: disk.totalBytes,
        }),
      });
      toast.success('Disco formateado y listo para almacenar');
      onFormatted();
      // El disco queda activo → refresca el "Almacenamiento" total.
      void useVault.getState().refreshStorage();
      handleClose();
    } catch (err: any) {
      toast.error(err.message ?? 'Error al formatear el disco');
    } finally {
      setLoading(false);
    }
  }

  if (!disk) return null;

  return (
    <Dialog.Root open={open} onOpenChange={(v) => !v && handleClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-[var(--color-bg-surface)] border border-[var(--color-border-faint)] rounded-2xl p-6 z-50 shadow-2xl">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <div className="size-8 rounded-lg bg-red-500/10 border border-red-500/20 grid place-items-center">
                <AlertTriangle className="size-4 text-red-400" />
              </div>
              <Dialog.Title className="text-lg font-semibold">Formatear disco</Dialog.Title>
            </div>
            <Dialog.Close asChild>
              <button className="size-8 grid place-items-center rounded-lg hover:bg-[var(--color-bg-surface-2)] transition-colors">
                <X className="size-4" />
              </button>
            </Dialog.Close>
          </div>

          <div className="p-3 rounded-xl bg-[var(--color-bg-surface-2)] border border-[var(--color-border-faint)] mb-4">
            <div className="flex items-center gap-3">
              <div className="size-9 rounded-lg bg-[var(--color-bg-surface-3)] grid place-items-center">
                {disk.removable
                  ? <Usb className="size-4 text-amber-400" />
                  : <HardDrive className="size-4 text-[var(--color-text-tertiary)]" />}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{disk.label || disk.device}</p>
                <p className="text-xs text-[var(--color-text-tertiary)] font-mono">{disk.device}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[10px] text-[var(--color-text-muted)] font-mono">{fmtSize(disk.totalBytes)}</span>
                  <span className="text-[10px] text-[var(--color-text-muted)]">·</span>
                  <span className="text-[10px] text-amber-400 font-mono uppercase">{disk.filesystem || 'sin formato'}</span>
                  <span className="text-[10px] text-[var(--color-text-muted)]">·</span>
                  <span className="text-[10px] text-[var(--color-text-muted)] font-mono uppercase">→ NTFS</span>
                </div>
              </div>
            </div>
          </div>

          <div className="mb-4">
            <Input
              label="Etiqueta del disco"
              placeholder="mi-disco"
              maxLength={12}
              value={label}
              onChange={(e) => setLabel(e.target.value.replace(/[^a-zA-Z0-9_-]/g, ''))}
              hint="Máx. 12 caracteres, alfanumérico"
            />
          </div>

          <div className="p-3 rounded-xl bg-red-500/5 border border-red-500/20 mb-4">
            <div className="flex items-start gap-2">
              <AlertTriangle className="size-4 text-red-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-medium text-red-300">
                  ADVERTENCIA: esto BORRARÁ todo el contenido del disco.
                </p>
                <p className="text-[10px] text-red-400/70 mt-0.5">
                  Por seguridad, el agente solo formatea discos vacíos y nunca el de sistema.
                  La operación es irreversible.
                </p>
              </div>
            </div>
          </div>

          {labelValid && (
            <div className="mb-5">
              <Input
                label={`Escribe «${label}» para confirmar`}
                placeholder={label}
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                error={confirmText.length > 0 && confirmText !== label ? 'No coincide' : undefined}
              />
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={handleClose} disabled={loading}>Cancelar</Button>
            <Button variant="danger" onClick={handleFormat} disabled={!confirmed || loading}>
              {loading ? (
                <><Loader2 className="size-3.5 mr-1.5 animate-spin" />Formateando…</>
              ) : 'Formatear disco'}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
