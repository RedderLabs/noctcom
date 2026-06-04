'use client';

import { useState, useEffect } from 'react';
import {
  Trash2, FileText, File, Image, RotateCcw, AlertTriangle, Loader2, Folder,
} from 'lucide-react';
import { toast } from 'sonner';
import { useVault, type DecryptedNode } from '@/lib/vault-store';
import { CardActionsMenu } from '@/components/vault/CardActionsMenu';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

function formatSize(bytes: number) {
  if (!bytes) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0; let n = bytes;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}

function daysUntilExpiry(deletedAt?: string) {
  if (!deletedAt) return '—';
  const deleted = new Date(deletedAt);
  const expiry = new Date(deleted.getTime() + 30 * 86_400_000);
  const days = Math.ceil((expiry.getTime() - Date.now()) / 86_400_000);
  return days > 0 ? `${days} días` : 'Expirando';
}

function getIcon(node: DecryptedNode) {
  if (node.kind === 'folder') return Folder;
  if (!node.mimeType) return File;
  if (node.mimeType.startsWith('image/')) return Image;
  if (node.mimeType.includes('pdf') || node.mimeType.includes('text')) return FileText;
  return File;
}

export default function TrashPage() {
  const { loadTrash, restoreNode, purgeNode } = useVault();
  const [items, setItems] = useState<DecryptedNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmNode, setConfirmNode] = useState<DecryptedNode | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const trashed = await loadTrash();
      setItems(trashed);
      setLoading(false);
    })();
  }, [loadTrash]);

  async function handleRestore(nodeId: string) {
    const item = items.find((i) => i.id === nodeId);
    await restoreNode(nodeId);
    setItems((prev) => prev.filter((i) => i.id !== nodeId));
    if (item) toast.success(`«${item.name}» restaurado`);
  }

  async function handlePurge(node: DecryptedNode) {
    try {
      await purgeNode(node.id);
      setItems((prev) => prev.filter((i) => i.id !== node.id));
    } catch { /* el toast de error ya se muestra en el store */ }
    setConfirmNode(null);
  }

  return (
    <div className="px-8 py-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Papelera</h1>
          <p className="text-sm text-text-tertiary mt-1">
            Los archivos se eliminan permanentemente después de 30 días
          </p>
        </div>
      </div>

      {items.length > 0 && (
        <div className="p-3 rounded-lg bg-amber-500/5 border border-amber-500/20 mb-6 flex items-start gap-2">
          <AlertTriangle className="size-4 text-amber-300 mt-0.5 shrink-0" />
          <p className="text-xs text-text-secondary">
            Los archivos en la papelera siguen cifrados. Al eliminarlos permanentemente, se destruyen las claves de descifrado.
          </p>
        </div>
      )}

      {loading && (
        <div className="py-24 text-center">
          <Loader2 className="size-8 text-violet-400 animate-spin mx-auto mb-4" />
          <p className="text-sm text-text-tertiary">Cargando papelera…</p>
        </div>
      )}

      {!loading && (
        <div className="space-y-1">
          {items.map((item) => {
            const Icon = getIcon(item);
            return (
              <div
                key={item.id}
                className="flex items-center gap-4 px-4 py-3 rounded-lg hover:bg-bg-surface transition-colors group"
              >
                <div className="size-10 rounded-lg bg-red-500/10 border border-red-500/20 grid place-items-center shrink-0">
                  <Icon className="size-4 text-red-300" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-medium truncate line-through text-text-secondary">
                    {item.name}
                  </h3>
                  <span className="text-[10px] text-text-tertiary font-mono uppercase tracking-wider">
                    {item.kind === 'folder' ? 'Carpeta' : formatSize(item.size)} · Expira en {daysUntilExpiry(item.deletedAt)}
                  </span>
                </div>
                <CardActionsMenu
                  actions={[
                    { label: 'Restaurar', icon: RotateCcw, onSelect: () => handleRestore(item.id) },
                    { label: 'Eliminar definitivamente', icon: Trash2, onSelect: () => setConfirmNode(item), danger: true },
                  ]}
                />
              </div>
            );
          })}
        </div>
      )}

      {!loading && items.length === 0 && (
        <div className="py-24 text-center">
          <div className="size-16 rounded-full bg-bg-surface border border-border-subtle grid place-items-center mx-auto mb-4">
            <Trash2 className="size-6 text-text-tertiary" />
          </div>
          <h3 className="font-display text-lg mb-1">Papelera vacía</h3>
          <p className="text-sm text-text-tertiary">No hay archivos eliminados</p>
        </div>
      )}

      <ConfirmDialog
        open={!!confirmNode}
        danger
        title="¿Eliminar definitivamente?"
        message={confirmNode
          ? `«${confirmNode.name}» se borrará para siempre, junto con su contenido cifrado. Esta acción no se puede deshacer.`
          : ''}
        confirmLabel="Eliminar"
        cancelLabel="Cancelar"
        onConfirm={() => { if (confirmNode) handlePurge(confirmNode); }}
        onCancel={() => setConfirmNode(null)}
      />
    </div>
  );
}
