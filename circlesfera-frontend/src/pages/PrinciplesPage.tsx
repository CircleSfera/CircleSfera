import { useTranslation } from 'react-i18next';
import SEO from '../components/common/SEO';
import {
  MarketingPage,
  MarketingPageHeader,
  ProductPrinciplesList,
} from '../components/marketing';

/**
 * Guest /principles — product principles (Principios).
 */
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
          className="pt-8 sm:pt-10 pb-6 sm:pb-8"
          eyebrow={t('landing.principles.badge')}
          title={t('landing.principles.title')}
          description={t('landing.principles.subtitle')}
        />
        <ProductPrinciplesList />
      </div>
    </MarketingPage>
  );
}
