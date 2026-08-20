import { useTranslation } from 'react-i18next';
import { MarketingSection } from './MarketingSection';
import { ProductPrinciplesList } from './ProductPrinciplesList';

/**
 * Product principles — dense typographic rows, not glass cards.
 */
export function LandingPrinciples() {
  const { t } = useTranslation();

  return (
    <MarketingSection
      id="principles"
      eyebrow={t('landing.principles.badge')}
      title={t('landing.principles.title')}
      description={t('landing.principles.subtitle')}
    >
      <ProductPrinciplesList />
    </MarketingSection>
  );
}
