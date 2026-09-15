import type { ReactNode } from 'react';

/** Shared stepped-path shell (ADR-0018). Mobile full-bleed; desktop card. */
export const COMPOSER_CARD_DEFAULT =
  'relative flex flex-col min-h-0 w-full bg-surface-elevated border-white/8 overflow-hidden max-md:h-full max-md:max-h-none max-md:rounded-none max-md:border-0 max-md:shadow-none md:max-w-sm md:w-full md:h-[min(90dvh,720px)] md:rounded-3xl md:border md:shadow-[0_8px_32px_rgba(0,0,0,0.4)]';

/** Caption / two-column desktop — compact card (not full 3xl); options stay readable. */
export const COMPOSER_CARD_WIDE =
  'relative flex flex-col min-h-0 w-full bg-surface-elevated border-white/8 overflow-hidden max-md:h-full max-md:max-h-none max-md:rounded-none max-md:border-0 max-md:shadow-none md:max-w-xl md:w-full md:h-[min(90dvh,720px)] md:rounded-3xl md:border md:shadow-[0_8px_32px_rgba(0,0,0,0.4)]';

/**
 * Caption option SubScreens on desktop: height follows content (no tall empty shell).
 * Mobile remains full-bleed like default.
 */
export const COMPOSER_CARD_FIT =
  'relative flex flex-col min-h-0 w-full bg-surface-elevated border-white/8 overflow-hidden max-md:h-full max-md:max-h-none max-md:rounded-none max-md:border-0 max-md:shadow-none md:max-w-sm md:w-full md:h-auto md:max-h-[min(85dvh,560px)] md:rounded-3xl md:border md:shadow-[0_8px_32px_rgba(0,0,0,0.4)]';

/** @deprecated Use COMPOSER_CARD_DEFAULT */
export const COMPOSER_CARD_CLASS = COMPOSER_CARD_DEFAULT;

/** Root shell for compact option SubScreens (flow height on md; full-bleed on mobile). */
export const SUBSCREEN_SHELL =
  'z-50 flex flex-col w-full min-h-0 bg-surface-elevated max-md:absolute max-md:inset-0 max-md:h-full';

/** Scroll body: grows only on mobile so desktop cards hug content. */
export const SUBSCREEN_BODY =
  'overflow-y-auto p-3 space-y-3 max-md:flex-1 pb-3';

export type ComposerChromeSize = 'default' | 'wide' | 'fit';

interface ComposerChromeProps {
  children: ReactNode;
  size?: ComposerChromeSize;
  'data-testid'?: string;
  'data-create-mode'?: string;
}

export default function ComposerChrome({
  children,
  size = 'default',
  'data-testid': testId,
  'data-create-mode': createMode,
}: ComposerChromeProps) {
  const cardClass =
    size === 'wide'
      ? COMPOSER_CARD_WIDE
      : size === 'fit'
        ? COMPOSER_CARD_FIT
        : COMPOSER_CARD_DEFAULT;

  return (
    <div
      className="relative h-dvh w-full bg-transparent pt-safe pb-safe flex max-md:flex-col md:items-center md:justify-center overflow-hidden md:px-4 md:py-4"
      data-testid={testId}
      data-create-mode={createMode}
      data-chrome-size={size}
    >
      <div className={cardClass}>{children}</div>
    </div>
  );
}
