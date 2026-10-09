import { useTranslation } from 'react-i18next';
import SEO from '../components/common/SEO';
import {
  LandingChapters,
  LandingCta,
  LandingHero,
  LandingPrinciples,
  MarketingPage,
} from '../components/marketing';

// Guest landing `/` — product-led conversion page.
// Authenticated users never see this (App.tsx routes them to Home).
export default function LandingPage() {
  const { t } = useTranslation();

  return (
    <MarketingPage>
      <SEO
        title={t('landing.seo.title')}
        description={t('landing.seo.description')}
      />

      <LandingHero />
      <LandingChapters />
      <LandingPrinciples />
      <LandingCta />
    </MarketingPage>
  );
}
