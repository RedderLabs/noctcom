'use client';

import { useEffect, useRef } from 'react';
import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { useVault } from '@/lib/vault-store';
import { flushSharedUploads } from '@/lib/shared-intake';

// Share target (Android): destino de la redirección que hace el service worker
// tras interceptar el POST del menú "Compartir". El layout (app) ya garantiza
// sesión activa antes de renderizar esto; cuando la bóveda está inicializada,
// subimos el archivo compartido (cifrado en el dispositivo) y volvemos al vault.
export default function SharePage() {
  const t = useTranslations('pwa');
  const router = useRouter();
  const initialized = useVault((s) => s.initialized);
  const currentVaultId = useVault((s) => s.currentVaultId);
  const done = useRef(false);

  useEffect(() => {
    if (done.current || !initialized || !currentVaultId) return;
    done.current = true;
    (async () => {
      await flushSharedUploads();
      router.replace('/vault'); // replace: "atrás" no vuelve a esta página técnica
    })();
  }, [initialized, currentVaultId, router]);

  return (
    <div className="h-full grid place-items-center px-8">
      <div className="text-center space-y-4">
        <Loader2 className="size-8 text-violet-400 animate-spin mx-auto" />
        <p className="text-sm text-text-secondary">{t('share.receiving')}</p>
        <p className="text-xs text-text-tertiary font-mono">{t('share.encrypting')}</p>
      </div>
    </div>
  );
}
