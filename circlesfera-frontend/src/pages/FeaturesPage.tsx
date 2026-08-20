import { useTranslation } from 'react-i18next';
import SEO from '../components/common/SEO';
import {
  MarketingCTA,
  MarketingPage,
  MarketingPageHeader,
  ProductChaptersList,
} from '../components/marketing';

/**
 * Guest /features — product surfaces with previews.
 */
export default function FeaturesPage() {
  const { t } = useTranslation();

  return (
    <MarketingPage atmosphere>
      <SEO
        title={t('landing.pages.features.seo_title')}
        description={t('landing.pages.features.seo_desc')}
      />

      <div className="mx-auto w-full max-w-6xl px-4 sm:px-5 pb-10 sm:pb-12">
        <MarketingPageHeader
          className="pt-8 sm:pt-10 pb-6 sm:pb-8"
          eyebrow={t('landing.features.badge')}
          title={t('landing.features.title')}
          description={t('landing.features.subtitle')}
          actions={
            <MarketingCTA to="/accounts/emailsignup" variant="primary">
              {t('landing.hero.get_started')}
            </MarketingCTA>
          }
        />
        <ProductChaptersList />
      </div>
    </MarketingPage>
  );
}
