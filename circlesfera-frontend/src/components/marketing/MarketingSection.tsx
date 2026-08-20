import { clsx } from 'clsx';
import type { ReactNode } from 'react';
import { MarketingPageHeader } from './MarketingPageHeader';

interface MarketingSectionProps {
  id?: string;
  eyebrow?: string;
  title?: string;
  description?: string;
  children?: ReactNode;
  className?: string;
  /** Narrower content column (FAQ / forms). */
  narrow?: boolean;
  /** Wider column for product-led chapter rows with previews. */
  wide?: boolean;
  align?: 'left' | 'center';
}

/** Section wrapper — product landing scale. */
export function MarketingSection({
  id,
  eyebrow,
  title,
  description,
  children,
  className,
  narrow = false,
  wide = false,
  align = 'left',
}: MarketingSectionProps) {
  return (
    <section id={id} className={clsx('relative py-8 sm:py-12', className)}>
      <div
        className={clsx(
          'mx-auto px-4 sm:px-5',
          narrow ? 'max-w-2xl' : wide ? 'max-w-6xl' : 'max-w-3xl',
        )}
      >
        {(eyebrow || title || description) && (
          <MarketingPageHeader
            as="h2"
            eyebrow={eyebrow}
            title={title ?? ''}
            description={description}
            align={align}
            className="mb-6 sm:mb-8"
          />
        )}
        {children}
      </div>
    </section>
  );
}
