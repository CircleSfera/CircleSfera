import { clsx } from 'clsx';
import type { ReactNode } from 'react';

interface MarketingPageHeaderProps {
  eyebrow?: string;
  title: ReactNode;
  description?: string;
  actions?: ReactNode;
  align?: 'left' | 'center';
  /** Use h1 for page tops; h2 for in-page sections that already have a page h1. */
  as?: 'h1' | 'h2';
  className?: string;
  children?: ReactNode;
}

/**
 * Shared guest page / section header.
 */
export function MarketingPageHeader({
  eyebrow,
  title,
  description,
  actions,
  align = 'left',
  as = 'h1',
  className,
  children,
}: MarketingPageHeaderProps) {
  const TitleTag = as;

  return (
    <header
      className={clsx(align === 'center' && 'text-center mx-auto', className)}
    >
      {eyebrow && (
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand-primary mb-2">
          {eyebrow}
        </p>
      )}
      <TitleTag
        className={clsx(
          'font-black tracking-tight text-white leading-[1.12]',
          as === 'h1' ? 'text-3xl sm:text-4xl' : 'text-xl sm:text-2xl',
        )}
      >
        {title}
      </TitleTag>
      {description && (
        <p
          className={clsx(
            'mt-3 text-base text-white/60 leading-relaxed',
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
