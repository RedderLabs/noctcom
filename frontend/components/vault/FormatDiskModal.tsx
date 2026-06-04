'use client';

import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, AlertTriangle, HardDrive, Usb, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { apiFetch } from '@/lib/api';
import { getStepUpToken } from '@/lib/step-up';
import { cn } from '@/lib/utils';

interface DiskInfoExtended {
  id: string;
  device: string;
  path: string;
  label: string;
  totalBytes: number;
  freeBytes: number;
  filesystem: string;
  removable: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
  disk: DiskInfoExtended | null;
  onFormatted: () => void;
}

function fmtSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0; let n = bytes;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}

export function FormatDiskModal({ open, onClose, disk, onFormatted }: Props) {
  const [filesystem, setFilesystem] = useState<'ext4' | 'xfs'>('ext4');
  const [label, setLabel] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [loading, setLoading] = useState(false);

  function reset() {
    setFilesystem('ext4');
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
    setLoading(true);

    try {
      // Re-autenticación obligatoria antes de una operación irreversible.
      const stepUpToken = await getStepUpToken();

      const result = await apiFetch<{ ok: boolean; mountPath: string }>('/api/v1/storage/disks/format', {
        method: 'POST',
        headers: { 'x-step-up-token': stepUpToken },
        body: JSON.stringify({
          device: disk.device,
          filesystem,
          label,
          confirmLabel: confirmText,
        }),
      });

      // Auto-register as volume
      const vol = await apiFetch<{ id: string }>('/api/v1/storage/volumes', {
        method: 'POST',
        body: JSON.stringify({ path: result.mountPath, label }),
      });

      // Auto-activate
      await apiFetch(`/api/v1/storage/volumes/${vol.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ active: true }),
      });

      toast.success('Disco formateado y registrado como volumen activo');
      onFormatted();
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
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-bg-surface border border-border-faint rounded-2xl p-6 z-50 shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <div className="size-8 rounded-lg bg-red-500/10 border border-red-500/20 grid place-items-center">
                <AlertTriangle className="size-4 text-red-400" />
              </div>
              <Dialog.Title className="text-lg font-semibold">Formatear disco</Dialog.Title>
            </div>
            <Dialog.Close asChild>
              <button className="size-8 grid place-items-center rounded-lg hover:bg-bg-surface-2 transition-colors">
                <X className="size-4" />
              </button>
            </Dialog.Close>
          </div>

          {/* Disk info */}
          <div className="p-3 rounded-xl bg-bg-surface-2 border border-border-faint mb-4">
            <div className="flex items-center gap-3">
              <div className="size-9 rounded-lg bg-bg-surface-3 grid place-items-center">
                {disk.removable
                  ? <Usb className="size-4 text-amber-400" />
                  : <HardDrive className="size-4 text-text-tertiary" />
                }
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{disk.label}</p>
                <p className="text-xs text-text-tertiary font-mono">{disk.device}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[10px] text-text-muted font-mono">
                    {fmtSize(disk.totalBytes)}
                  </span>
                  <span className="text-[10px] text-text-muted">·</span>
                  <span className="text-[10px] text-amber-400 font-mono uppercase">
                    {disk.filesystem || 'sin formato'}
                  </span>
                  {disk.removable && (
                    <>
                      <span className="text-[10px] text-text-muted">·</span>
                      <span className="text-[10px] text-amber-400 font-mono uppercase">USB</span>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Filesystem selector */}
          <div className="mb-4">
            <label className="text-xs text-text-secondary font-medium mb-1.5 block">
              Sistema de archivos
            </label>
            <div className="flex gap-2">
              {(['ext4', 'xfs'] as const).map((fs) => (
                <button
                  key={fs}
                  onClick={() => setFilesystem(fs)}
                  className={cn(
                    'flex-1 py-2 px-3 rounded-lg text-sm font-medium border transition-all',
                    filesystem === fs
                      ? 'bg-violet-500/10 border-violet-500/30 text-violet-300'
                      : 'bg-bg-surface-2 border-border-faint text-text-tertiary hover:border-border-subtle',
                  )}
                >
                  {fs}
                  <span className="block text-[10px] font-normal mt-0.5 opacity-60">
                    {fs === 'ext4' ? 'Uso general' : 'Archivos grandes'}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Label input */}
          <div className="mb-4">
            <Input
              label="Etiqueta del disco"
              placeholder="mi-disco"
              maxLength={12}
              value={label}
              onChange={(e) => setLabel(e.target.value.replace(/[^a-zA-Z0-9_-]/g, ''))}
              hint="Max 12 caracteres, alfanumerico"
            />
          </div>

          {/* Warning banner */}
          <div className="p-3 rounded-xl bg-red-500/5 border border-red-500/20 mb-4">
            <div className="flex items-start gap-2">
              <AlertTriangle className="size-4 text-red-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-medium text-red-300">
                  ADVERTENCIA: Esta accion BORRARA TODOS LOS DATOS en este disco.
                </p>
                <p className="text-[10px] text-red-400/60 mt-0.5">
                  Esta operacion es irreversible.
                </p>
              </div>
            </div>
          </div>

          {/* Confirmation input */}
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

          {/* Actions */}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={handleClose} disabled={loading}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              onClick={handleFormat}
              disabled={!confirmed || loading}
            >
              {loading ? (
                <>
                  <Loader2 className="size-3.5 mr-1.5 animate-spin" />
                  Formateando…
                </>
              ) : (
                'Formatear disco'
              )}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
