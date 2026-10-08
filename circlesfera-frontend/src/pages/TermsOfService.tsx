import {
  AlertCircle,
  CloudUpload,
  Coins,
  CreditCard,
  Handshake,
  Landmark,
  ListChecks,
  Megaphone,
  RefreshCw,
  Scale,
  Trash2,
  UserCheck,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { LegalDocumentLayout } from '../components/marketing';

const SECTIONS = [
  { id: 'acceptance', icon: Handshake },
  { id: 'eligibility', icon: UserCheck },
  { id: 'your-content', icon: CloudUpload },
  { id: 'rules', icon: ListChecks },
  { id: 'moderation', icon: Scale },
  { id: 'plans', icon: CreditCard },
  { id: 'creators', icon: Coins },
  { id: 'promotions', icon: Megaphone },
  { id: 'closing', icon: Trash2 },
  { id: 'liability', icon: AlertCircle },
  { id: 'changes', icon: RefreshCw },
  { id: 'law', icon: Landmark },
] as const;

export default function TermsOfService() {
  const { t } = useTranslation();

  return (
    <LegalDocumentLayout
      seoTitle={t('legal.terms.title')}
      headerTitle={t('legal.terms.header_title')}
      badgeKey="legal.badges.terms_hub"
      quoteKey="legal.quotes.terms"
      sections={SECTIONS.map(({ id, icon }, index) => ({
        id,
        icon,
        title: t(`legal.terms.sections.s${index + 1}_title`),
        content: t(`legal.terms.sections.s${index + 1}_content`),
      }))}
    />
  );
}
