import { Helmet } from 'react-helmet-async';

interface SEOProps {
  title?: string;
  description?: string;
  canonical?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  ogType?: string;
  twitterHandle?: string;
}

export default function SEO({
  title = 'CircleSfera - Social Reimagined',
  description = 'CircleSfera is a refined social layer designed for visual storytelling, authentic connections, and immersive experiences.',
  canonical,
  ogTitle,
  ogDescription,
  ogImage = '/og-image.jpg', // Default OG image
  ogType = 'website',
  twitterHandle = '@circlesfera',
}: SEOProps) {
  const siteTitle = title.includes('CircleSfera')
    ? title
    : `${title} | CircleSfera`;
  const metaDescription = description;

  return (
    <Helmet>
      {/* Standard Metadata */}
      <title>{siteTitle}</title>
      <meta name="description" content={metaDescription} />
      {canonical && <link rel="canonical" href={canonical} />}

      {/* Open Graph / Facebook */}
      <meta property="og:type" content={ogType} />
      <meta property="og:title" content={ogTitle || siteTitle} />
      <meta
        property="og:description"
        content={ogDescription || metaDescription}
      />
      <meta property="og:image" content={ogImage} />

      {/* Twitter */}
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
