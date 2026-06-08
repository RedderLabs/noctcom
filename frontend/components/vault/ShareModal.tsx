'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import * as Dialog from '@radix-ui/react-dialog';
import { X, Search, Share2, Shield, UserPlus, Check, Users } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useVault, type DecryptedNode, type Contact } from '@/lib/vault-store';
import { cn } from '@/lib/utils';

interface Props {
  open: boolean;
  onClose: () => void;
  node: DecryptedNode | null;
}

export function ShareModal({ open, onClose, node }: Props) {
  const t = useTranslations('shareModal');
  const { loadContacts, createShare, requestContact } = useVault();

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [permission, setPermission] = useState<'read' | 'write'>('read');
  const [sharing, setSharing] = useState(false);

  const [requestUsername, setRequestUsername] = useState('');
  const [requesting, setRequesting] = useState(false);

  const refresh = useCallback(async () => {
    setLoadingContacts(true);
    const { accepted } = await loadContacts();
    setContacts(accepted);
    setLoadingContacts(false);
  }, [loadContacts]);

  useEffect(() => { if (open) refresh(); }, [open, refresh]);

  function reset() {
    setSelectedId(null);
    setPermission('read');
    setSharing(false);
    setRequestUsername('');
    setRequesting(false);
  }

  async function handleShare(e: React.FormEvent) {
    e.preventDefault();
    const contact = contacts.find((c) => c.contactId === selectedId);
    if (!node || !contact) return;
    setSharing(true);
    try {
      await createShare(node.id, contact, permission);
      reset();
      onClose();
    } catch (err: any) {
      toast.error(err.message ?? t('errorShare'));
    } finally {
      setSharing(false);
    }
  }

  async function handleRequest() {
    const username = requestUsername.trim();
    if (!username) return;
    setRequesting(true);
    try {
      const status = await requestContact(username);
      setRequestUsername('');
      // Si se auto-aceptó (ya había solicitud inversa), aparece en la lista.
      if (status === 'accepted') await refresh();
    } catch (err: any) {
      toast.error(err.message ?? t('requestError'));
    } finally {
      setRequesting(false);
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
              {t('title')}
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
                  {t('encryptedBadge')}
                </p>
              </div>
            )}

            {/* ─── Elegir contacto ──────────────────────────── */}
            <div>
              <span className="flex items-center gap-1.5 text-xs font-medium text-text-secondary mb-2 tracking-wide uppercase">
                <Users className="size-3.5" /> {t('contactsLabel')}
              </span>

              {loadingContacts ? (
                <p className="text-xs text-text-muted px-1 py-2">{t('loadingContacts')}</p>
              ) : contacts.length === 0 ? (
                <p className="text-xs text-text-muted px-1 py-2 leading-relaxed">{t('noContacts')}</p>
              ) : (
                <div className="space-y-1 max-h-44 overflow-y-auto pr-1">
                  {contacts.map((c) => (
                    <button
                      key={c.contactId}
                      type="button"
                      onClick={() => setSelectedId(c.contactId)}
                      className={cn(
                        'w-full flex items-center gap-3 p-2.5 rounded-lg border text-left transition-all',
                        selectedId === c.contactId
                          ? 'bg-violet-500/10 border-violet-500/30'
                          : 'bg-bg-surface-2 border-border-faint hover:border-border-subtle',
                      )}
                    >
                      <div className="size-8 rounded-full bg-gradient-to-br from-violet-400 to-violet-600 grid place-items-center text-xs font-medium shrink-0">
                        {c.username[0]?.toUpperCase()}
                      </div>
                      <span className="flex-1 text-sm font-medium truncate">{c.username}</span>
                      {selectedId === c.contactId && <Check className="size-4 text-violet-300 shrink-0" />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {contacts.length > 0 && (
              <div>
                <span className="block text-xs font-medium text-text-secondary mb-2 tracking-wide uppercase">
                  {t('permission')}
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
                      {p === 'read' ? t('permRead') : t('permWrite')}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* ─── Añadir contacto (enviar solicitud) ───────── */}
            <div className="pt-1 border-t border-border-faint">
              <span className="flex items-center gap-1.5 text-xs font-medium text-text-secondary mt-3 mb-2 tracking-wide uppercase">
                <UserPlus className="size-3.5" /> {t('addContact')}
              </span>
              <div className="flex gap-2">
                <div className="flex-1">
                  <Input
                    value={requestUsername}
                    onChange={(e) => setRequestUsername(e.target.value)}
                    leftIcon={<Search className="size-4" />}
                    placeholder="username"
                  />
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  size="md"
                  onClick={handleRequest}
                  loading={requesting}
                  disabled={!requestUsername.trim()}
                >
                  {t('sendRequest')}
                </Button>
              </div>
              <p className="text-[10px] text-text-muted mt-1.5 leading-relaxed">{t('requestHint')}</p>
            </div>

            <div className="flex items-start gap-2 p-3 rounded-lg bg-violet-500/5 border border-violet-500/20">
              <Shield className="size-4 text-violet-300 mt-0.5 shrink-0" />
              <p className="text-[10px] text-text-tertiary leading-relaxed">
                {t('securityNote')}
              </p>
            </div>

            <div className="flex gap-2 pt-2">
              <Button type="button" variant="ghost" size="md" className="flex-1" onClick={() => { reset(); onClose(); }}>
                {t('cancel')}
              </Button>
              <Button type="submit" variant="primary" size="md" className="flex-1" loading={sharing} disabled={!selectedId}>
                {t('share')}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
