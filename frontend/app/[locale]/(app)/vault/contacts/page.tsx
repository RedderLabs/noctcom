'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Users, UserPlus, Check, X, Clock, Loader2, Search, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useVault, type Contact, type ContactRequest } from '@/lib/vault-store';

function Avatar({ name }: { name: string }) {
  return (
    <div className="size-9 rounded-full bg-gradient-to-br from-violet-400 to-violet-600 grid place-items-center text-xs font-medium shrink-0">
      {name[0]?.toUpperCase() ?? '?'}
    </div>
  );
}

export default function ContactsPage() {
  const t = useTranslations('contacts');
  const { loadContacts, requestContact, acceptContact, declineContact, removeContact } = useVault();

  const [accepted, setAccepted] = useState<Contact[]>([]);
  const [incoming, setIncoming] = useState<ContactRequest[]>([]);
  const [outgoing, setOutgoing] = useState<ContactRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [username, setUsername] = useState('');
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const r = await loadContacts();
    setAccepted(r.accepted);
    setIncoming(r.incoming);
    setOutgoing(r.outgoing);
    setLoading(false);
  }, [loadContacts]);

  useEffect(() => { refresh(); }, [refresh]);

  async function handleAdd() {
    const u = username.trim();
    if (!u) return;
    setAdding(true);
    try {
      await requestContact(u);
      setUsername('');
      await refresh();
    } catch (err: any) {
      toast.error(err.message ?? t('addError'));
    } finally {
      setAdding(false);
    }
  }

  async function withBusy(id: string, fn: () => Promise<void>) {
    setBusyId(id);
    try { await fn(); await refresh(); }
    catch (err: any) { toast.error(err.message ?? t('actionError')); }
    finally { setBusyId(null); }
  }

  return (
    <div className="px-8 py-6 max-w-3xl mx-auto flex flex-col min-h-full">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-semibold tracking-tight flex items-center gap-2">
          <Users className="size-6 text-violet-300" /> {t('title')}
        </h1>
        <p className="text-sm text-text-tertiary mt-1">{t('subtitle')}</p>
      </div>

      {/* Añadir contacto */}
      <div className="flex gap-2 mb-8">
        <div className="flex-1">
          <Input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAdd(); } }}
            leftIcon={<Search className="size-4" />}
            placeholder={t('addPlaceholder')}
          />
        </div>
        <Button type="button" variant="primary" size="md" onClick={handleAdd} loading={adding} disabled={!username.trim()}>
          <UserPlus className="size-4" /> {t('add')}
        </Button>
      </div>

      {loading ? (
        <div className="py-20 text-center">
          <Loader2 className="size-8 text-violet-400 animate-spin mx-auto mb-4" />
          <p className="text-sm text-text-tertiary">{t('loading')}</p>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Solicitudes recibidas */}
          {incoming.length > 0 && (
            <section>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-text-secondary mb-3">
                {t('sections.incoming')} <span className="text-violet-300">({incoming.length})</span>
              </h2>
              <div className="space-y-2">
                {incoming.map((c) => (
                  <div key={c.contactId} className="flex items-center gap-3 p-3 rounded-xl border border-violet-500/20 bg-violet-500/5">
                    <Avatar name={c.username} />
                    <span className="flex-1 text-sm font-medium truncate">{c.username}</span>
                    <button
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
                      onClick={() => withBusy(c.contactId, () => acceptContact(c.contactId))}
                      disabled={busyId === c.contactId}
                    >
                      <Check className="size-3.5" /> {t('accept')}
                    </button>
                    <button
                      className="p-1.5 rounded-md hover:bg-red-500/10 disabled:opacity-50"
                      onClick={() => withBusy(c.contactId, () => declineContact(c.contactId))}
                      disabled={busyId === c.contactId}
                      title={t('decline')}
                    >
                      <X className="size-4 text-red-400" />
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Contactos aceptados */}
          <section>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-text-secondary mb-3">
              {t('sections.accepted')} <span className="text-text-muted">({accepted.length})</span>
            </h2>
            {accepted.length === 0 ? (
              <p className="text-sm text-text-muted">{t('acceptedEmpty')}</p>
            ) : (
              <div className="space-y-2">
                {accepted.map((c) => (
                  <div key={c.contactId} className="flex items-center gap-3 p-3 rounded-xl border border-border-faint bg-bg-surface group">
                    <Avatar name={c.username} />
                    <span className="flex-1 text-sm font-medium truncate">{c.username}</span>
                    <button
                      className="p-1.5 rounded-md hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-50"
                      onClick={() => withBusy(c.contactId, () => removeContact(c.contactId))}
                      disabled={busyId === c.contactId}
                      title={t('remove')}
                    >
                      <Trash2 className="size-3.5 text-red-400" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Solicitudes enviadas */}
          {outgoing.length > 0 && (
            <section>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-text-secondary mb-3">
                {t('sections.outgoing')} <span className="text-text-muted">({outgoing.length})</span>
              </h2>
              <div className="space-y-2">
                {outgoing.map((c) => (
                  <div key={c.contactId} className="flex items-center gap-3 p-3 rounded-xl border border-border-faint bg-bg-surface">
                    <Avatar name={c.username} />
                    <span className="flex-1 text-sm font-medium truncate">{c.username}</span>
                    <span className="flex items-center gap-1 text-[10px] text-text-muted font-mono uppercase tracking-wider">
                      <Clock className="size-3" /> {t('pendingTag')}
                    </span>
                    <button
                      className="p-1.5 rounded-md hover:bg-red-500/10 disabled:opacity-50"
                      onClick={() => withBusy(c.contactId, () => removeContact(c.contactId))}
                      disabled={busyId === c.contactId}
                      title={t('cancel')}
                    >
                      <X className="size-4 text-text-tertiary" />
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      <div className="mt-auto pt-8">
        <div className="p-4 rounded-xl bg-violet-500/5 border border-violet-500/20 flex items-start gap-3">
          <Users className="size-5 text-violet-300 mt-0.5 shrink-0" />
          <p className="text-xs text-text-tertiary leading-relaxed">{t('note')}</p>
        </div>
      </div>
    </div>
  );
}
