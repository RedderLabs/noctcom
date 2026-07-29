'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import {
  Trash2, FileText, File, Image, RotateCcw, AlertTriangle, Loader2, Folder, Check, X,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useVault, type DecryptedNode } from '@/lib/vault-store';
import { Button } from '@/components/ui/Button';
import { CardActionsMenu } from '@/components/vault/CardActionsMenu';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

function formatSize(bytes: number) {
  if (!bytes) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0; let n = bytes;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}

function daysUntilExpiry(deletedAt?: string): number | null {
  if (!deletedAt) return null;
  const deleted = new Date(deletedAt);
  const expiry = new Date(deleted.getTime() + 30 * 86_400_000);
  const days = Math.ceil((expiry.getTime() - Date.now()) / 86_400_000);
  return days;
}

function getIcon(node: DecryptedNode) {
  if (node.kind === 'folder') return Folder;
  if (!node.mimeType) return File;
  if (node.mimeType.startsWith('image/')) return Image;
  if (node.mimeType.includes('pdf') || node.mimeType.includes('text')) return FileText;
  return File;
}

/**
 * Casilla de selección. No usamos <input type="checkbox"> nativo porque su
 * apariencia no es estilable de forma consistente entre navegadores; este es un
 * checkbox real de accesibilidad (role + aria-checked + teclado) con el aspecto
 * del sistema: 4px de radio, borde sutil en reposo, relleno de acento al marcar.
 */
function Checkbox({
  checked, indeterminate, onChange, label,
}: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: () => void;
  label: string;
}) {
  const active = checked || indeterminate;
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={indeterminate ? 'mixed' : checked}
      aria-label={label}
      onClick={(e) => { e.stopPropagation(); onChange(); }}
      className={cn(
        'size-4 shrink-0 grid place-items-center rounded-[4px] border transition-all duration-150 ease-out',
        active
          ? 'bg-violet-600 border-violet-500 text-white'
          : 'bg-transparent border-border-subtle hover:border-border-strong',
      )}
    >
      {indeterminate
        ? <span className="block w-2 h-px bg-current" />
        : checked && <Check className="size-3" strokeWidth={3} />}
    </button>
  );
}

