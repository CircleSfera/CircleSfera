import { useTranslation } from 'react-i18next';
import SEO from '../components/common/SEO';
import {
  LandingCta,
  MarketingPage,
  MarketingPageHeader,
  ProductPrinciplesList,
} from '../components/marketing';

// Guest /principles — product principles (Principios).
export default function PrinciplesPage() {
  const { t } = useTranslation();

  return (
    <MarketingPage>
      <SEO
        title={t('landing.pages.principles.seo_title')}
        description={t('landing.pages.principles.seo_desc')}
      />

      <div className="mx-auto w-full max-w-3xl px-4 sm:px-5 pb-10 sm:pb-12">
        <MarketingPageHeader
          className="pt-12 sm:pt-20 pb-8 sm:pb-12"
          eyebrow={t('landing.principles.badge')}
          title={t('landing.principles.title')}
          description={t('landing.principles.subtitle')}
        />
        <ProductPrinciplesList />
      </div>
      <LandingCta />
    </MarketingPage>
  );
}
