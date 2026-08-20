import { useTranslation } from 'react-i18next';
import { MarketingSection } from './MarketingSection';
import { ProductChaptersList } from './ProductChaptersList';

/**
 * Product chapters — Bento Grid showcase.
 */
export function LandingChapters() {
  const { t } = useTranslation();

  return (
    <MarketingSection
      id="chapters"
      eyebrow={t('landing.features.badge')}
      title={t('landing.features.title')}
      description={t('landing.features.subtitle')}
      wide
      align="center"
    >
      <div className="mt-12">
        <ProductChaptersList />
      </div>
    </MarketingSection>
  );
}
