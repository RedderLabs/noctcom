'use client';

import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import {
  FOLDER_ICONS, FOLDER_COLORS,
  type FolderIconKey, type FolderColorKey,
} from '@/components/vault/folder-icons';
import { cn } from '@/lib/utils';

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated?: (name: string, icon: FolderIconKey, color: FolderColorKey) => void;
}

export function NewFolderModal({ open, onClose, onCreated }: Props) {
  const [name, setName] = useState('');
  const [icon, setIcon] = useState<FolderIconKey>('folder');
  const [color, setColor] = useState<FolderColorKey>('violet');
  const [loading, setLoading] = useState(false);

  function reset() {
    setName('');
    setIcon('folder');
    setColor('violet');
    setLoading(false);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    try {
      onCreated?.(name.trim(), icon, color);
      toast.success(`Carpeta «${name.trim()}» creada`);
      reset();
      onClose();
    } catch {
      toast.error('Error al crear la carpeta');
      setLoading(false);
    }
  }

  const selectedColor = FOLDER_COLORS.find((c) => c.key === color) ?? FOLDER_COLORS[0];

  return (
    <Dialog.Root open={open} onOpenChange={(v) => { if (!v) { reset(); onClose(); } }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm animate-fade-in" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 w-full max-w-md rounded-xl bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] shadow-[var(--shadow-modal)] animate-fade-in">
          <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border-faint)]">
            <Dialog.Title className="font-display text-lg font-medium tracking-tight">
              Nueva carpeta
            </Dialog.Title>
            <Dialog.Close asChild>
              <button className="p-1.5 rounded-md hover:bg-[var(--color-bg-surface-2)] text-[var(--color-text-tertiary)]">
                <X className="size-4" />
              </button>
            </Dialog.Close>
          </div>

          <form onSubmit={handleCreate} className="p-5 space-y-5">
            <Input
              label="Nombre"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Documentos personales"
              required
              autoFocus
            />

            <div>
              <span className="block text-xs font-medium text-[var(--color-text-secondary)] mb-2 tracking-wide uppercase">
                Icono
              </span>
              <div className="grid grid-cols-10 gap-1">
                {(Object.keys(FOLDER_ICONS) as FolderIconKey[]).map((key) => {
                  const { Icon } = FOLDER_ICONS[key];
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setIcon(key)}
                      className={cn(
                        'size-9 rounded-lg grid place-items-center transition-all',
                        icon === key
                          ? `${selectedColor.bg} ${selectedColor.border} border`
                          : 'hover:bg-[var(--color-bg-surface-2)] border border-transparent',
                      )}
                      title={FOLDER_ICONS[key].label}
                    >
                      <Icon className={cn('size-4', icon === key ? selectedColor.text : 'text-[var(--color-text-tertiary)]')} />
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <span className="block text-xs font-medium text-[var(--color-text-secondary)] mb-2 tracking-wide uppercase">
                Color
              </span>
              <div className="flex gap-2">
                {FOLDER_COLORS.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => setColor(c.key)}
                    className={cn(
                      'size-8 rounded-full transition-all',
                      c.bg,
                      color === c.key
                        ? `ring-2 ring-offset-2 ring-offset-[var(--color-bg-surface)] ${c.border.replace('border-', 'ring-')}`
                        : 'hover:scale-110',
                    )}
                    title={c.key}
                  />
                ))}
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <Button type="button" variant="ghost" size="md" className="flex-1" onClick={() => { reset(); onClose(); }}>
                Cancelar
              </Button>
              <Button type="submit" variant="primary" size="md" className="flex-1" loading={loading}>
                Crear carpeta
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
