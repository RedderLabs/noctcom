'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ArrowLeft, FileQuestion } from 'lucide-react';
import { useRouter, Link } from '@/i18n/navigation';
import { useVault, type DecryptedNode } from '@/lib/vault-store';
import { FilePreviewModal } from '@/components/vault/FilePreviewModal';
import { Button } from '@/components/ui/Button';
import { PageHeader } from '@/components/selfhost/PageHeader';

export default function VisorPage() {
  // useSearchParams exige un límite Suspense en el build de Next.
  return (
    <Suspense fallback={null}>
      <VisorInner />
    </Suspense>
  );
}

function VisorInner() {
  const t = useTranslations('selfhost');
  const router = useRouter();
  const params = useSearchParams();
  const fileId = params.get('f');
  const { nodes, initialized, init, loadRecent, loadStarred } = useVault();
  const [node, setNode] = useState<DecryptedNode | null>(null);
  const [resolved, setResolved] = useState(false);

  useEffect(() => { init(); }, [init]);

  // Busca el nodo en la carpeta actual; si no está, en recientes y destacados.
  // No abrimos nada por su cuenta: el descifrado ocurre al pulsar en el modal.
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!fileId) { setResolved(true); return; }
      const inCurrent = nodes.find((n) => n.id === fileId && n.kind === 'file');
      if (inCurrent) { setNode(inCurrent); setResolved(true); return; }
      const [recent, starred] = await Promise.all([loadRecent(), loadStarred()]);
      if (!alive) return;
      const found = [...recent, ...starred].find((n) => n.id === fileId && n.kind === 'file') ?? null;
      setNode(found);
      setResolved(true);
    })();
    return () => { alive = false; };
  }, [fileId, nodes, loadRecent, loadStarred, initialized]);

  return (
    <>
      <PageHeader
        crumbs={['bóveda', node?.name ?? 'visor']}
        title={t('viewer.title')}
        actions={
          <Button variant="ghost" size="sm" leftIcon={<ArrowLeft className="size-3.5" />} onClick={() => router.push('/archivos')}>
            {t('viewer.back')}
          </Button>
        }
      />

      {resolved && !node && (
        <div className="py-24 text-center">
          <div className="size-14 rounded-full bg-bg-surface border border-border-subtle grid place-items-center mx-auto mb-3">
            <FileQuestion className="size-5 text-text-tertiary" />
          </div>
          <p className="text-sm text-text-tertiary mb-4">{t('viewer.notFound')}</p>
          <Link href={'/archivos' as any} className="text-violet-300 hover:text-violet-200 text-sm">{t('viewer.back')}</Link>
        </div>
      )}

      {node && (
        <FilePreviewModal open onClose={() => router.push('/archivos')} node={node} />
      )}
    </>
  );
}
