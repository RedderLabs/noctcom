import Link from 'next/link';
import type { ReactNode } from 'react';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      {/* Top bar mínima */}
      <div className="px-6 h-16 flex items-center">
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="size-7 rounded-md bg-gradient-to-br from-violet-500 to-violet-700 grid place-items-center shadow-[0_0_16px_-4px_rgba(139,92,246,0.6)]">
            <span className="font-display text-white font-semibold text-xs">N</span>
          </div>
          <span className="font-display text-sm tracking-tight text-[var(--color-text-secondary)] group-hover:text-[var(--color-text-primary)] transition-colors">Noctcom</span>
        </Link>
      </div>

      {/* Contenido centrado */}
      <main className="flex-1 flex items-center justify-center px-6 pb-12">
        <div className="w-full max-w-md">{children}</div>
      </main>
    </div>
  );
}
