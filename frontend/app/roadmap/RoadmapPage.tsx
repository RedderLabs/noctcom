'use client';

import { Map, Check, Loader2, Sparkles, Github } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Navbar } from '@/components/ui/Navbar';
import { cn } from '@/lib/utils';

type Status = 'done' | 'progress' | 'next';

const MILESTONES: { status: Status; title: string; desc: string }[] = [
  { status: 'done', title: 'Núcleo criptográfico', desc: 'Argon2id, XChaCha20-Poly1305, Ed25519, X25519 y BLAKE2b, con la misma implementación en el navegador y en el servidor.' },
  { status: 'done', title: 'Cuentas y acceso', desc: 'Registro con frase mnemónica (BIP39), inicio de sesión por reto-respuesta con Ed25519 y verificación en dos pasos (TOTP).' },
  { status: 'done', title: 'Tus archivos, cifrados', desc: 'Subida y descarga en trozos de 4 MiB, una clave por archivo, papelera y versiones. El servidor solo ve cifrado.' },
  { status: 'done', title: 'Compartir de extremo a extremo', desc: 'Compartes con otra persona usando sealed boxes (X25519): ni nosotros podemos abrir lo que circula.' },
  { status: 'done', title: 'Varios dispositivos', desc: 'Registras y revocas dispositivos, y tus claves se sincronizan desde tu contraseña sin pasar por el servidor en claro.' },
  { status: 'done', title: 'Cambios al instante', desc: 'Lo que tocas en un sitio aparece en el resto al momento, entre dispositivos y entre pestañas (Redis pub/sub + WebSocket).' },
  { status: 'done', title: 'Tus propios discos', desc: 'Además de la nube, puedes usar discos físicos (USB/SATA) como almacenamiento y elegir dónde vive cada cosa.' },
  { status: 'done', title: 'Listo para producción', desc: 'TLS automático, límites de peticiones, chequeos de salud, logs estructurados y una guía para alojarlo tú mismo.' },
  { status: 'progress', title: 'Recuperación de cuenta', desc: 'Recuperar el acceso con tu frase mnemónica. El flujo está, le damos el último repaso.' },
  { status: 'progress', title: 'Llaves de seguridad (WebAuthn)', desc: 'Entrar con una passkey o una llave física. Falta cerrar la verificación final.' },
  { status: 'next', title: 'Vista previa de archivos', desc: 'Ver imágenes, texto y PDF descifrados en memoria, sin tener que descargarlos.' },
  { status: 'next', title: 'Notificaciones', desc: 'Avisos de algo compartido contigo o de actividad en tu cuenta, aunque tengas la app cerrada.' },
  { status: 'next', title: 'Auditoría independiente', desc: 'Una revisión de seguridad y un pentest por gente de fuera, cuando podamos costearlo.' },
];

const META: Record<Status, { label: string; icon: typeof Check; cls: string; dot: string }> = {
  done: { label: 'Hecho', icon: Check, cls: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/20', dot: 'bg-emerald-400' },
  progress: { label: 'En marcha', icon: Loader2, cls: 'text-amber-300 bg-amber-500/10 border-amber-500/20', dot: 'bg-amber-400' },
  next: { label: 'Más adelante', icon: Sparkles, cls: 'text-violet-300 bg-violet-500/10 border-violet-500/20', dot: 'bg-violet-400' },
};

export default function RoadmapPage() {
  const done = MILESTONES.filter((m) => m.status === 'done').length;

  return (
    <main className="min-h-screen flex flex-col">
      <Navbar variant="back" />

      <div className="flex-1 max-w-3xl mx-auto px-6 py-12 w-full">
        {/* Header */}
        <div className="mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-violet-500/20 bg-violet-500/5 mb-4">
            <Map className="size-3.5 text-violet-300" />
            <span className="text-xs text-violet-300 font-medium">Hoja de ruta · en construcción a la vista de todos</span>
          </div>
          <h1 className="font-display text-4xl font-light tracking-tight mb-3">A dónde va Noctcom</h1>
          <p className="text-[var(--color-text-secondary)] leading-relaxed max-w-2xl">
            Lo que ya funciona, lo que estamos rematando y lo que viene después. Sin fechas
            prometidas que luego no se cumplen: el núcleo —cifrado, cuentas, archivos, compartir—
            ya está en pie y sólido, y lo demás se va sumando encima. Todo el avance vive en abierto,
            así que la versión más fiable de esta lista siempre es el propio código.
          </p>
        </div>

        {/* Leyenda */}
        <div className="flex flex-wrap gap-4 mb-8 text-xs text-[var(--color-text-tertiary)]">
          {(Object.keys(META) as Status[]).map((s) => (
            <span key={s} className="inline-flex items-center gap-2">
              <span className={cn('size-2 rounded-full', META[s].dot)} />
              {META[s].label}
            </span>
          ))}
          <span className="ml-auto text-[var(--color-text-muted)]">{done} de {MILESTONES.length} hitos en marcha</span>
        </div>

        {/* Timeline */}
        <ol className="relative border-l border-[var(--color-border-faint)] ml-2">
          {MILESTONES.map((m) => {
            const meta = META[m.status];
            const Icon = meta.icon;
            return (
              <li key={m.title} className="ml-6 mb-6 last:mb-0">
                <span className={cn('absolute -left-[9px] mt-1.5 size-4 rounded-full ring-4 ring-[var(--color-bg-base)]', meta.dot)} />
                <div className="p-4 rounded-xl border border-[var(--color-border-faint)] bg-[var(--color-bg-surface)]">
                  <div className="flex items-center gap-2 mb-1.5">
                    <h2 className="text-sm font-medium text-[var(--color-text-primary)]">{m.title}</h2>
                    <span className={cn('inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border', meta.cls)}>
                      <Icon className="size-3" /> {meta.label}
                    </span>
                  </div>
                  <p className="text-xs text-[var(--color-text-tertiary)] leading-relaxed">{m.desc}</p>
                </div>
              </li>
            );
          })}
        </ol>

        {/* CTA */}
        <div className="mt-12 p-6 rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] text-center">
          <h3 className="font-display text-lg font-medium mb-2">¿Echas algo en falta?</h3>
          <p className="text-sm text-[var(--color-text-tertiary)] mb-4 max-w-lg mx-auto">
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
