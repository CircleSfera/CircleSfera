import type { ReactNode } from 'react';

// Shared stepped-path shell (ADR-0018). Mobile full-bleed; desktop narrow card.
export const COMPOSER_CARD_CLASS =
  'flex flex-col min-h-0 w-full bg-surface-elevated border-white/8 overflow-hidden max-md:h-full max-md:max-h-none max-md:rounded-none max-md:border-0 max-md:shadow-none md:max-w-sm md:w-full md:h-[min(90dvh,720px)] md:rounded-3xl md:border md:shadow-[0_8px_32px_rgba(0,0,0,0.4)]';

interface ComposerChromeProps {
  children: ReactNode;
  'data-testid'?: string;
  'data-create-mode'?: string;
}

export default function ComposerChrome({
  children,
  'data-testid': testId,
  'data-create-mode': createMode,
}: ComposerChromeProps) {
  return (
    <div
      className="relative h-dvh w-full bg-transparent pt-safe pb-safe flex max-md:flex-col md:items-center md:justify-center overflow-hidden md:px-4"
      data-testid={testId}
      data-create-mode={createMode}
    >
      <div className={COMPOSER_CARD_CLASS}>{children}</div>
    </div>
  );
}
