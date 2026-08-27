import { AlertTriangle, Eye, Heart, MessageCircle, Star } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { LegalDocumentLayout } from '../components/marketing';

export default function CommunityGuidelines() {
  const { t } = useTranslation();

  const sections = [
    {
      id: 'overview',
      title: t('legal.community.sections.s1_title'),
      icon: Star,
      content: t('legal.community.sections.s1_content'),
    },
    {
      id: 'respect',
      title: t('legal.community.sections.s2_title'),
      icon: Heart,
      content: t('legal.community.sections.s2_content'),
    },
    {
      id: 'content',
      title: t('legal.community.sections.s3_title'),
      icon: Eye,
      content: t('legal.community.sections.s3_content'),
    },
    {
      id: 'spam',
      title: t('legal.community.sections.s4_title'),
      icon: AlertTriangle,
      content: t('legal.community.sections.s4_content'),
    },
    {
      id: 'monetization',
      title: t('legal.community.sections.s5_title'),
      icon: MessageCircle,
      content: t('legal.community.sections.s5_content'),
    },
  ];

  return (
    <LegalDocumentLayout
      seoTitle={t('legal.community.title')}
      headerTitle={t('legal.community.header_title')}
      badgeKey="legal.badges.community_hub"
      quoteKey="legal.quotes.community"
      sections={sections}
    />
  );
}
