'use client';

import { Link } from '@/i18n/navigation';
import { Lock, Shield, EyeOff, AtSign, Share2, ArrowRight, Server, Download, Github, Newspaper, Megaphone, Scale, FileSignature } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Navbar } from '@/components/ui/Navbar';
import { SecurityDemo } from '@/components/landing/SecurityDemo';

export default function LandingPage() {
  return (
    <main className="relative min-h-screen flex flex-col">
      <Navbar variant="landing" />

      {/* ─── Hero ───────────────────────────────────────────── */}
      <section className="flex-1 flex items-center px-6 py-24">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-violet-500/20 bg-violet-500/5 mb-8">
            <span className="size-1.5 rounded-full bg-violet-400 animate-pulse" />
            <span className="text-xs text-violet-300 font-medium">Zero-Knowledge real · Cifrado en tu dispositivo · Open Source</span>
          </div>

          <h1 className="font-display text-6xl md:text-7xl font-light tracking-tight mb-6 leading-[1.05]">
            Tu bóveda privada.
            <br />
            <span className="text-gradient-violet font-normal">Cifrada antes de salir de tu dispositivo.</span>
          </h1>

          <p className="text-lg text-text-secondary max-w-xl mx-auto mb-10 leading-relaxed">
            La mayoría de las nubes prometen no mirar tus archivos. Noctcom está construido para que
            <strong className="text-text-primary font-medium"> no pueda</strong>, aunque quisiéramos.
            Tu contraseña y tus claves jamás tocan nuestros servidores. Nosotros solo guardamos cifrado que no sabemos abrir.
          </p>

          <div className="flex items-center justify-center gap-3 flex-wrap">
            <Link href="/signup">
              <Button variant="primary" size="lg" rightIcon={<ArrowRight className="size-4" />}>
                Empezar gratis · 1 GB
              </Button>
            </Link>
            <Link href="/login">
              <Button variant="outline" size="lg">Ya tengo cuenta</Button>
            </Link>
          </div>
        </div>
      </section>

      {/* ─── Features ───────────────────────────────────────── */}
      <section className="px-6 pb-24">
        <div className="max-w-5xl mx-auto grid md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { icon: Lock, title: 'Zero-Knowledge por defecto', body: 'No es una opción que activas: es la única forma en que funciona. Argon2id + XChaCha20-Poly1305.' },
            { icon: EyeOff, title: 'Ni los metadatos', body: 'Nombres, tamaños y etiquetas también van cifrados. No solo el contenido.' },
            { icon: AtSign, title: 'Sin tu email en claro', body: 'Ni siquiera almacenamos tu correo: solo un hash. Un volcado de la BD no revela quién eres.' },
            { icon: Share2, title: 'Compartir anónimo', body: 'Sealed boxes X25519: solo el destinatario abre el archivo. Ni nosotros, ni nadie con acceso al servidor.' },
          ].map((f, i) => (
            <div
              key={i}
              className="group relative p-5 rounded-xl border border-border-faint bg-bg-surface hover:border-border-subtle transition-all duration-200"
            >
              <div className="size-9 rounded-lg bg-violet-500/10 border border-violet-500/20 grid place-items-center mb-4 group-hover:bg-violet-500/15 transition-colors">
                <f.icon className="size-4 text-violet-300" />
              </div>
              <h3 className="font-medium mb-1.5 tracking-tight">{f.title}</h3>
              <p className="text-sm text-text-tertiary leading-relaxed">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ─── Demo en vídeo: la prueba de seguridad ──────────── */}
      <section className="px-6 pb-24">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-8">
            <h2 className="font-display text-2xl md:text-3xl font-light tracking-tight mb-3">
              No nos creas: <span className="text-gradient-violet font-normal">míralo</span>.
            </h2>
            <p className="text-text-secondary max-w-2xl mx-auto leading-relaxed">
              La prueba de seguridad completa en 84 segundos: qué pasa con tu contraseña,
              qué viaja por la red y qué ve (y qué no puede ver) nuestro propio servidor.
            </p>
          </div>
          <SecurityDemo />
        </div>
      </section>

      {/* ─── Foco: lo que no hacemos ────────────────────────── */}
      <section className="px-6 pb-24">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="font-display text-2xl md:text-3xl font-light tracking-tight mb-4">
            Lo que <span className="text-gradient-violet font-normal">no</span> hacemos.
          </h2>
          <p className="text-text-secondary leading-relaxed">
            Noctcom no es una suite de ofimática. No tenemos chat, ni videollamadas, ni editor de
            documentos online. Es deliberado: cada función que añade un servidor capaz de{' '}
            <em>leer</em> tus datos es una grieta en la privacidad. Hacemos{' '}
            <strong className="text-text-primary font-medium">una sola cosa</strong>{' '}
            —guardar tus archivos de forma que solo tú puedas leerlos— y la hacemos mejor que nadie.
          </p>
          <p className="text-sm text-text-tertiary leading-relaxed mt-5">
            Versionado de algoritmos preparado para post-cuántico (Kyber/Dilithium en hoja de ruta).
            Tu cifrado de hoy no caduca mañana.
          </p>
        </div>
      </section>

      {/* ─── ¿Para quién? ───────────────────────────────────── */}
      <section className="px-6 pb-24">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="font-display text-2xl md:text-3xl font-light tracking-tight mb-4">
              Para quien la privacidad <span className="text-gradient-violet font-normal">no es opcional</span>.
            </h2>
            <p className="text-text-secondary max-w-2xl mx-auto leading-relaxed">
              Si manejas material que no puede filtrarse —una investigación, una fuente, un expediente—
              necesitas algo más que la promesa de un proveedor de «no mirar». Necesitas que{' '}
              <strong className="text-text-primary font-medium">no pueda</strong>.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { icon: Newspaper, title: 'Periodismo de investigación', body: 'Guarda material sensible cifrado en tu dispositivo antes de que salga de él. Ni nosotros podemos abrirlo.' },
              { icon: Megaphone, title: 'Fuentes y denuncia', body: 'Comparte con tu redacción por sealed boxes X25519: solo el destinatario lo abre, ni con acceso al servidor.' },
              { icon: FileSignature, title: 'Secreto profesional', body: 'Abogados, médicos, periodistas: datos de clientes, pacientes o fuentes con cifrado que el proveedor no puede romper.' },
              { icon: Scale, title: 'Control y jurisdicción', body: 'Self-host AGPL: tus datos en tu propio hardware, fuera de jurisdicciones y proveedores ajenos.' },
            ].map((f, i) => (
              <div
                key={i}
                className="group relative p-5 rounded-xl border border-border-faint bg-bg-surface hover:border-border-subtle transition-all duration-200"
              >
                <div className="size-9 rounded-lg bg-violet-500/10 border border-violet-500/20 grid place-items-center mb-4 group-hover:bg-violet-500/15 transition-colors">
                  <f.icon className="size-4 text-violet-300" />
                </div>
                <h3 className="font-medium mb-1.5 tracking-tight">{f.title}</h3>
                <p className="text-sm text-text-tertiary leading-relaxed">{f.body}</p>
              </div>
            ))}
          </div>

          {/* Nota honesta: lo que viene + el modelo de amenaza real */}
          <div className="mt-6 rounded-xl border border-border-faint bg-bg-surface p-5 md:p-6">
            <p className="text-sm text-text-secondary leading-relaxed">
              <span className="text-violet-300 font-medium">En hoja de ruta — cadena de custodia verificable:</span>{' '}
              firma de autoría y sellado de tiempo para demostrar a un editor o un juez que un archivo es
              íntegro y de qué fecha es, <em>sin que nadie más lo lea</em>. Todo sobre hashes y firmas;
              el contenido nunca sale de tu control.
            </p>
            <p className="text-xs text-text-tertiary leading-relaxed mt-3">
              Honestidad ante todo: el cifrado zero-knowledge protege tus archivos en reposo, no te da
              anonimato de red. Para ocultar <em>con quién</em> hablas, combínalo con herramientas como
              Tor según tu modelo de amenaza. Y como todo en Noctcom, el código es abierto y auditable.
            </p>
          </div>
        </div>
      </section>

      {/* ─── Self-Host ──────────────────────────────────────── */}
      <section className="px-6 pb-24">
        <div className="max-w-4xl mx-auto">
          <div className="relative overflow-hidden rounded-2xl border border-border-subtle bg-bg-surface p-8 md:p-12">
            <div className="absolute inset-0 bg-gradient-to-br from-violet-500/5 via-transparent to-violet-500/5 pointer-events-none" />
            <div className="relative flex flex-col md:flex-row gap-8 items-center">
              <div className="flex-1">
                <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md bg-violet-500/10 border border-violet-500/20 mb-4">
                  <Server className="size-3.5 text-violet-300" />
                  <span className="text-xs text-violet-300 font-medium">Self-Hosted</span>
                </div>
                <h2 className="font-display text-2xl md:text-3xl font-light tracking-tight mb-3">
                  Tu servidor, tus reglas.
                </h2>
                <p className="text-text-secondary leading-relaxed mb-6">
                  Noctcom es 100% open source (AGPL-3.0). Despliégalo en tu propio hardware con
                  un solo comando Docker. Mismo cifrado, sin depender de terceros. Tu nube,
                  tu hardware, zero-knowledge de verdad.
                </p>
                <div className="flex flex-wrap gap-3">
                  <Button
                    variant="primary"
                    size="md"
                    leftIcon={<Download className="size-4" />}
                    onClick={() => {}}
                  >
                    Descargar v{process.env.NEXT_PUBLIC_APP_VERSION}
                  </Button>
                  <Button
                    variant="outline"
                    size="md"
                    leftIcon={<Github className="size-4" />}
                    onClick={() => {}}
                  >
                    Ver en GitHub
                  </Button>
                </div>
              </div>
              <div className="w-full md:w-80 shrink-0">
                <div className="rounded-lg bg-bg-deep border border-border-faint p-4 font-mono text-xs leading-relaxed">
                  <p className="text-text-muted"># Despliegue rápido</p>
                  <p className="text-violet-300 mt-1">git clone https://github.com/</p>
                  <p className="text-violet-300">  RedderLabs/noctcom.git</p>
                  <p className="text-text-secondary mt-2">cd noctcom</p>
                  <p className="text-text-secondary">cp .env.example .env</p>
                  <p className="text-violet-300 mt-2">docker compose up -d</p>
                  <p className="text-text-muted mt-2"># Listo en https://tu-dominio.com</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Self-host features ─────────────────────────────── */}
      <section className="px-6 pb-24">
        <div className="max-w-5xl mx-auto">
          <h2 className="font-display text-2xl font-light tracking-tight text-center mb-8">
            ¿Por qué self-host?
          </h2>
          <div className="grid md:grid-cols-3 gap-4">
            {[
              { icon: Server, title: 'Control total', body: 'Tus datos en tu infraestructura. Sin intermediarios, sin jurisdicciones externas.' },
              { icon: Shield, title: 'Auditable', body: 'Código abierto AGPL-3.0. Verifica cada línea que protege tus archivos.' },
              { icon: Lock, title: 'Mismo cifrado', body: 'Idénticas garantías criptográficas que la versión cloud. Zero-knowledge real.' },
            ].map((f, i) => (
              <div
                key={i}
                className="p-5 rounded-xl border border-border-faint bg-bg-surface hover:border-border-subtle transition-all"
              >
                <div className="size-9 rounded-lg bg-violet-500/10 border border-violet-500/20 grid place-items-center mb-4">
                  <f.icon className="size-4 text-violet-300" />
                </div>
                <h3 className="font-medium mb-1.5 tracking-tight">{f.title}</h3>
                <p className="text-sm text-text-tertiary leading-relaxed">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t border-border-faint py-6">
        <div className="max-w-6xl mx-auto px-6 text-xs text-text-tertiary flex justify-between items-center">
          <div className="flex items-center gap-4">
            <span>© {new Date().getFullYear()} Noctcom · AGPL-3.0</span>
            <Link href="/about" className="hover:text-text-secondary transition-colors">
              Nosotros
            </Link>
            <Link href="/security" className="hover:text-text-secondary transition-colors">
              Seguridad
            </Link>
            <Link href="/roadmap" className="hover:text-text-secondary transition-colors">
              Hoja de ruta
            </Link>
            <Link href={'/precios' as any} className="hover:text-text-secondary transition-colors">
              Precios
            </Link>
            <Link href={'/terminos' as any} className="hover:text-text-secondary transition-colors">
              Términos
            </Link>
            <Link href={'/privacidad' as any} className="hover:text-text-secondary transition-colors">
              Privacidad
            </Link>
            <Link href={'/cookies' as any} className="hover:text-text-secondary transition-colors">
              Cookies
            </Link>
            <a
              href="https://x.com/noctcom"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-text-secondary transition-colors"
              aria-label="Noctcom en X"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
            </a>
          </div>
          <span className="font-mono text-[10px]">
            v{process.env.NEXT_PUBLIC_APP_VERSION} · al día desde el {process.env.NEXT_PUBLIC_BUILT_AT}
          </span>
        </div>
      </footer>
    </main>
  );
}
