'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { Shield, Lock, ExternalLink, FileText, AlertTriangle, Github } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Navbar } from '@/components/ui/Navbar';
import { cn } from '@/lib/utils';

type Tab = 'crypto' | 'threats';

export default function SecurityPage() {
  const t = useTranslations('security');
  const [tab, setTab] = useState<Tab>('crypto');

  return (
    <main className="min-h-screen flex flex-col">
      <Navbar variant="back" />

      <div className="flex-1 max-w-4xl mx-auto px-6 py-12 w-full">
        {/* Header */}
        <div className="mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/5 mb-4">
            <Shield className="size-3.5 text-emerald-300" />
            <span className="text-xs text-emerald-300 font-medium">Auditable · Open Source · AGPL-3.0</span>
          </div>
          <h1 className="font-display text-4xl font-light tracking-tight mb-3">{t('header.title')}</h1>
          <p className="text-text-secondary leading-relaxed max-w-2xl">
            {t.rich('header.intro', {
              strong: (c) => <strong className="text-text-primary font-medium">{c}</strong>,
            })}
          </p>
        </div>

        {/* Quick links */}
        <div className="grid sm:grid-cols-3 gap-3 mb-8">
          <a
            href="https://github.com/RedderLabs/noctcom/blob/main/docs/CRYPTO_SPEC.md"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 p-4 rounded-xl border border-border-faint bg-bg-surface hover:border-border-subtle transition-all group"
          >
            <Lock className="size-4 text-violet-300" />
            <div className="flex-1 min-w-0">
              <span className="text-sm font-medium block">{t('quickLinks.spec')}</span>
              <span className="text-[10px] text-text-tertiary font-mono uppercase tracking-wider">CRYPTO_SPEC.md</span>
            </div>
            <ExternalLink className="size-3.5 text-text-muted group-hover:text-text-secondary" />
          </a>
          <a
            href="https://github.com/RedderLabs/noctcom/blob/main/docs/THREAT_MODEL.md"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 p-4 rounded-xl border border-border-faint bg-bg-surface hover:border-border-subtle transition-all group"
          >
            <AlertTriangle className="size-4 text-amber-300" />
            <div className="flex-1 min-w-0">
              <span className="text-sm font-medium block">{t('quickLinks.threatModel')}</span>
              <span className="text-[10px] text-text-tertiary font-mono uppercase tracking-wider">THREAT_MODEL.md</span>
            </div>
            <ExternalLink className="size-3.5 text-text-muted group-hover:text-text-secondary" />
          </a>
          <a
            href="https://github.com/RedderLabs/noctcom/blob/main/SECURITY.md"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 p-4 rounded-xl border border-border-faint bg-bg-surface hover:border-border-subtle transition-all group"
          >
            <FileText className="size-4 text-emerald-300" />
            <div className="flex-1 min-w-0">
              <span className="text-sm font-medium block">{t('quickLinks.report')}</span>
              <span className="text-[10px] text-text-tertiary font-mono uppercase tracking-wider">SECURITY.md</span>
            </div>
            <ExternalLink className="size-3.5 text-text-muted group-hover:text-text-secondary" />
          </a>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 p-1 bg-bg-surface rounded-lg border border-border-faint w-fit">
          <button
            onClick={() => setTab('crypto')}
            className={cn(
              'px-4 py-2 rounded-md text-sm transition-colors',
              tab === 'crypto' ? 'bg-violet-500/20 text-violet-200' : 'text-text-tertiary hover:text-text-secondary',
            )}
          >
            <span className="flex items-center gap-2"><Lock className="size-3.5" /> {t('tabs.crypto')}</span>
          </button>
          <button
            onClick={() => setTab('threats')}
            className={cn(
              'px-4 py-2 rounded-md text-sm transition-colors',
              tab === 'threats' ? 'bg-amber-500/20 text-amber-200' : 'text-text-tertiary hover:text-text-secondary',
            )}
          >
            <span className="flex items-center gap-2"><AlertTriangle className="size-3.5" /> {t('tabs.threats')}</span>
          </button>
        </div>

        {/* Crypto Spec */}
        {tab === 'crypto' && (
          <article className="animate-fade-in space-y-8">
            <Section title={t('crypto.primitives.title')}>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border-faint">
                    <th className="text-left py-2 text-[10px] font-mono uppercase tracking-wider text-text-tertiary">{t('crypto.primitives.colFunction')}</th>
                    <th className="text-left py-2 text-[10px] font-mono uppercase tracking-wider text-text-tertiary">{t('crypto.primitives.colAlgorithm')}</th>
                    <th className="text-left py-2 text-[10px] font-mono uppercase tracking-wider text-text-tertiary">{t('crypto.primitives.colParams')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-faint">
                  {([
                    ['kdf', 'KDF', 'Argon2id', 'OPSLIMIT_MODERATE, 256 MiB'],
                    ['aead', 'AEAD', 'XChaCha20-Poly1305', 'nonce 24B, tag 16B'],
                    ['hkdf', 'HKDF', 'BLAKE2b-keyed', 'output 32B'],
                    ['signatures', t('crypto.primitives.rows.signatures'), 'Ed25519', 'RFC 8032'],
                    ['keyExchange', 'Key Exchange', 'X25519', 'RFC 7748'],
                    ['sealedBoxes', 'Sealed Boxes', 'X25519 + XSalsa20-Poly1305', t('crypto.primitives.rows.sealedBoxesParams')],
                    ['hash', 'Hash', 'BLAKE2b-256', 'output 32B'],
                  ] as const).map(([key, fn, algo, params]) => (
                    <tr key={key} className="text-text-secondary">
                      <td className="py-2.5 font-mono text-violet-300">{fn}</td>
                      <td className="py-2.5">{algo}</td>
                      <td className="py-2.5 text-xs text-text-tertiary">{params}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>

            <Section title={t('crypto.keyHierarchy.title')}>
              <div className="p-4 rounded-lg bg-bg-deep border border-border-faint font-mono text-xs leading-loose">
                <p className="text-text-muted">{`// ${t('crypto.keyHierarchy.commentDerivation')}`}</p>
                <p className="text-violet-300 mt-1">password</p>
                <p className="text-text-tertiary">  │ Argon2id(salt, opsLimit, memLimit)</p>
                <p className="text-violet-300">  ▼</p>
                <p className="text-emerald-300">Master Key (MK)</p>
                <p className="text-text-tertiary">  ├── BLAKE2b(&quot;vault.wrap&quot;) → K_vault_wrap</p>
                <p className="text-text-tertiary">  │     └── Unwrap → vault_key → file_key → chunks</p>
                <p className="text-text-tertiary">  ├── BLAKE2b(&quot;login.sign&quot;) → seed → Ed25519 keypair</p>
                <p className="text-text-tertiary">  └── Unwrap → sk_exchange (X25519)</p>
                <p className="text-text-muted mt-3">{`// ${t('crypto.keyHierarchy.commentRecovery')}`}</p>
                <p className="text-amber-300">{t('crypto.keyHierarchy.mnemonic')}</p>
                <p className="text-text-tertiary">  │ BLAKE2b(key=&quot;recovery.v1&quot;)</p>
                <p className="text-amber-300">  ▼</p>
                <p className="text-emerald-300">recovery seed</p>
                <p className="text-text-tertiary">  ├── Ed25519 → {t('crypto.keyHierarchy.signsChallenge')}</p>
                <p className="text-text-tertiary">  └── BLAKE2b(&quot;recovery.box.v1&quot;) → X25519 → {t('crypto.keyHierarchy.opensSeals')}</p>
              </div>
            </Section>

            <Section title={t('crypto.recovery.title')}>
              <p className="text-sm text-text-secondary mb-3 leading-relaxed">
                {t.rich('crypto.recovery.intro', {
                  strong: (c) => <strong className="text-text-primary font-medium">{c}</strong>,
                  em: (c) => <em>{c}</em>,
                })}
              </p>
              <div className="space-y-3">
                <InfoCard icon="key" color="amber" title={t('crypto.recovery.cards.forgotPassword.title')} text={t('crypto.recovery.cards.forgotPassword.text')} />
                <InfoCard icon="lock" color="violet" title={t('crypto.recovery.cards.sealedEnvelopes.title')} text={t('crypto.recovery.cards.sealedEnvelopes.text')} />
                <InfoCard icon="shield" color="emerald" title={t('crypto.recovery.cards.lostBoth.title')} text={t('crypto.recovery.cards.lostBoth.text')} />
              </div>
            </Section>

            <Section title={t('crypto.fileEncryption.title')}>
              <div className="space-y-3">
                <InfoCard icon="lock" color="violet" title={t('crypto.fileEncryption.cards.chunks.title')} text={t('crypto.fileEncryption.cards.chunks.text')} />
                <InfoCard icon="shield" color="emerald" title={t('crypto.fileEncryption.cards.aad.title')} text={t('crypto.fileEncryption.cards.aad.text')} />
                <InfoCard icon="key" color="amber" title={t('crypto.fileEncryption.cards.contentHash.title')} text={t('crypto.fileEncryption.cards.contentHash.text')} />
              </div>
            </Section>

            <Section title={t('crypto.zkEmail.title')}>
              <div className="p-4 rounded-lg bg-bg-deep border border-border-faint font-mono text-xs leading-loose">
                <p className="text-text-muted">{`// ${t('crypto.zkEmail.comment')}`}</p>
                <p className="text-text-secondary">email_hash = BLAKE2b(</p>
                <p className="text-text-secondary">{'  message = normalize(email),'}</p>
                <p className="text-text-secondary">{'  key = "noctcom.email.v1",'}</p>
                <p className="text-text-secondary">{'  output = 32 bytes'}</p>
                <p className="text-text-secondary">)</p>
              </div>
            </Section>

            <Section title={t('crypto.audits.title')}>
              <div className="p-4 rounded-xl border border-border-faint bg-bg-surface">
                <p className="text-sm text-text-secondary">
                  {t('crypto.audits.body')}
                </p>
                <p className="text-xs text-text-tertiary mt-2">
                  {t.rich('crypto.audits.note', {
                    link: (c) => (
                      <a href="https://github.com/RedderLabs/noctcom" target="_blank" rel="noopener noreferrer" className="text-violet-300 hover:text-violet-200">
                        {c}
                      </a>
                    ),
                  })}
                </p>
              </div>
            </Section>
          </article>
        )}

        {/* Threat Model */}
        {tab === 'threats' && (
          <article className="animate-fade-in space-y-8">
            <Section title={t('threats.adversaries.title')}>
              <div className="space-y-2">
                {[
                  { id: 'A1', key: 'A1', color: 'text-red-400 bg-red-500/10' },
                  { id: 'A2', key: 'A2', color: 'text-orange-400 bg-orange-500/10' },
                  { id: 'A3', key: 'A3', color: 'text-amber-400 bg-amber-500/10' },
                  { id: 'A4', key: 'A4', color: 'text-violet-400 bg-violet-500/10' },
                  { id: 'A5', key: 'A5', color: 'text-slate-400 bg-slate-500/10' },
                ].map((a) => (
                  <div key={a.id} className="flex items-center gap-4 p-4 rounded-xl border border-border-faint bg-bg-surface">
                    <span className={cn('text-xs font-mono font-bold px-2 py-1 rounded', a.color)}>{a.id}</span>
                    <div>
                      <span className="text-sm font-medium">{t(`threats.adversaries.items.${a.key}.name`)}</span>
                      <p className="text-xs text-text-tertiary">{t(`threats.adversaries.items.${a.key}.desc`)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </Section>

            <Section title={t('threats.matrix.title')}>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border-faint">
                      <th className="text-left py-2 text-[10px] font-mono uppercase tracking-wider text-text-tertiary">{t('threats.matrix.colThreat')}</th>
                      <th className="text-center py-2 text-[10px] font-mono uppercase tracking-wider text-text-tertiary">A1</th>
                      <th className="text-center py-2 text-[10px] font-mono uppercase tracking-wider text-text-tertiary">A2</th>
                      <th className="text-center py-2 text-[10px] font-mono uppercase tracking-wider text-text-tertiary">A3</th>
                      <th className="text-center py-2 text-[10px] font-mono uppercase tracking-wider text-text-tertiary">A4</th>
                      <th className="text-center py-2 text-[10px] font-mono uppercase tracking-wider text-text-tertiary">A5</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-faint">
                    {([
                      ['readContent', '✅', '✅', '✅', '✅', '❌'],
                      ['readNames', '✅', '✅', '✅', '✅', '❌'],
                      ['obtainMasterKey', '✅', '✅', '✅', '✅', '❌'],
                      ['offlineBruteForce', '—', '⚠️', '—', '—', '❌'],
                      ['impersonate', '✅', '⚠️', '✅', '⚠️', '❌'],
                      ['blockAccess', '❌', '—', '✅', '❌', '—'],
                      ['modifyFiles', '✅', '⚠️', '✅', '✅', '❌'],
                      ['inferUsage', '❌', '❌', '❌', '❌', '❌'],
                    ] as const).map(([key, ...cols]) => (
                      <tr key={key} className="text-text-secondary">
                        <td className="py-2.5 text-xs">{t(`threats.matrix.rows.${key}`)}</td>
                        {cols.map((v, i) => (
                          <td key={i} className="py-2.5 text-center">{v}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex gap-4 mt-3 text-[10px] text-text-muted font-mono">
                <span>✅ {t('threats.matrix.legend.protected')}</span>
                <span>⚠️ {t('threats.matrix.legend.partial')}</span>
                <span>❌ {t('threats.matrix.legend.unprotected')}</span>
              </div>
            </Section>

            <Section title={t('threats.notProtected.title')}>
              <div className="space-y-2">
                {[
                  'malware',
                  'physicalAccess',
                  'coercion',
                  'plausibleDeniability',
                  'networkAnonymity',
                  'realtimeMessaging',
                ].map((key) => (
                  <div key={key} className="flex items-center gap-3 px-4 py-3 rounded-lg bg-red-500/5 border border-red-500/10">
                    <span className="text-red-400 text-sm">✕</span>
                    <span className="text-sm text-text-secondary">{t(`threats.notProtected.items.${key}`)}</span>
                  </div>
                ))}
              </div>
            </Section>

            <Section title={t('threats.assumptions.title')}>
              <p className="text-sm text-text-secondary mb-3">
                {t('threats.assumptions.intro')}
              </p>
              <div className="space-y-1">
                {[
                  { prim: 'Argon2id', key: 'argon2id' },
                  { prim: 'XChaCha20-Poly1305', key: 'xchacha20' },
                  { prim: 'Ed25519', key: 'ed25519' },
                  { prim: 'X25519', key: 'x25519' },
                  { prim: 'BLAKE2b', key: 'blake2b' },
                ].map((s) => (
                  <div key={s.prim} className="flex items-center gap-4 px-4 py-2.5 rounded-lg hover:bg-bg-surface transition-colors">
                    <span className="text-sm font-mono text-violet-300 w-48 shrink-0">{s.prim}</span>
                    <span className="text-xs text-text-tertiary">{t(`threats.assumptions.items.${s.key}`)}</span>
                  </div>
                ))}
              </div>
            </Section>
          </article>
        )}

        {/* Footer CTA */}
        <div className="mt-12 p-6 rounded-xl border border-border-subtle bg-bg-surface text-center">
          <h3 className="font-display text-lg font-medium mb-2">{t('footerCta.title')}</h3>
          <p className="text-sm text-text-tertiary mb-4 max-w-lg mx-auto">
            {t.rich('footerCta.body', {
              code1: () => <code className="text-xs bg-bg-surface-2 px-1.5 py-0.5 rounded">backend/src/crypto/</code>,
              code2: () => <code className="text-xs bg-bg-surface-2 px-1.5 py-0.5 rounded">frontend/lib/crypto.ts</code>,
            })}
          </p>
          <a href="https://github.com/RedderLabs/noctcom" target="_blank" rel="noopener noreferrer">
            <Button variant="outline" size="md" leftIcon={<Github className="size-4" />}>
              {t('footerCta.cta')}
            </Button>
          </a>
        </div>
      </div>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-sm font-semibold uppercase tracking-wider text-text-secondary mb-4 flex items-center gap-2">
        {title}
      </h2>
      {children}
    </section>
  );
}

function InfoCard({ icon, color, title, text }: { icon: string; color: string; title: string; text: string }) {
  const Icon = icon === 'lock' ? Lock : icon === 'shield' ? Shield : AlertTriangle;
  const colorMap: Record<string, string> = {
    violet: 'text-violet-300 bg-violet-500/10 border-violet-500/20',
    emerald: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/20',
    amber: 'text-amber-300 bg-amber-500/10 border-amber-500/20',
  };
  const c = colorMap[color] ?? colorMap.violet;
  const [textColor, bgColor, borderColor] = c.split(' ');
  return (
    <div className="flex gap-4 p-4 rounded-xl border border-border-faint bg-bg-surface">
      <div className={cn('size-9 rounded-lg grid place-items-center shrink-0 border', bgColor, borderColor)}>
        <Icon className={cn('size-4', textColor)} />
      </div>
      <div>
        <h4 className="text-sm font-medium mb-0.5">{title}</h4>
        <p className="text-xs text-text-tertiary leading-relaxed">{text}</p>
      </div>
    </div>
  );
}
