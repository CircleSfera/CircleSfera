import { clsx } from 'clsx';
import type { ReactNode } from 'react';

interface MarketingPageHeaderProps {
  eyebrow?: string;
  title: ReactNode;
  description?: string;
  actions?: ReactNode;
  align?: 'left' | 'center';
  // Use h1 for page tops; h2 for in-page sections that already have a page h1.
  as?: 'h1' | 'h2';
  // A smaller title, for a block inside a page that is not a main section.
  compact?: boolean;
  className?: string;
  children?: ReactNode;
}

// Shared guest page / section header.
export function MarketingPageHeader({
  eyebrow,
  title,
  description,
  actions,
  align = 'left',
  as = 'h1',
  compact = false,
  className,
  children,
}: MarketingPageHeaderProps) {
  const TitleTag = as;

  return (
    <header
      className={clsx(align === 'center' && 'text-center mx-auto', className)}
    >
      {eyebrow && (
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-brand-primary mb-3">
          {eyebrow}
        </p>
      )}
      <TitleTag
        className={clsx(
          'font-black tracking-tight text-white leading-[1.06]',
          compact
            ? 'text-2xl sm:text-3xl'
            : as === 'h1'
              ? 'text-4xl sm:text-5xl lg:text-6xl'
              : 'text-3xl sm:text-4xl lg:text-5xl',
        )}
      >
        {title}
      </TitleTag>
      {description && (
        <p
          className={clsx(
            'mt-4 text-base sm:text-lg text-white/65 leading-relaxed',
            align === 'center' ? 'max-w-xl mx-auto' : 'max-w-2xl',
          )}
        >
          {description}
        </p>
      )}
      {actions && (
        <div
          className={clsx(
            'mt-5 flex flex-col sm:flex-row gap-3',
            align === 'center' &&
              'items-stretch sm:items-center justify-center',
          )}
        >
          {actions}
        </div>
      )}
      {children}
    </header>
  );
}
