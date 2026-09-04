import { motion } from 'framer-motion';
import { Music as MusicIcon, Star, UserPlus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Audio as AudioTrack } from '../../types';

interface StoryControlsBarProps {
  setShowMusicPicker: (val: boolean) => void;
  selectedAudio: AudioTrack | null;
  isCloseFriendsOnly: boolean;
  setIsCloseFriendsOnly: (val: boolean) => void;
  closeFriendsCount: number;
  onManageCloseFriends: () => void;
}

export default function StoryControlsBar({
  setShowMusicPicker,
  selectedAudio,
  isCloseFriendsOnly,
  setIsCloseFriendsOnly,
  closeFriendsCount,
  onManageCloseFriends,
}: StoryControlsBarProps) {
  const { t } = useTranslation();

  const handleCloseFriendsToggle = () => {
    if (!isCloseFriendsOnly && closeFriendsCount === 0) {
      onManageCloseFriends();
      return;
    }
    setIsCloseFriendsOnly(!isCloseFriendsOnly);
  };

  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: 'auto', opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="overflow-hidden shrink-0 z-20"
    >
      <div className="flex items-center justify-center gap-2 py-2.5 bg-black/20 backdrop-blur-md border-b border-white/4 px-2">
        <button
          type="button"
          onClick={() => setShowMusicPicker(true)}
          className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold transition-all max-w-[45%] truncate ${
            selectedAudio
              ? 'bg-brand-primary text-white shadow-lg shadow-brand-primary/20'
              : 'bg-white/6 text-white/70 hover:bg-white/10'
          }`}
        >
          <MusicIcon
            size={12}
            className={selectedAudio ? 'fill-white shrink-0' : 'shrink-0'}
          />
          <span className="truncate">
            {selectedAudio
              ? selectedAudio.title
              : t('createPost.story.add_music')}
          </span>
        </button>

        <button
          type="button"
          onClick={handleCloseFriendsToggle}
          className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold transition-all ${
            isCloseFriendsOnly
              ? 'bg-green-500 text-white shadow-lg shadow-green-500/20'
              : 'bg-white/6 text-white/70 hover:bg-white/10'
          }`}
        >
          <Star size={12} className={isCloseFriendsOnly ? 'fill-white' : ''} />
          {isCloseFriendsOnly
            ? t('createPost.story.close_friends')
            : t('createPost.story.your_story')}
          {closeFriendsCount > 0 && (
            <span className="opacity-80">({closeFriendsCount})</span>
          )}
        </button>

        <button
          type="button"
          onClick={onManageCloseFriends}
          aria-label={t('createPost.story.manage_close_friends')}
          title={t('createPost.story.manage_close_friends')}
          className="flex items-center justify-center w-9 h-9 rounded-full bg-white/6 text-white/70 hover:bg-white/10 hover:text-white transition-all shrink-0"
        >
          <UserPlus size={14} />
        </button>
      </div>
    </motion.div>
  );
}
