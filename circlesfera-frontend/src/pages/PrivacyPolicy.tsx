import {
  AtSign,
  Bot,
  Clock,
  Cookie,
  Database,
  FileText,
  Share2,
  UserCheck,
  Zap,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { LegalDocumentLayout } from '../components/marketing';

const SECTIONS = [
  { id: 'controller', icon: AtSign },
  { id: 'data', icon: Database },
  { id: 'purposes', icon: Zap },
  { id: 'automated-decisions', icon: Bot },
  { id: 'recipients', icon: Share2 },
  { id: 'retention', icon: Clock },
  { id: 'rights', icon: UserCheck },
  { id: 'cookies', icon: Cookie },
  { id: 'changes', icon: FileText },
];

export default function PrivacyPolicy() {
  const { t } = useTranslation();

  const sections = SECTIONS.map(({ id, icon }, index) => ({
    id,
    icon,
    title: t(`legal.privacy.sections.s${index + 1}_title`),
    content: t(`legal.privacy.sections.s${index + 1}_content`),
  }));

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
