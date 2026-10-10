import { useTranslation } from 'react-i18next';
import SEO from '../components/common/SEO';
import {
  MarketingPage,
  MarketingPageHeader,
  ProductFaqList,
} from '../components/marketing';

// Guest /faq — product FAQ (dedicated page for footer Producto).
export default function FaqPage() {
  const { t } = useTranslation();

  return (
    <MarketingPage>
      <SEO
        title={t('landing.pages.faq.seo_title')}
        description={t('landing.pages.faq.seo_desc')}
      />

      <div className="mx-auto w-full max-w-2xl px-4 sm:px-5 pb-10 sm:pb-12">
        <MarketingPageHeader
          className="pt-12 sm:pt-20 pb-8 sm:pb-12"
          eyebrow={t('landing.faq.badge')}
          title={t('landing.faq.title')}
          description={t('landing.faq.subtitle')}
        />
        <ProductFaqList />
      </div>
    </MarketingPage>
  );
}
