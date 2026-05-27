'use client';

import Link from 'next/link';
import { Lock, Shield, KeyRound, FileSearch, ArrowRight, Server, Download, Github } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export default function LandingPage() {
  return (
    <main className="relative min-h-screen flex flex-col">
      {/* ─── Navbar ─────────────────────────────────────────── */}
      <nav className="border-b border-[var(--color-border-faint)] backdrop-blur-md bg-[var(--color-bg-base)]/60 sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="relative">
              <div className="size-8 rounded-lg bg-gradient-to-br from-violet-500 to-violet-700 grid place-items-center shadow-[0_0_20px_-4px_rgba(139,92,246,0.6)]">
                <span className="font-display text-white font-semibold text-sm tracking-tight">N</span>
              </div>
              <span className="absolute -inset-px rounded-lg ring-1 ring-violet-400/30 pointer-events-none" />
            </div>
            <span className="font-display font-medium tracking-tight">Noctcom</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/login">
              <Button variant="ghost" size="sm">Iniciar sesión</Button>
            </Link>
            <Link href="/signup">
              <Button variant="primary" size="sm" rightIcon={<ArrowRight className="size-3.5" />}>
                Crear cuenta
              </Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* ─── Hero ───────────────────────────────────────────── */}
      <section className="flex-1 flex items-center px-6 py-24">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-violet-500/20 bg-violet-500/5 mb-8">
            <span className="size-1.5 rounded-full bg-violet-400 animate-pulse" />
            <span className="text-xs text-violet-300 font-medium">Zero-Knowledge · Cifrado E2E · Open Source</span>
          </div>

          <h1 className="font-display text-6xl md:text-7xl font-light tracking-tight mb-6 leading-[1.05]">
            Tu bóveda privada.
            <br />
            <span className="text-gradient-violet font-normal">Cifrada en tu dispositivo.</span>
          </h1>

          <p className="text-lg text-[var(--color-text-secondary)] max-w-xl mx-auto mb-10 leading-relaxed">
            Almacenamiento privado donde ni siquiera nosotros podemos leer tus archivos.
            Tu contraseña jamás abandona tu dispositivo. Tus claves jamás tocan nuestros servidores.
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
            { icon: Lock, title: 'Zero-Knowledge', body: 'Argon2id + XChaCha20. El servidor solo ve ciphertext.' },
            { icon: Shield, title: '2FA + Passkeys', body: 'TOTP de base, WebAuthn opcional, phishing-resistant.' },
            { icon: KeyRound, title: 'Recuperación segura', body: 'Frase de 12 palabras. Tú controlas el acceso.' },
            { icon: FileSearch, title: 'Búsqueda local', body: 'Índice cifrado en tu navegador. Sin telemetría.' },
          ].map((f, i) => (
            <div
              key={i}
              className="group relative p-5 rounded-xl border border-[var(--color-border-faint)] bg-[var(--color-bg-surface)] hover:border-[var(--color-border-subtle)] transition-all duration-200"
            >
              <div className="size-9 rounded-lg bg-violet-500/10 border border-violet-500/20 grid place-items-center mb-4 group-hover:bg-violet-500/15 transition-colors">
                <f.icon className="size-4 text-violet-300" />
              </div>
              <h3 className="font-medium mb-1.5 tracking-tight">{f.title}</h3>
              <p className="text-sm text-[var(--color-text-tertiary)] leading-relaxed">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ─── Self-Host ──────────────────────────────────────── */}
      <section className="px-6 pb-24">
        <div className="max-w-4xl mx-auto">
          <div className="relative overflow-hidden rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] p-8 md:p-12">
            <div className="absolute inset-0 bg-gradient-to-br from-violet-500/5 via-transparent to-violet-500/5 pointer-events-none" />
            <div className="relative flex flex-col md:flex-row gap-8 items-center">
              <div className="flex-1">
                <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/20 mb-4">
                  <Server className="size-3.5 text-emerald-300" />
                  <span className="text-xs text-emerald-300 font-medium">Self-Hosted</span>
                </div>
                <h2 className="font-display text-2xl md:text-3xl font-light tracking-tight mb-3">
                  Tu servidor, tus reglas.
                </h2>
                <p className="text-[var(--color-text-secondary)] leading-relaxed mb-6">
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
                    Descargar v0.1.0
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
                <div className="rounded-lg bg-[var(--color-bg-deep)] border border-[var(--color-border-faint)] p-4 font-mono text-xs leading-relaxed">
                  <p className="text-[var(--color-text-muted)]"># Despliegue rápido</p>
                  <p className="text-emerald-300 mt-1">git clone https://github.com/</p>
                  <p className="text-emerald-300">  RedderLabs/noctcom.git</p>
                  <p className="text-[var(--color-text-secondary)] mt-2">cd noctcom</p>
                  <p className="text-[var(--color-text-secondary)]">cp .env.example .env</p>
                  <p className="text-violet-300 mt-2">docker compose up -d</p>
                  <p className="text-[var(--color-text-muted)] mt-2"># Listo en https://tu-dominio.com</p>
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
                className="p-5 rounded-xl border border-[var(--color-border-faint)] bg-[var(--color-bg-surface)] hover:border-[var(--color-border-subtle)] transition-all"
              >
                <div className="size-9 rounded-lg bg-emerald-500/10 border border-emerald-500/20 grid place-items-center mb-4">
                  <f.icon className="size-4 text-emerald-300" />
                </div>
                <h3 className="font-medium mb-1.5 tracking-tight">{f.title}</h3>
                <p className="text-sm text-[var(--color-text-tertiary)] leading-relaxed">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t border-[var(--color-border-faint)] py-6">
        <div className="max-w-6xl mx-auto px-6 text-xs text-[var(--color-text-tertiary)] flex justify-between items-center">
          <div className="flex items-center gap-4">
            <span>© {new Date().getFullYear()} Noctcom · AGPL-3.0</span>
            <Link href="/security" className="hover:text-[var(--color-text-secondary)] transition-colors">
              Seguridad
            </Link>
            <a
              href="https://x.com/noctcom"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-[var(--color-text-secondary)] transition-colors"
              aria-label="Noctcom en X"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
            </a>
          </div>
          <span className="font-mono text-[10px]">v0.1.0 · build {process.env.NODE_ENV}</span>
        </div>
      </footer>
    </main>
  );
}
