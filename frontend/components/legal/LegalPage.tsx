'use client';

import { Link } from '@/i18n/navigation';
import { Navbar } from '@/components/ui/Navbar';

// Marco común de las páginas legales (términos, privacidad, cookies). Mantiene
// la estética del sitio y una cabecera con título + fecha de última revisión.
export function LegalPage({
  title,
  updated,
  intro,
  children,
}: {
  title: string;
  updated: string;
  intro?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen flex flex-col">
      <Navbar variant="back" />

      <div className="flex-1 max-w-3xl mx-auto px-6 py-12 w-full">
        <div className="mb-8">
          <h1 className="font-display text-4xl font-light tracking-tight mb-2">{title}</h1>
          <p className="text-xs font-mono uppercase tracking-wider text-text-tertiary">
            Última revisión: {updated}
          </p>
          {intro && <div className="mt-5 text-text-secondary leading-relaxed">{intro}</div>}
        </div>

        <article className="space-y-8">{children}</article>

        <nav className="mt-12 pt-6 border-t border-border-faint flex flex-wrap gap-x-5 gap-y-2 text-sm text-text-tertiary">
          <Link href={'/terminos' as any} className="hover:text-text-secondary transition-colors">Términos</Link>
          <Link href={'/privacidad' as any} className="hover:text-text-secondary transition-colors">Privacidad</Link>
          <Link href={'/cookies' as any} className="hover:text-text-secondary transition-colors">Cookies</Link>
          <Link href="/security" className="hover:text-text-secondary transition-colors">Seguridad</Link>
          <Link href="/about" className="hover:text-text-secondary transition-colors">Nosotros</Link>
        </nav>
      </div>
    </main>
  );
}

export function LegalSection({ id, title, children }: { id?: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-text-secondary mb-3">{title}</h2>
      <div className="space-y-3 text-sm text-text-secondary leading-relaxed">{children}</div>
    </section>
  );
}
