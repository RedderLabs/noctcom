import type { Metadata } from 'next';
import { useTranslations } from 'next-intl';
import { LegalPage, LegalSection } from '@/components/legal/LegalPage';

export const metadata: Metadata = {
  title: 'Términos de Servicio · Noctcom',
  description: 'Términos y condiciones de uso de Noctcom, almacenamiento cifrado zero-knowledge.',
  alternates: { canonical: '/terminos' },
};

const UPDATED = '2026-06-04';

export default function TerminosPage() {
  const t = useTranslations('terms');
  return (
    <LegalPage
      title={t('title')}
      updated={UPDATED}
      intro={
        <p>
          {t.rich('intro', {
            link: (c) => <a href="mailto:hello@noctcom.com" className="text-violet-300 hover:text-violet-200">{c}</a>,
          })}
        </p>
      }
    >
      <LegalSection title={t('provider.title')}>
        <p>
          {t.rich('provider.p1', {
            strong: (c) => <strong className="text-text-primary">{c}</strong>,
            link: (c) => <a href="mailto:hello@noctcom.com" className="text-violet-300 hover:text-violet-200">{c}</a>,
          })}
        </p>
        <p>
          {t.rich('provider.p2', {
            strong: (c) => <strong className="text-text-primary">{c}</strong>,
            em: (c) => <em>{c}</em>,
          })}
        </p>
      </LegalSection>

      <LegalSection title={t('what.title')}>
        <p>
          {t.rich('what.p1', {
            strong: (c) => <strong className="text-text-primary">{c}</strong>,
          })}
        </p>
        <p>
          {t.rich('what.p2', {
            strong: (c) => <strong className="text-text-primary">{c}</strong>,
          })}
        </p>
      </LegalSection>

      <LegalSection title={t('account.title')}>
        <p>
          {t.rich('account.p1', {
            strong: (c) => <strong className="text-text-primary">{c}</strong>,
          })}
        </p>
        <p className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-text-secondary">
          {t.rich('account.warning', {
            strong: (c) => <strong className="text-text-primary">{c}</strong>,
            strongAmber: (c) => <strong className="text-amber-200">{c}</strong>,
          })}
        </p>
      </LegalSection>

      <LegalSection title={t('acceptableUse.title')}>
        <p>
          {t.rich('acceptableUse.p1', {
            strong: (c) => <strong className="text-text-primary">{c}</strong>,
          })}
        </p>
        <p>{t('acceptableUse.p2')}</p>
      </LegalSection>

      <LegalSection title={t('yourFiles.title')}>
        <p>{t('yourFiles.p1')}</p>
      </LegalSection>

      <LegalSection title={t('plans.title')}>
        <p>
          {t.rich('plans.p1', {
            strong: (c) => <strong className="text-text-primary">{c}</strong>,
          })}
        </p>
      </LegalSection>

      <LegalSection title={t('availability.title')}>
        <p>
          {t.rich('availability.p1', {
            strong: (c) => <strong className="text-text-primary">{c}</strong>,
          })}
        </p>
      </LegalSection>

      <LegalSection title={t('liability.title')}>
        <p>
          {t.rich('liability.p1', {
            strong: (c) => <strong className="text-text-primary">{c}</strong>,
          })}
        </p>
      </LegalSection>

      <LegalSection title={t('cancellation.title')}>
        <p>{t('cancellation.p1')}</p>
      </LegalSection>

      <LegalSection title={t('changes.title')}>
        <p>{t('changes.p1')}</p>
      </LegalSection>

      <LegalSection title={t('law.title')}>
        <p>
          {t.rich('law.p1', {
            link: (c) => <a href="/privacidad" className="text-violet-300 hover:text-violet-200">{c}</a>,
          })}
        </p>
      </LegalSection>
    </LegalPage>
  );
}
