import type { Metadata } from 'next';
import { useTranslations } from 'next-intl';
import { LegalPage, LegalSection } from '@/components/legal/LegalPage';

export const metadata: Metadata = {
  title: 'Política de Privacidad · Noctcom',
  description: 'Cómo Noctcom trata (y sobre todo, cómo NO puede tratar) tus datos. Zero-knowledge y RGPD.',
  alternates: { canonical: '/privacidad' },
};

const UPDATED = '4 de junio de 2026';

export default function PrivacidadPage() {
  const t = useTranslations('privacy');
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
      <LegalSection title={t('controller.title')}>
        <p>
          {t.rich('controller.p1', {
            strong: (c) => <strong className="text-text-primary">{c}</strong>,
            link: (c) => <a href="mailto:hello@noctcom.com" className="text-violet-300 hover:text-violet-200">{c}</a>,
          })}
        </p>
      </LegalSection>

      <LegalSection title={t('zeroKnowledge.title')}>
        <p>
          {t.rich('zeroKnowledge.p1', {
            strong: (c) => <strong className="text-text-primary">{c}</strong>,
          })}
        </p>
      </LegalSection>

      <LegalSection title={t('data.title')}>
        <p>{t('data.intro')}</p>
        <ul className="list-disc pl-5 space-y-2 marker:text-violet-400">
          <li>
            {t.rich('data.item1', {
              strong: (c) => <strong className="text-text-primary">{c}</strong>,
            })}
          </li>
          <li>
            {t.rich('data.item2', {
              strong: (c) => <strong className="text-text-primary">{c}</strong>,
            })}
          </li>
          <li>
            {t.rich('data.item3', {
              strong: (c) => <strong className="text-text-primary">{c}</strong>,
            })}
          </li>
          <li>
            {t.rich('data.item4', {
              strong: (c) => <strong className="text-text-primary">{c}</strong>,
            })}
          </li>
          <li>
            {t.rich('data.item5', {
              strong: (c) => <strong className="text-text-primary">{c}</strong>,
            })}
          </li>
          <li>
            {t.rich('data.item6', {
              strong: (c) => <strong className="text-text-primary">{c}</strong>,
            })}
          </li>
        </ul>
        <p>
          {t.rich('data.outro', {
            strong: (c) => <strong className="text-text-primary">{c}</strong>,
            link: (c) => <a href="/cookies" className="text-violet-300 hover:text-violet-200">{c}</a>,
          })}
        </p>
      </LegalSection>

      <LegalSection title={t('purpose.title')}>
        <ul className="list-disc pl-5 space-y-2 marker:text-violet-400">
          <li>
            {t.rich('purpose.item1', {
              strong: (c) => <strong className="text-text-primary">{c}</strong>,
            })}
          </li>
          <li>
            {t.rich('purpose.item2', {
              strong: (c) => <strong className="text-text-primary">{c}</strong>,
            })}
          </li>
          <li>
            {t.rich('purpose.item3', {
              strong: (c) => <strong className="text-text-primary">{c}</strong>,
            })}
          </li>
          <li>
            {t.rich('purpose.item4', {
              strong: (c) => <strong className="text-text-primary">{c}</strong>,
            })}
          </li>
        </ul>
      </LegalSection>

      <LegalSection title={t('processors.title')}>
        <p>{t('processors.p1')}</p>
        <ul className="list-disc pl-5 space-y-1.5 marker:text-violet-400">
          <li>
            {t.rich('processors.item1', {
              strong: (c) => <strong className="text-text-primary">{c}</strong>,
            })}
          </li>
          <li>
            {t.rich('processors.item2', {
              strong: (c) => <strong className="text-text-primary">{c}</strong>,
            })}
          </li>
          <li>
            {t.rich('processors.item3', {
              strong: (c) => <strong className="text-text-primary">{c}</strong>,
            })}
          </li>
          <li>
            {t.rich('processors.item4', {
              strong: (c) => <strong className="text-text-primary">{c}</strong>,
            })}
          </li>
          <li>
            {t.rich('processors.item5', {
              strong: (c) => <strong className="text-text-primary">{c}</strong>,
            })}
          </li>
          <li>
            {t.rich('processors.item6', {
              strong: (c) => <strong className="text-text-primary">{c}</strong>,
            })}
          </li>
          <li>
            {t.rich('processors.item7', {
              strong: (c) => <strong className="text-text-primary">{c}</strong>,
            })}
          </li>
        </ul>
        <p>{t('processors.outro')}</p>
      </LegalSection>

      <LegalSection title={t('retention.title')}>
        <ul className="list-disc pl-5 space-y-1.5 marker:text-violet-400">
          <li>
            {t.rich('retention.item1', {
              strong: (c) => <strong className="text-text-primary">{c}</strong>,
            })}
          </li>
          <li>
            {t.rich('retention.item2', {
              strong: (c) => <strong className="text-text-primary">{c}</strong>,
            })}
          </li>
          <li>
            {t.rich('retention.item3', {
              strong: (c) => <strong className="text-text-primary">{c}</strong>,
            })}
          </li>
          <li>
            {t.rich('retention.item4', {
              strong: (c) => <strong className="text-text-primary">{c}</strong>,
            })}
          </li>
        </ul>
      </LegalSection>

      <LegalSection title={t('rights.title')}>
        <p>{t('rights.intro')}</p>
        <ul className="list-disc pl-5 space-y-1.5 marker:text-violet-400">
          <li>
            {t.rich('rights.item1', {
              strong: (c) => <strong className="text-text-primary">{c}</strong>,
            })}
          </li>
          <li>
            {t.rich('rights.item2', {
              strong: (c) => <strong className="text-text-primary">{c}</strong>,
            })}
          </li>
          <li>
            {t.rich('rights.item3', {
              strong: (c) => <strong className="text-text-primary">{c}</strong>,
            })}
          </li>
          <li>
            {t.rich('rights.item4', {
              strong: (c) => <strong className="text-text-primary">{c}</strong>,
            })}
          </li>
        </ul>
        <p>
          {t.rich('rights.outro', {
            link: (c) => <a href="mailto:hello@noctcom.com" className="text-violet-300 hover:text-violet-200">{c}</a>,
            authority: (c) => <a href="https://www.aepd.es" target="_blank" rel="noopener noreferrer" className="text-violet-300 hover:text-violet-200">{c}</a>,
          })}
        </p>
        <p className="text-text-tertiary text-xs">
          {t('rights.note')}
        </p>
      </LegalSection>

      <LegalSection title={t('minors.title')}>
        <p>{t('minors.p1')}</p>
      </LegalSection>

      <LegalSection title={t('changes.title')}>
        <p>{t('changes.p1')}</p>
      </LegalSection>
    </LegalPage>
  );
}
