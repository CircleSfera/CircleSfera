import { AlertCircle, CloudUpload, Scale, Star, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { LegalDocumentLayout } from '../components/marketing';

export default function TermsOfService() {
  const { t } = useTranslation();

  const sections = [
    {
      id: 'acceptable-use',
      title: t('legal.terms.sections.s1_title'),
      icon: Scale,
      content: t('legal.terms.sections.s1_content'),
    },
    {
      id: 'subscriptions',
      title: t('legal.terms.sections.s2_title'),
      icon: Star,
      content: t('legal.terms.sections.s2_content'),
    },
    {
      id: 'content-ownership',
      title: t('legal.terms.sections.s3_title'),
      icon: CloudUpload,
      content: t('legal.terms.sections.s3_content'),
    },
    {
      id: 'termination',
      title: t('legal.terms.sections.s4_title'),
      icon: Trash2,
      content: t('legal.terms.sections.s4_content'),
    },
    {
      id: 'liability',
      title: t('legal.terms.sections.s5_title'),
      icon: AlertCircle,
      content: t('legal.terms.sections.s5_content'),
    },
  ];

  return (
    <LegalDocumentLayout
      seoTitle={t('legal.terms.title')}
      headerTitle={t('legal.terms.header_title')}
      badgeKey="legal.badges.terms_hub"
      quoteKey="legal.quotes.terms"
      lastUpdatedKey="legal.last_updated.terms"
      sections={sections}
    />
  );
}
