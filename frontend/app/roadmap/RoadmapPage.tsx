'use client';

import { Map, Check, Loader2, Sparkles, Github } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Navbar } from '@/components/ui/Navbar';
import { cn } from '@/lib/utils';

type Status = 'done' | 'progress' | 'next';

const MILESTONES: { status: Status; title: string; desc: string }[] = [
  // ─── Ya funciona ───
  { status: 'done', title: 'Núcleo criptográfico', desc: 'Argon2id, XChaCha20-Poly1305, Ed25519, X25519 y BLAKE2b, con la misma implementación en el navegador y en el servidor.' },
  { status: 'done', title: 'Cuentas y acceso', desc: 'Registro con frase mnemónica (BIP39), inicio de sesión por reto-respuesta con Ed25519 y verificación en dos pasos: passkeys (huella o cara) y código por email.' },
  { status: 'done', title: 'Tus archivos, cifrados', desc: 'Subida y descarga en trozos de 4 MiB, una clave por archivo, papelera y versiones. El servidor solo ve cifrado.' },
  { status: 'done', title: 'Vista previa de archivos', desc: 'Ver imágenes, vídeo, audio, texto y PDF descifrados en memoria, sin tener que descargarlos.' },
  { status: 'done', title: 'Compartir de extremo a extremo', desc: 'Compartes con otra persona usando sealed boxes (X25519): ni nosotros podemos abrir lo que circula.' },
  { status: 'done', title: 'Varios dispositivos', desc: 'Registras y revocas dispositivos, y tus claves se sincronizan desde tu contraseña sin pasar por el servidor en claro.' },
  { status: 'done', title: 'Cambios al instante', desc: 'Lo que tocas en un sitio aparece en el resto al momento, entre dispositivos y entre pestañas.' },
  { status: 'done', title: 'Recuperación de cuenta', desc: 'Con tu frase de 12 palabras recuperas el acceso y también tus archivos, re-cifrados con tu nueva contraseña.' },
  { status: 'done', title: 'Notificaciones', desc: 'Avisos cuando alguien comparte algo contigo, aunque tengas la app cerrada. El aviso nunca revela el contenido.' },
  { status: 'done', title: 'Tus propios discos', desc: 'Además de la nube, puedes usar discos físicos (USB/SATA) como almacenamiento y elegir dónde vive cada cosa.' },
  { status: 'done', title: 'Operación y fiabilidad', desc: 'TLS automático, límites de peticiones, monitorización de errores, copias de seguridad verificadas, chequeos de salud y guía para alojarlo tú mismo.' },
  { status: 'done', title: 'Aviso legal y privacidad', desc: 'Términos, política de privacidad (RGPD) y de cookies, sin rastreadores de terceros.' },
  // ─── En marcha ───
  { status: 'progress', title: 'Planes de almacenamiento', desc: 'Empieza gratis con 1 GB. Los planes mensuales para ampliar espacio están a punto; el self-host es siempre gratis.' },
  // ─── Más adelante ───
  { status: 'next', title: 'Auditoría independiente', desc: 'Una revisión de seguridad y un pentest por gente de fuera, cuando podamos costearlo.' },
  { status: 'next', title: 'Modo evidencia y cadena de custodia', desc: 'Demostrar que un archivo es íntegro y de qué fecha es, con sellado de tiempo, sin que nadie vea su contenido. Pensado para periodismo, denuncia y ámbito legal.' },
  { status: 'next', title: 'App móvil instalable', desc: 'Instala Noctcom en tu móvil o tablet (Android e iOS) para subir y consultar tus archivos cifrados.' },
  { status: 'next', title: 'App de escritorio', desc: 'Una sola aplicación que reúne tu bóveda y la gestión de tus discos, sin depender del navegador.' },
  { status: 'next', title: 'Tema claro y oscuro', desc: 'Elige el aspecto que más te guste, con mejoras de accesibilidad.' },
];

const GROUPS: { status: Status; label: string; icon: typeof Check; accent: string; iconBox: string; dot: string }[] = [
  { status: 'done', label: 'Ya funciona', icon: Check, accent: 'text-emerald-300', iconBox: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300', dot: 'bg-emerald-400' },
  { status: 'progress', label: 'En marcha', icon: Loader2, accent: 'text-amber-300', iconBox: 'bg-amber-500/10 border-amber-500/20 text-amber-300', dot: 'bg-amber-400' },
  { status: 'next', label: 'Más adelante', icon: Sparkles, accent: 'text-violet-300', iconBox: 'bg-violet-500/10 border-violet-500/20 text-violet-300', dot: 'bg-violet-400' },
];

export default function RoadmapPage() {
  return (
    <main className="min-h-screen flex flex-col">
      <Navbar variant="back" />

      <div className="flex-1 max-w-3xl mx-auto px-6 py-12 w-full">
        {/* Header */}
        <div className="mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-violet-500/20 bg-violet-500/5 mb-4">
            <Map className="size-3.5 text-violet-300" />
            <span className="text-xs text-violet-300 font-medium">Hoja de ruta · a la vista de todos</span>
          </div>
          <h1 className="font-display text-4xl font-light tracking-tight mb-3">A dónde va Noctcom</h1>
          <p className="text-text-secondary leading-relaxed max-w-2xl">
            Lo que ya funciona, lo que estamos rematando y lo que viene después. Sin fechas
            prometidas que luego no se cumplen: el núcleo —cifrado, cuentas, archivos, compartir—
            ya está en pie y sólido, y lo demás se va sumando encima. Todo el avance vive en abierto,
            así que la versión más fiable de esta lista siempre es el propio código.
          </p>
        </div>

        {/* Grupos */}
        <div className="space-y-10">
          {GROUPS.map((g) => {
            const items = MILESTONES.filter((m) => m.status === g.status);
            const GroupIcon = g.icon;
            return (
              <section key={g.status}>
                <div className="flex items-center gap-2.5 mb-4">
                  <span className={cn('size-2.5 rounded-full', g.dot)} />
                  <h2 className="text-sm font-semibold uppercase tracking-wider text-text-secondary">
                    {g.label}
                  </h2>
                  <span className="text-xs text-text-muted font-mono">{items.length}</span>
                </div>

                <div className="grid sm:grid-cols-2 gap-3">
                  {items.map((m) => (
                    <div
                      key={m.title}
                      className="flex gap-3 p-4 rounded-xl border border-border-faint bg-bg-surface hover:border-border-subtle transition-colors"
                    >
                      <div className={cn('size-8 rounded-lg grid place-items-center shrink-0 border', g.iconBox)}>
                        <GroupIcon className="size-4" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-sm font-medium text-text-primary mb-0.5">{m.title}</h3>
                        <p className="text-xs text-text-tertiary leading-relaxed">{m.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
        </div>

        {/* CTA */}
        <div className="mt-12 p-6 rounded-xl border border-border-subtle bg-bg-surface text-center">
          <h3 className="font-display text-lg font-medium mb-2">¿Echas algo en falta?</h3>
          <p className="text-sm text-text-tertiary mb-4 max-w-lg mx-auto">
            Las ideas y los fallos se cuentan en abierto. Si quieres proponer algo o ver el detalle
            fino de cada fase, pásate por el repositorio.
          </p>
          <a href="https://github.com/RedderLabs/noctcom" target="_blank" rel="noopener noreferrer">
            <Button variant="outline" size="md" leftIcon={<Github className="size-4" />}>
              Ver en GitHub
            </Button>
          </a>
        </div>
      </div>
    </main>
  );
}
