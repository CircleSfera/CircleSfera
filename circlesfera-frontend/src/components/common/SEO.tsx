import { Helmet } from 'react-helmet-async';
import { useTranslation } from 'react-i18next';

interface SEOProps {
  title?: string;
  description?: string;
  canonical?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  ogType?: string;
  twitterHandle?: string;
  // When true, emits robots noindex,nofollow (e.g. 404 pages).
  noIndex?: boolean;
}

export default function SEO({
  title,
  description,
  canonical,
  ogTitle,
  ogDescription,
  ogImage = '/og-image.jpg', // Default OG image
  ogType = 'website',
  twitterHandle = '@circlesfera',
  noIndex = false,
}: SEOProps) {
  const { t } = useTranslation();
  const resolvedTitle = title ?? t('common.seo_default_title');
  const metaDescription = description ?? t('common.seo_default_description');
  const siteTitle = resolvedTitle.includes('CircleSfera')
    ? resolvedTitle
    : `${resolvedTitle} | CircleSfera`;

  return (
    <Helmet>
      {/* Standard Metadata */}
      <title>{siteTitle}</title>
      <meta name="description" content={metaDescription} />
      {noIndex && <meta name="robots" content="noindex, nofollow" />}
      {canonical && <link rel="canonical" href={canonical} />}

      {/* Open Graph meta tags */}
      <meta property="og:type" content={ogType} />
      <meta property="og:title" content={ogTitle || siteTitle} />
      <meta
        property="og:description"
        content={ogDescription || metaDescription}
      />
      <meta property="og:image" content={ogImage} />

      {/* Twitter Card meta tags */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={ogTitle || siteTitle} />
      <meta
        name="twitter:description"
        content={ogDescription || metaDescription}
      />
      <meta name="twitter:image" content={ogImage} />
      <meta name="twitter:site" content={twitterHandle} />
    </Helmet>
  );
}
