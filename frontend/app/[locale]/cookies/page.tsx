import type { Metadata } from 'next';
import { useTranslations } from 'next-intl';
import { LegalPage, LegalSection } from '@/components/legal/LegalPage';

export const metadata: Metadata = {
  title: 'Política de Cookies · Noctcom',
  description: 'Noctcom no usa cookies de rastreo. Solo cookies estrictamente necesarias de seguridad.',
  alternates: { canonical: '/cookies' },
};

const UPDATED = '4 de junio de 2026';

export default function CookiesPage() {
  const t = useTranslations('cookies');
  return (
    <LegalPage
      title={t('title')}
      updated={UPDATED}
      intro={
        <p>
          {t.rich('intro', {
            strong: (c) => <strong className="text-text-primary">{c}</strong>,
          })}
        </p>
      }
    >
      <LegalSection title={t('necessary.title')}>
        <p>
          {t.rich('necessary.p1', {
            strong: (c) => <strong className="text-text-primary">{c}</strong>,
          })}
        </p>
        <ul className="list-disc pl-5 space-y-1.5 marker:text-violet-400">
          <li>
            {t.rich('necessary.item1', {
              code: (c) => <code className="text-xs bg-bg-surface-2 px-1.5 py-0.5 rounded">{c}</code>,
            })}
          </li>
          <li>
            {t.rich('necessary.item2', {
              code: (c) => <code className="text-xs bg-bg-surface-2 px-1.5 py-0.5 rounded">{c}</code>,
            })}
          </li>
        </ul>
        <p>
          {t.rich('necessary.p2', {
            strong: (c) => <strong className="text-text-primary">{c}</strong>,
          })}
        </p>
      </LegalSection>

      <LegalSection title={t('notUsed.title')}>
        <p>
          {t.rich('notUsed.p1', {
            strong: (c) => <strong className="text-text-primary">{c}</strong>,
          })}
        </p>
      </LegalSection>

      <LegalSection title={t('localStorage.title')}>
        <p>
          {t.rich('localStorage.p1', {
            strong: (c) => <strong className="text-text-primary">{c}</strong>,
          })}
        </p>
        <ul className="list-disc pl-5 space-y-1.5 marker:text-violet-400">
          <li>
            {t.rich('localStorage.item1', {
              strong: (c) => <strong className="text-text-primary">{c}</strong>,
            })}
          </li>
          <li>
            {t.rich('localStorage.item2', {
              strong: (c) => <strong className="text-text-primary">{c}</strong>,
            })}
          </li>
        </ul>
      </LegalSection>

      <LegalSection title={t('manage.title')}>
        <p>{t('manage.p1')}</p>
      </LegalSection>
    </LegalPage>
  );
}
