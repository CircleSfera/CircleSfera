import { motion } from 'framer-motion';
import { Bookmark, Clapperboard, Grid, UserSquare2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export type TabType = 'posts' | 'frames' | 'saved' | 'tagged';

interface ProfileTabsProps {
  activeTab: TabType;
  setActiveTab: (tab: TabType) => void;
  isMe: boolean;
  canView: boolean;
}

const TABS = [
  { id: 'posts', icon: Grid, onlyMine: false },
  { id: 'frames', icon: Clapperboard, onlyMine: false },
  { id: 'saved', icon: Bookmark, onlyMine: true },
  { id: 'tagged', icon: UserSquare2, onlyMine: false },
] as const;

export default function ProfileTabs({
  activeTab,
  setActiveTab,
  isMe,
  canView,
}: ProfileTabsProps) {
  const { t } = useTranslation();

  if (!canView) return null;

  return (
    <div className="flex justify-center gap-1 mb-3 md:mb-6 p-1 bg-black/40 backdrop-blur-xl rounded-full border border-white/8 w-fit max-w-full mx-auto">
      {TABS.filter((tab) => isMe || !tab.onlyMine).map(({ id, icon: Icon }) => {
        const isActive = activeTab === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => setActiveTab(id)}
            aria-label={t(`profile.tabs.${id}`)}
            aria-pressed={isActive}
            className={`relative z-10 min-h-11 min-w-14 px-4 md:px-5 flex items-center justify-center gap-2 rounded-full text-sm font-semibold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-white/30 ${
              isActive ? 'text-white' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            {isActive && (
              <motion.div
                layoutId="activeTabProfileGlass"
                className="absolute inset-0 bg-white/12 rounded-full -z-10 border border-white/12"
                transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
              />
            )}
            <Icon size={18} aria-hidden="true" />
            <span className="hidden sm:inline">{t(`profile.tabs.${id}`)}</span>
          </button>
        );
      })}
    </div>
  );
}
