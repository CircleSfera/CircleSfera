import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

interface StoryPanelSheetProps {
  children: ReactNode;
  open: boolean;
}

/**
 * Tool panel inside the bottom dock. No second “card” chrome — the dock owns
 * background/border; this is just the scroll region above the rail.
 */
export default function StoryPanelSheet({
  children,
  open,
}: StoryPanelSheetProps) {
  const { t } = useTranslation();

  if (!open) return null;

  return (
    <section
      onPointerDown={(e) => e.stopPropagation()}
      className="z-40 shrink-0 max-h-[min(34dvh,260px)] overflow-y-auto no-scrollbar border-b border-white/8"
      aria-label={t('createPost.storyComposer.edit_tools')}
    >
      <div className="sticky top-0 z-10 flex justify-center pt-2 pb-1 pointer-events-none">
        <div className="h-1 w-9 rounded-full bg-white/20" aria-hidden />
      </div>
      <div className="px-1 pb-2.5">{children}</div>
    </section>
  );
}
