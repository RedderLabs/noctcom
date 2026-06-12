'use client';

import { Link } from '@/i18n/navigation';
import Image from 'next/image';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { useRouter, usePathname } from '@/i18n/navigation';
import { loadTokens } from '@/lib/api';
import { useAuth } from '@/lib/auth-store';

export default function AuthLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthenticated, isUnlocked, hydrate } = useAuth();
  const [checked, setChecked] = useState(false);

  // /verify sí debe ser accesible con una sesión recién creada (post-signup).
  const isVerify = pathname === '/verify';
  const hasSession = isAuthenticated && isUnlocked;

  useEffect(() => {
    loadTokens();
    hydrate();
    setChecked(true);

    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        m.addedNodes.forEach((node) => {
          if (node instanceof HTMLIFrameElement || node instanceof HTMLObjectElement) {
            node.remove();
          }
        });
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [hydrate]);

  // Con sesión activa no tiene sentido ver login/signup/recovery: a la app.
  // En self-host la app es el panel operativo (/panel); en la nube, /vault.
  const homePath = process.env.NEXT_PUBLIC_SELF_HOST === 'true' ? '/panel' : '/vault';
  useEffect(() => {
    if (checked && hasSession && !isVerify) {
      router.replace(homePath);
    }
  }, [checked, hasSession, isVerify, router, homePath]);

  // Evita el parpadeo del formulario mientras comprobamos o redirigimos.
  if (!checked || (hasSession && !isVerify)) {
    return <div className="min-h-screen bg-bg-base" />;
  }

  return (
    <div className="min-h-screen flex flex-col">
      <div className="px-6 h-16 flex items-center">
        <Link href="/" className="flex items-center gap-2.5 group">
          <Image src="/logo.svg" alt="" width={28} height={28} priority unoptimized />
          <span className="font-display text-sm tracking-tight text-text-secondary group-hover:text-text-primary transition-colors">Noctcom</span>
        </Link>
      </div>

      <main className="flex-1 flex flex-col items-center justify-center px-6 pb-12">
        <div className="w-full max-w-md">{children}</div>

        {/* Self-host: marca "tu instancia" bajo el formulario (la pantalla de
            desbloqueo de la bóveda). El login YA es el desbloqueo (deriva la
            master key con Argon2id en el dispositivo); aquí solo se identifica
            la instancia local, sin tocar ese flujo. */}
        {process.env.NEXT_PUBLIC_SELF_HOST === 'true' && (
          <div className="mt-7 flex flex-col items-center gap-3 text-center">
            <span className="font-mono text-[9.5px] font-medium tracking-wider text-violet-300 px-2.5 py-1 rounded-full border border-border-strong bg-violet-500/[0.06]">
              LOCAL · ZERO-KNOWLEDGE
            </span>
            <span className="flex items-center gap-2 font-mono text-[11.5px] text-text-muted">
              <span className="size-[7px] rounded-full bg-success" />
              noctcom · self-host · en línea
            </span>
          </div>
        )}
      </main>
    </div>
  );
}
