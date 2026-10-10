import { useTranslation } from 'react-i18next';
import { FeatureShowcase } from './FeatureShowcase';
import { MarketingSection } from './MarketingSection';

// What you can do in CircleSfera, one block per feature.
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
      <div className="mt-12 sm:mt-20">
        <FeatureShowcase />
      </div>
    </MarketingSection>
  );
}
