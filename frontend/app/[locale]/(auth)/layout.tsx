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

  // Con sesión activa no tiene sentido ver login/signup/recovery: al vault.
  useEffect(() => {
    if (checked && hasSession && !isVerify) {
      router.replace('/vault');
    }
  }, [checked, hasSession, isVerify, router]);

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

      <main className="flex-1 flex items-center justify-center px-6 pb-12">
        <div className="w-full max-w-md">{children}</div>
      </main>
    </div>
  );
}
