'use client';

import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, Search, Share2, Shield, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useVault, type DecryptedNode } from '@/lib/vault-store';
import { cn } from '@/lib/utils';

interface Props {
  open: boolean;
  onClose: () => void;
  node: DecryptedNode | null;
}

export function ShareModal({ open, onClose, node }: Props) {
  const { createShare, lookupUser } = useVault();
  const [username, setUsername] = useState('');
  const [permission, setPermission] = useState<'read' | 'write'>('read');
  const [loading, setLoading] = useState(false);
  const [foundUser, setFoundUser] = useState<{ id: string; username: string } | null>(null);
  const [searched, setSearched] = useState(false);

  function reset() {
    setUsername('');
    setPermission('read');
    setLoading(false);
    setFoundUser(null);
    setSearched(false);
  }

  async function handleLookup() {
    if (!username.trim()) return;
    setLoading(true);
    setSearched(true);
    const user = await lookupUser(username.trim());
    setFoundUser(user ? { id: user.id, username: user.username } : null);
    setLoading(false);
  }

  async function handleShare(e: React.FormEvent) {
    e.preventDefault();
    if (!node || !foundUser) return;
    setLoading(true);
    try {
      await createShare(node.id, foundUser.username, permission);
      reset();
      onClose();
    } catch (err: any) {
      toast.error(err.message ?? 'Error al compartir');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={(v) => { if (!v) { reset(); onClose(); } }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm animate-fade-in" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 w-full max-w-md rounded-xl bg-bg-surface border border-border-subtle shadow-modal animate-fade-in">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border-faint">
            <Dialog.Title className="font-display text-lg font-medium tracking-tight flex items-center gap-2">
              <Share2 className="size-5 text-violet-300" />
              Compartir archivo
            </Dialog.Title>
            <Dialog.Close asChild>
              <button className="p-1.5 rounded-md hover:bg-bg-surface-2 text-text-tertiary">
                <X className="size-4" />
              </button>
            </Dialog.Close>
          </div>

          <form onSubmit={handleShare} className="p-5 space-y-5">
            {node && (
              <div className="p-3 rounded-lg bg-bg-surface-2 border border-border-faint">
                <p className="text-sm font-medium truncate">{node.name}</p>
                <p className="text-[10px] text-text-tertiary uppercase tracking-wider mt-0.5">
                  Cifrado E2E · sealed box
                </p>
              </div>
            )}

            <div className="flex gap-2">
              <div className="flex-1">
                <Input
                  label="Nombre de usuario"
                  value={username}
                  onChange={(e) => { setUsername(e.target.value); setSearched(false); setFoundUser(null); }}
                  leftIcon={<Search className="size-4" />}
                  placeholder="username"
                  autoFocus
                />
              </div>
              <div className="pt-[22px]">
                <Button
                  type="button"
                  variant="secondary"
                  size="md"
                  onClick={handleLookup}
                  loading={loading && !foundUser}
                  disabled={!username.trim()}
                >
                  Buscar
                </Button>
              </div>
            </div>

            {searched && !loading && !foundUser && (
              <p className="text-xs text-red-400">Usuario no encontrado</p>
            )}

            {foundUser && (
              <div className="flex items-center gap-3 p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
                <div className="size-9 rounded-full bg-gradient-to-br from-violet-400 to-violet-600 grid place-items-center text-xs font-medium shrink-0">
                  {foundUser.username[0]?.toUpperCase()}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium">{foundUser.username}</p>
                  <p className="text-[10px] text-emerald-400 font-mono uppercase tracking-wider">Encontrado</p>
                </div>
              </div>
            )}

            <div>
              <span className="block text-xs font-medium text-text-secondary mb-2 tracking-wide uppercase">
                Permiso
              </span>
              <div className="flex gap-2">
                {(['read', 'write'] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPermission(p)}
                    className={cn(
                      'flex-1 px-4 py-2.5 rounded-lg text-sm border transition-all',
                      permission === p
                        ? 'bg-violet-500/15 border-violet-500/30 text-violet-200'
                        : 'bg-bg-surface-2 border-border-faint text-text-tertiary hover:border-border-subtle',
                    )}
                  >
                    {p === 'read' ? 'Solo lectura' : 'Lectura y escritura'}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-start gap-2 p-3 rounded-lg bg-violet-500/5 border border-violet-500/20">
              <Shield className="size-4 text-violet-300 mt-0.5 shrink-0" />
              <p className="text-[10px] text-text-tertiary leading-relaxed">
                La clave del archivo se cifra con la clave pública del destinatario (sealed box).
                Ni Noctcom ni nadie más puede acceder al contenido.
              </p>
            </div>

            <div className="flex gap-2 pt-2">
              <Button type="button" variant="ghost" size="md" className="flex-1" onClick={() => { reset(); onClose(); }}>
                Cancelar
              </Button>
              <Button type="submit" variant="primary" size="md" className="flex-1" loading={loading} disabled={!foundUser}>
                Compartir
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
