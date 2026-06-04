'use client';

import { useState } from 'react';
import { Link } from '@/i18n/navigation';
import { Shield, Lock, ExternalLink, FileText, AlertTriangle, Github } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Navbar } from '@/components/ui/Navbar';
import { cn } from '@/lib/utils';

type Tab = 'crypto' | 'threats';

export default function SecurityPage() {
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
          <h1 className="font-display text-4xl font-light tracking-tight mb-3">Seguridad y criptografía</h1>
          <p className="text-text-secondary leading-relaxed max-w-2xl">
            No te pedimos que confíes en nuestra palabra. Noctcom está hecho para que, aunque
            quisiéramos, {' '}<strong className="text-text-primary font-medium">no podamos</strong>{' '}
            leer tus archivos: tus claves nacen y se quedan en tu dispositivo, y al servidor solo le llega
            cifrado que no sabe abrir. Aquí te contamos exactamente cómo, sin rodeos. Y si algo de esta
            página no cuadra con el código, abre un issue — al final manda el código, no las promesas.
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
              <span className="text-sm font-medium block">Spec criptográfica</span>
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
              <span className="text-sm font-medium block">Modelo de amenazas</span>
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
              <span className="text-sm font-medium block">Reportar vulnerabilidad</span>
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
            <span className="flex items-center gap-2"><Lock className="size-3.5" /> Especificación criptográfica</span>
          </button>
          <button
            onClick={() => setTab('threats')}
            className={cn(
              'px-4 py-2 rounded-md text-sm transition-colors',
              tab === 'threats' ? 'bg-amber-500/20 text-amber-200' : 'text-text-tertiary hover:text-text-secondary',
            )}
          >
            <span className="flex items-center gap-2"><AlertTriangle className="size-3.5" /> Modelo de amenazas</span>
          </button>
        </div>

        {/* Crypto Spec */}
        {tab === 'crypto' && (
          <article className="animate-fade-in space-y-8">
            <Section title="Primitivas criptográficas">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border-faint">
                    <th className="text-left py-2 text-[10px] font-mono uppercase tracking-wider text-text-tertiary">Función</th>
                    <th className="text-left py-2 text-[10px] font-mono uppercase tracking-wider text-text-tertiary">Algoritmo</th>
                    <th className="text-left py-2 text-[10px] font-mono uppercase tracking-wider text-text-tertiary">Parámetros</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-faint">
                  {[
                    ['KDF', 'Argon2id', 'OPSLIMIT_MODERATE, 256 MiB'],
                    ['AEAD', 'XChaCha20-Poly1305', 'nonce 24B, tag 16B'],
                    ['HKDF', 'BLAKE2b-keyed', 'output 32B'],
                    ['Firmas', 'Ed25519', 'RFC 8032'],
                    ['Key Exchange', 'X25519', 'RFC 7748'],
                    ['Sealed Boxes', 'X25519 + XSalsa20-Poly1305', 'nonce derivado'],
                    ['Hash', 'BLAKE2b-256', 'output 32B'],
                  ].map(([fn, algo, params]) => (
                    <tr key={fn} className="text-text-secondary">
                      <td className="py-2.5 font-mono text-violet-300">{fn}</td>
                      <td className="py-2.5">{algo}</td>
                      <td className="py-2.5 text-xs text-text-tertiary">{params}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>

            <Section title="Jerarquía de claves">
              <div className="p-4 rounded-lg bg-bg-deep border border-border-faint font-mono text-xs leading-loose">
                <p className="text-text-muted">{'// Derivación completa desde la contraseña'}</p>
                <p className="text-violet-300 mt-1">password</p>
                <p className="text-text-tertiary">  │ Argon2id(salt, opsLimit, memLimit)</p>
                <p className="text-violet-300">  ▼</p>
                <p className="text-emerald-300">Master Key (MK)</p>
                <p className="text-text-tertiary">  ├── BLAKE2b(&quot;vault.wrap&quot;) → K_vault_wrap</p>
                <p className="text-text-tertiary">  │     └── Unwrap → vault_key → file_key → chunks</p>
                <p className="text-text-tertiary">  ├── BLAKE2b(&quot;login.sign&quot;) → seed → Ed25519 keypair</p>
                <p className="text-text-tertiary">  └── Unwrap → sk_exchange (X25519)</p>
                <p className="text-text-muted mt-3">{'// Rama paralela: la frase de recuperación (12 palabras BIP39)'}</p>
                <p className="text-amber-300">mnemónica</p>
                <p className="text-text-tertiary">  │ BLAKE2b(key=&quot;recovery.v1&quot;)</p>
                <p className="text-amber-300">  ▼</p>
                <p className="text-emerald-300">recovery seed</p>
                <p className="text-text-tertiary">  ├── Ed25519 → firma el challenge de recuperación</p>
                <p className="text-text-tertiary">  └── BLAKE2b(&quot;recovery.box.v1&quot;) → X25519 → abre los seals del kit</p>
              </div>
            </Section>

            <Section title="Recuperación de cuenta (kit v2)">
              <p className="text-sm text-text-secondary mb-3 leading-relaxed">
                Tu frase de 12 palabras (BIP39, 128 bits de entropía) no solo recupera el acceso:
                recupera también <strong className="text-text-primary font-medium">tus archivos</strong>.
                De ella se deriva un par X25519 cuya clave pública queda registrada en el servidor;
                con esa pública, tu navegador <em>sella</em> (crypto_box_seal) la clave de cada bóveda
                y tu clave de intercambio. Sellar solo necesita la pública — abrir los seals, solo la
                privada, que únicamente existe si tienes la frase.
              </p>
              <div className="space-y-3">
                <InfoCard icon="key" color="amber" title="Olvidaste la contraseña → nada se pierde" text="La frase firma un reto, el servidor entrega los seals, tu navegador los abre y re-cifra las claves de bóveda con tu nueva contraseña. Los archivos y lo que te han compartido siguen contigo." />
                <InfoCard icon="lock" color="violet" title="El servidor solo guarda sobres cerrados" text="Los seals son ciphertext: ni Noctcom ni un atacante con la base de datos pueden abrirlos. La privada que los abre se deriva de tu frase y nunca viaja." />
                <InfoCard icon="shield" color="emerald" title="Pierdes frase Y contraseña → irrecuperable" text="No hay puerta trasera, ni 'contacta con soporte'. Es el precio del zero-knowledge real, y lo decimos sin letra pequeña." />
              </div>
            </Section>

            <Section title="Cifrado de archivos">
              <div className="space-y-3">
                <InfoCard icon="lock" color="violet" title="Chunks de 4 MiB" text="Cada archivo se divide en chunks de 4 MiB, cifrados independientemente con XChaCha20-Poly1305. Cada chunk usa un nonce aleatorio de 24 bytes." />
                <InfoCard icon="shield" color="emerald" title="AAD anti-reorder" text="Cada chunk incluye su índice como Additional Authenticated Data (AAD = 'chunk:N'). Impide que un atacante reordene chunks." />
                <InfoCard icon="key" color="amber" title="Content hash" text="BLAKE2b-256 sobre todos los chunks cifrados. Verifica integridad en cada descarga." />
              </div>
            </Section>

            <Section title="Zero-knowledge email">
              <div className="p-4 rounded-lg bg-bg-deep border border-border-faint font-mono text-xs leading-loose">
                <p className="text-text-muted">{'// El servidor nunca ve tu email'}</p>
                <p className="text-text-secondary">email_hash = BLAKE2b(</p>
                <p className="text-text-secondary">{'  message = normalize(email),'}</p>
                <p className="text-text-secondary">{'  key = "noctcom.email.v1",'}</p>
                <p className="text-text-secondary">{'  output = 32 bytes'}</p>
                <p className="text-text-secondary">)</p>
              </div>
            </Section>

            <Section title="Auditorías externas">
              <div className="p-4 rounded-xl border border-border-faint bg-bg-surface">
                <p className="text-sm text-text-secondary">
                  Aún no se han realizado auditorías externas. Cuando se completen, los reportes completos
                  se publicarán aquí y en el repositorio.
                </p>
                <p className="text-xs text-text-tertiary mt-2">
                  Mientras tanto, el código es 100% auditable en{' '}
                  <a href="https://github.com/RedderLabs/noctcom" target="_blank" rel="noopener noreferrer" className="text-violet-300 hover:text-violet-200">
                    GitHub
                  </a>.
                </p>
              </div>
            </Section>
          </article>
        )}

        {/* Threat Model */}
        {tab === 'threats' && (
          <article className="animate-fade-in space-y-8">
            <Section title="Adversarios considerados">
              <div className="space-y-2">
                {[
                  { id: 'A1', name: 'Operador malicioso', desc: 'Empleado de Noctcom con acceso a infraestructura', color: 'text-red-400 bg-red-500/10' },
                  { id: 'A2', name: 'Dump de base de datos', desc: 'Breach, orden judicial, o error operativo', color: 'text-orange-400 bg-orange-500/10' },
                  { id: 'A3', name: 'MITM activo', desc: 'ISP malicioso, WiFi comprometido, BGP hijacking', color: 'text-amber-400 bg-amber-500/10' },
                  { id: 'A4', name: 'Coerción legal', desc: 'NSL, gag order, orden judicial', color: 'text-violet-400 bg-violet-500/10' },
                  { id: 'A5', name: 'Cliente comprometido', desc: 'Malware, keylogger, RAT en tu dispositivo', color: 'text-slate-400 bg-slate-500/10' },
                ].map((a) => (
                  <div key={a.id} className="flex items-center gap-4 p-4 rounded-xl border border-border-faint bg-bg-surface">
                    <span className={cn('text-xs font-mono font-bold px-2 py-1 rounded', a.color)}>{a.id}</span>
                    <div>
                      <span className="text-sm font-medium">{a.name}</span>
                      <p className="text-xs text-text-tertiary">{a.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </Section>

            <Section title="Matriz de protección">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border-faint">
                      <th className="text-left py-2 text-[10px] font-mono uppercase tracking-wider text-text-tertiary">Amenaza</th>
                      <th className="text-center py-2 text-[10px] font-mono uppercase tracking-wider text-text-tertiary">A1</th>
                      <th className="text-center py-2 text-[10px] font-mono uppercase tracking-wider text-text-tertiary">A2</th>
                      <th className="text-center py-2 text-[10px] font-mono uppercase tracking-wider text-text-tertiary">A3</th>
                      <th className="text-center py-2 text-[10px] font-mono uppercase tracking-wider text-text-tertiary">A4</th>
                      <th className="text-center py-2 text-[10px] font-mono uppercase tracking-wider text-text-tertiary">A5</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-faint">
                    {[
                      ['Leer contenido de archivos', '✅', '✅', '✅', '✅', '❌'],
                      ['Leer nombres de archivos', '✅', '✅', '✅', '✅', '❌'],
                      ['Obtener master key', '✅', '✅', '✅', '✅', '❌'],
                      ['Fuerza bruta offline', '—', '⚠️', '—', '—', '❌'],
                      ['Suplantar identidad', '✅', '⚠️', '✅', '⚠️', '❌'],
                      ['Bloquear acceso', '❌', '—', '✅', '❌', '—'],
                      ['Modificar archivos', '✅', '⚠️', '✅', '✅', '❌'],
                      ['Inferir patrones de uso', '❌', '❌', '❌', '❌', '❌'],
                    ].map(([threat, ...cols]) => (
                      <tr key={threat} className="text-text-secondary">
                        <td className="py-2.5 text-xs">{threat}</td>
                        {cols.map((v, i) => (
                          <td key={i} className="py-2.5 text-center">{v}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex gap-4 mt-3 text-[10px] text-text-muted font-mono">
                <span>✅ Protegido</span>
                <span>⚠️ Parcial</span>
                <span>❌ No protegido</span>
              </div>
            </Section>

            <Section title="Qué NO protegemos">
              <div className="space-y-2">
                {[
                  'Malware o keylogger en tu dispositivo',
                  'Acceso físico a tu dispositivo desbloqueado',
                  'Coerción física (rubber-hose cryptanalysis)',
                  'Negación plausible (no hay volúmenes ocultos)',
                  'Anonimato de red (usa Tor si lo necesitas)',
                  'Mensajería en tiempo real (usa Signal)',
                ].map((item) => (
                  <div key={item} className="flex items-center gap-3 px-4 py-3 rounded-lg bg-red-500/5 border border-red-500/10">
                    <span className="text-red-400 text-sm">✕</span>
                    <span className="text-sm text-text-secondary">{item}</span>
                  </div>
                ))}
              </div>
            </Section>

            <Section title="Supuestos criptográficos">
              <p className="text-sm text-text-secondary mb-3">
                Si alguna de estas primitivas se rompe (ej. quantum computing real), migraremos a
                primitivas post-quantum (Kyber, Dilithium) mediante re-encryption + rotación de claves.
              </p>
              <div className="space-y-1">
                {[
                  { prim: 'Argon2id', assumption: 'Resistente a GPU/ASIC en 256 MiB' },
                  { prim: 'XChaCha20-Poly1305', assumption: 'IND-CCA2 con nonces 24B' },
                  { prim: 'Ed25519', assumption: 'EUF-CMA en curva edwards25519' },
                  { prim: 'X25519', assumption: 'DDH en curva25519' },
                  { prim: 'BLAKE2b', assumption: 'Resistencia a colisiones de 256 bits' },
                ].map((s) => (
                  <div key={s.prim} className="flex items-center gap-4 px-4 py-2.5 rounded-lg hover:bg-bg-surface transition-colors">
                    <span className="text-sm font-mono text-violet-300 w-48 shrink-0">{s.prim}</span>
                    <span className="text-xs text-text-tertiary">{s.assumption}</span>
                  </div>
                ))}
              </div>
            </Section>
          </article>
        )}

        {/* Footer CTA */}
        <div className="mt-12 p-6 rounded-xl border border-border-subtle bg-bg-surface text-center">
          <h3 className="font-display text-lg font-medium mb-2">Audita el código tú mismo</h3>
          <p className="text-sm text-text-tertiary mb-4 max-w-lg mx-auto">
            Todo el código es público bajo AGPL-3.0. Las implementaciones de referencia están en{' '}
            <code className="text-xs bg-bg-surface-2 px-1.5 py-0.5 rounded">backend/src/crypto/</code> y{' '}
            <code className="text-xs bg-bg-surface-2 px-1.5 py-0.5 rounded">frontend/lib/crypto.ts</code>
          </p>
          <a href="https://github.com/RedderLabs/noctcom" target="_blank" rel="noopener noreferrer">
            <Button variant="outline" size="md" leftIcon={<Github className="size-4" />}>
              Ver repositorio
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
