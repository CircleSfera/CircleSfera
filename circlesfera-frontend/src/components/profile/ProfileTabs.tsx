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

export default function ProfileTabs({
  activeTab,
  setActiveTab,
  isMe,
  canView,
}: ProfileTabsProps) {
  const { t } = useTranslation();

  if (!canView) return null;

  return (
    <div className="flex justify-center gap-2 md:gap-4 mb-6 p-1 bg-black/40 backdrop-blur-xl rounded-lg border border-white/5 w-fit mx-auto">
      <button
        type="button"
        onClick={() => setActiveTab('posts')}
        className={`flex items-center gap-2.5 px-5 py-2 rounded-xl text-xs font-black tracking-wide transition-all relative z-10 ${
          activeTab === 'posts'
            ? 'text-white'
            : 'text-zinc-500 hover:text-zinc-300'
        }`}
      >
        {activeTab === 'posts' && (
          <motion.div
            layoutId="activeTabProfileGlass"
            className="absolute inset-0 bg-white/10 backdrop-blur-md rounded-xl -z-10 border border-white/10 shadow-[0_0_20px_rgba(255,255,255,0.05)]"
            transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
          />
        )}
        <Grid size={14} />
        <span className="hidden sm:inline">{t('profile.tabs.posts')}</span>
      </button>

      <button
        type="button"
        onClick={() => setActiveTab('frames')}
        className={`flex items-center gap-2.5 px-5 py-2 rounded-xl text-xs font-black tracking-wide transition-all relative z-10 ${
          activeTab === 'frames'
            ? 'text-white'
            : 'text-zinc-500 hover:text-zinc-300'
        }`}
      >
        {activeTab === 'frames' && (
          <motion.div
            layoutId="activeTabProfileGlass"
            className="absolute inset-0 bg-white/10 backdrop-blur-md rounded-xl -z-10 border border-white/10 shadow-[0_0_20px_rgba(255,255,255,0.05)]"
            transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
          />
        )}
        <Clapperboard size={14} />
        <span className="hidden sm:inline">{t('profile.tabs.frames')}</span>
      </button>

      {isMe && (
        <button
          type="button"
          onClick={() => setActiveTab('saved')}
          className={`flex items-center gap-2.5 px-5 py-2 rounded-xl text-xs font-black tracking-wide transition-all relative z-10 ${
            activeTab === 'saved'
              ? 'text-white'
              : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          {activeTab === 'saved' && (
            <motion.div
              layoutId="activeTabProfileGlass"
              className="absolute inset-0 bg-white/10 backdrop-blur-md rounded-xl -z-10 border border-white/10 shadow-[0_0_20px_rgba(255,255,255,0.05)]"
              transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
            />
          )}
          <Bookmark size={14} />
          <span className="hidden sm:inline">{t('profile.tabs.saved')}</span>
        </button>
      )}

      <button
        type="button"
        onClick={() => setActiveTab('tagged')}
        className={`flex items-center gap-2.5 px-5 py-2 rounded-xl text-xs font-black tracking-wide transition-all relative z-10 ${
          activeTab === 'tagged'
            ? 'text-white'
            : 'text-zinc-500 hover:text-zinc-300'
        }`}
      >
        {activeTab === 'tagged' && (
          <motion.div
            layoutId="activeTabProfileGlass"
            className="absolute inset-0 bg-white/10 backdrop-blur-md rounded-xl -z-10 border border-white/10 shadow-[0_0_20px_rgba(255,255,255,0.05)]"
            transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
          />
        )}
        <UserSquare2 size={14} />
        <span className="hidden sm:inline">{t('profile.tabs.tagged')}</span>
      </button>
    </div>
  );
}
