import { AtSign, Database, Eye, ShieldCheck, Zap } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { LegalDocumentLayout } from '../components/marketing';

export default function PrivacyPolicy() {
  const { t } = useTranslation();

  const sections = [
    {
      id: 'overview',
      title: t('legal.privacy.sections.s1_title'),
      icon: Eye,
      content: t('legal.privacy.sections.s1_content'),
    },
    {
      id: 'collection',
      title: t('legal.privacy.sections.s2_title'),
      icon: Database,
      content: t('legal.privacy.sections.s2_content'),
    },
    {
      id: 'usage',
      title: t('legal.privacy.sections.s3_title'),
      icon: Zap,
      content: t('legal.privacy.sections.s3_content'),
    },
    {
      id: 'security',
      title: t('legal.privacy.sections.s4_title'),
      icon: ShieldCheck,
      content: t('legal.privacy.sections.s4_content'),
    },
    {
      id: 'contact',
      title: t('legal.privacy.sections.s5_title'),
      icon: AtSign,
      content: t('legal.privacy.sections.s5_content'),
    },
  ];

  return (
    <LegalDocumentLayout
      seoTitle={t('legal.privacy.title')}
      headerTitle={t('legal.privacy.header_title')}
      badgeKey="legal.badges.privacy_hub"
      quoteKey="legal.quotes.privacy"
      sections={sections}
    />
  );
}
