import {
  BadgeCheck,
  Ban,
  BookOpen,
  Coins,
  Copyright,
  Flag,
  Gavel,
  Heart,
  Undo2,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { LegalDocumentLayout } from '../components/marketing';

const SECTIONS = [
  { id: 'purpose', icon: BookOpen },
  { id: 'respect', icon: Heart },
  { id: 'not-allowed', icon: Ban },
  { id: 'authenticity', icon: BadgeCheck },
  { id: 'copyright', icon: Copyright },
  { id: 'creators', icon: Coins },
  { id: 'reporting', icon: Flag },
  { id: 'sanctions', icon: Gavel },
  { id: 'appeals', icon: Undo2 },
] as const;

export default function CommunityGuidelines() {
  const { t } = useTranslation();

  return (
    <LegalDocumentLayout
      seoTitle={t('legal.community.title')}
      headerTitle={t('legal.community.header_title')}
      badgeKey="legal.badges.community_hub"
      quoteKey="legal.quotes.community"
      sections={SECTIONS.map(({ id, icon }, index) => ({
        id,
        icon,
        title: t(`legal.community.sections.s${index + 1}_title`),
        content: t(`legal.community.sections.s${index + 1}_content`),
      }))}
    />
  );
}