export default function TrashPage() {
  const t = useTranslations('trash');
  const { loadTrash, restoreNode, purgeNode, restoreNodes, purgeNodes } = useVault();
  const [items, setItems] = useState<DecryptedNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [confirmNode, setConfirmNode] = useState<DecryptedNode | null>(null);
  const [confirmBulk, setConfirmBulk] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const trashed = await loadTrash();
      setItems(trashed);
      setLoading(false);
    })();
  }, [loadTrash]);

  const allSelected = items.length > 0 && selected.size === items.length;
  const someSelected = selected.size > 0 && !allSelected;

  const selectedItems = useMemo(
    () => items.filter((i) => selected.has(i.id)),
    [items, selected],
  );

  const toggleOne = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    setSelected((prev) => (prev.size === items.length ? new Set() : new Set(items.map((i) => i.id))));
  }, [items]);

  const clearSelection = useCallback(() => setSelected(new Set()), []);

  async function handleRestore(nodeId: string) {
    const item = items.find((i) => i.id === nodeId);
    try {
      await restoreNode(nodeId);
      setItems((prev) => prev.filter((i) => i.id !== nodeId));
      setSelected((prev) => { const n = new Set(prev); n.delete(nodeId); return n; });
      if (item) toast.success(t('toastRestored', { name: item.name }));
    } catch { /* el toast de error ya se muestra en el store */ }
  }

  async function handlePurge(node: DecryptedNode) {
    try {
      await purgeNode(node.id);
      setItems((prev) => prev.filter((i) => i.id !== node.id));
      setSelected((prev) => { const n = new Set(prev); n.delete(node.id); return n; });
    } catch { /* el toast de error ya se muestra en el store */ }
    setConfirmNode(null);
  }

  async function handleBulkRestore() {
    const ids = [...selected];
    setBusy(true);
    try {
      await restoreNodes(ids);
      setItems((prev) => prev.filter((i) => !selected.has(i.id)));
      clearSelection();
    } catch { /* el toast de error ya se muestra en el store */ }
    setBusy(false);
  }

  async function handleBulkPurge() {
    const ids = [...selected];
    setBusy(true);
    try {
      await purgeNodes(ids);
      setItems((prev) => prev.filter((i) => !selected.has(i.id)));
      clearSelection();
    } catch { /* el toast de error ya se muestra en el store */ }
    setBusy(false);
    setConfirmBulk(false);
  }

  return (
    <div className="px-8 py-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">{t('title')}</h1>
          <p className="text-sm text-text-tertiary mt-1">
            {t('subtitle')}
          </p>
        </div>
      </div>

      {items.length > 0 && (
        <div className="p-3 rounded-lg bg-amber-500/5 border border-amber-500/20 mb-6 flex items-start gap-2">
          <AlertTriangle className="size-4 text-amber-300 mt-0.5 shrink-0" />
          <p className="text-xs text-text-secondary">
            {t('encryptedNotice')}
          </p>
        </div>
      )}

      {loading && (
        <div className="py-24 text-center">
          <Loader2 className="size-8 text-violet-400 animate-spin mx-auto mb-4" />
          <p className="text-sm text-text-tertiary">{t('loading')}</p>
        </div>
      )}

      {!loading && items.length > 0 && (
        <>
          {/* Cabecera de selección: seleccionar todo a la izquierda, acciones del
              lote a la derecha. Ocupa siempre el mismo alto para que la lista no
              salte al entrar o salir de la selección. */}
          <div className="flex items-center gap-3 h-10 px-4 mb-1 border-b border-border-faint">
            <Checkbox
              checked={allSelected}
              indeterminate={someSelected}
              onChange={toggleAll}
              label={allSelected ? t('deselectAll') : t('selectAll')}
            />
            {selected.size === 0 ? (
              <span className="text-[10px] font-mono uppercase tracking-wider text-text-tertiary">
                {t('selectAll')}
              </span>
            ) : (
              <>
                <span className="text-[10px] font-mono uppercase tracking-wider text-violet-300">
                  {t('selectedCount', { count: selected.size })}
                </span>
                <div className="flex-1" />
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  leftIcon={<RotateCcw className="size-3.5" />}
                  onClick={handleBulkRestore}
                >
                  {t('restoreSelected')}
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  loading={busy}
                  leftIcon={busy ? undefined : <Trash2 className="size-3.5" />}
                  onClick={() => setConfirmBulk(true)}
                >
                  {t('deleteSelected')}
                </Button>
                <button
                  type="button"
                  onClick={clearSelection}
                  aria-label={t('clearSelection')}
                  className="p-1.5 rounded-md text-text-muted hover:text-text-secondary hover:bg-bg-surface transition-colors"
                >
                  <X className="size-3.5" />
                </button>
              </>
            )}
          </div>

          <div className="space-y-1">
            {items.map((item) => {
              const Icon = getIcon(item);
              const isSelected = selected.has(item.id);
              return (
                <div
                  key={item.id}
                  onClick={() => toggleOne(item.id)}
                  className={cn(
                    'flex items-center gap-4 px-4 py-3 rounded-lg transition-colors group cursor-pointer',
                    isSelected ? 'bg-violet-500/5' : 'hover:bg-bg-surface',
                  )}
                >
                  <Checkbox
                    checked={isSelected}
                    onChange={() => toggleOne(item.id)}
                    label={t('selectItem', { name: item.name })}
                  />
                  <div className="size-10 rounded-lg bg-red-500/10 border border-red-500/20 grid place-items-center shrink-0">
                    <Icon className="size-4 text-red-300" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-medium truncate line-through text-text-secondary">
                      {item.name}
                    </h3>
                    <span className="text-[10px] text-text-tertiary font-mono uppercase tracking-wider">
                      {item.kind === 'folder' ? t('folder') : formatSize(item.size)} · {(() => {
                        const days = daysUntilExpiry(item.deletedAt);
                        return days === null
                          ? t('expiry', { days: 0, hasDate: 'no' })
                          : t('expiry', { days, hasDate: 'yes' });
                      })()}
                    </span>
                  </div>
                  <div onClick={(e) => e.stopPropagation()}>
                    <CardActionsMenu
                      actions={[
                        { label: t('restore'), icon: RotateCcw, onSelect: () => handleRestore(item.id) },
                        { label: t('deleteForever'), icon: Trash2, onSelect: () => setConfirmNode(item), danger: true },
                      ]}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {!loading && items.length === 0 && (
        <div className="py-24 text-center">
          <div className="size-16 rounded-full bg-bg-surface border border-border-subtle grid place-items-center mx-auto mb-4">
            <Trash2 className="size-6 text-text-tertiary" />
          </div>
          <h3 className="font-display text-lg mb-1">{t('emptyTitle')}</h3>
          <p className="text-sm text-text-tertiary">{t('emptyDescription')}</p>
        </div>
      )}

      <ConfirmDialog
        open={!!confirmNode}
        danger
        title={t('confirmTitle')}
        message={confirmNode
          ? t('confirmMessage', { name: confirmNode.name })
          : ''}
        confirmLabel={t('confirmLabel')}
        cancelLabel={t('cancelLabel')}
        onConfirm={() => { if (confirmNode) handlePurge(confirmNode); }}
        onCancel={() => setConfirmNode(null)}
      />

      <ConfirmDialog
        open={confirmBulk}
        danger
        title={t('confirmBulkTitle')}
        message={t('confirmBulkMessage', {
          count: selectedItems.length,
          size: formatSize(selectedItems.reduce((acc, i) => acc + (i.size ?? 0), 0)),
        })}
        confirmLabel={t('confirmLabel')}
        cancelLabel={t('cancelLabel')}
        onConfirm={handleBulkPurge}
        onCancel={() => setConfirmBulk(false)}
      />
    </div>
  );
}
