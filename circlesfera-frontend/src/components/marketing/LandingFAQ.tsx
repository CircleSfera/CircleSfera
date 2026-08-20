import { useTranslation } from 'react-i18next';
import { MarketingSection } from './MarketingSection';
import { ProductFaqList } from './ProductFaqList';

/**
 * Product FAQ — honest answers, no OUT OF SCOPE promises.
 */
export function LandingFAQ() {
  const { t } = useTranslation();

  return (
    <MarketingSection
      id="faq"
      eyebrow={t('landing.faq.badge')}
      title={t('landing.faq.title')}
      description={t('landing.faq.subtitle')}
      narrow
      align="left"
    >
      <ProductFaqList />
    </MarketingSection>
  );
}
