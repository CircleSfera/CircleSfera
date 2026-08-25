import { Menu } from 'lucide-react';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CreatorMobileDrawer } from './CreatorMobileNav';
import CreatorSidebar from './CreatorSidebar';
import type { CreatorTab } from './creatorNav';
import { findCreatorNavItem } from './creatorNav';

interface CreatorShellProps {
  activeTab: CreatorTab;
  children: ReactNode;
}

export default function CreatorShell({
  activeTab,
  children,
}: CreatorShellProps) {
  const { t } = useTranslation();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const mainRef = useRef<HTMLElement>(null);
  const activeItem = findCreatorNavItem(activeTab);
  const title = activeItem
    ? t(activeItem.labelKey, activeItem.labelFallback)
    : t('creator.title', 'Creator Studio');

  // Focus main when switching studio tabs (a11y).
  // biome-ignore lint/correctness/useExhaustiveDependencies: activeTab is the intentional trigger
  useEffect(() => {
    mainRef.current?.focus({ preventScroll: true });
  }, [activeTab]);

  return (
    <div className="min-h-dvh pb-20 md:pb-12 pt-2 md:pt-6">
      <div data-testid="creator-column" className="px-4 md:px-6 max-w-5xl">
        <div className="mb-4 md:mb-6 flex items-center gap-3">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="md:hidden flex items-center justify-center w-11 h-11 rounded-xl bg-white/5 border border-white/10 text-white/70 hover:text-white shrink-0"
            aria-label={t('creator.open_nav', 'Open navigation')}
          >
            <Menu size={20} />
          </button>
          <div className="min-w-0">
            <h1 className="text-xl font-semibold text-white tracking-tight truncate">
              {title}
            </h1>
          </div>
        </div>

        <CreatorMobileDrawer
          isOpen={drawerOpen}
          onClose={() => setDrawerOpen(false)}
        />

        <div className="flex flex-col md:flex-row gap-6 md:gap-8">
          <CreatorSidebar />
          <main
            ref={mainRef}
            tabIndex={-1}
            id="creator-main"
            className="flex-1 min-w-0 outline-none"
          >
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
