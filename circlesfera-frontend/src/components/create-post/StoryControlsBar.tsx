import { motion } from 'framer-motion';
import { MapPin, Music as MusicIcon, Star, UserPlus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Audio as AudioTrack } from '../../types';

interface StoryControlsBarProps {
  onOpenMusic: () => void;
  selectedAudio: AudioTrack | null;
  location?: string;
  onOpenLocation?: () => void;
  isCloseFriendsOnly: boolean;
  setIsCloseFriendsOnly: (val: boolean) => void;
  closeFriendsCount: number;
  onManageCloseFriends: () => void;
}

const pill =
  'flex items-center gap-1.5 h-9 px-3.5 rounded-full text-[13px] font-semibold transition-all outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/50';

export default function StoryControlsBar({
  onOpenMusic,
  selectedAudio,
  location,
  onOpenLocation,
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
      className="overflow-hidden shrink-0 z-20 w-full"
    >
      <div className="flex items-center justify-start md:justify-center gap-2 py-3 px-4 overflow-x-auto no-scrollbar w-full">
        <button
          type="button"
          onClick={onOpenMusic}
          className={`${pill} shrink-0 ${
            selectedAudio
              ? 'bg-brand-primary text-white shadow-md shadow-brand-primary/20'
              : 'bg-white/10 text-white hover:bg-white/20 border border-white/10'
          }`}
        >
          <MusicIcon
            size={14}
            className={
              selectedAudio
                ? 'text-white shrink-0'
                : 'text-brand-primary shrink-0'
            }
          />
          <span className="truncate max-w-30">
            {selectedAudio
              ? selectedAudio.title
              : t('createPost.story.add_music')}
          </span>
        </button>

        {onOpenLocation && (
          <button
            type="button"
            onClick={onOpenLocation}
            className={`${pill} shrink-0 ${
              location
                ? 'bg-brand-primary text-white shadow-md shadow-brand-primary/20'
                : 'bg-white/10 text-white hover:bg-white/20 border border-white/10'
            }`}
          >
            <MapPin
              size={14}
              className={
                location ? 'text-white shrink-0' : 'text-brand-blue shrink-0'
              }
            />
            <span className="truncate max-w-35">
              {location || t('createPost.story.add_location')}
            </span>
          </button>
        )}

        <button
          type="button"
          onClick={handleCloseFriendsToggle}
          className={`${pill} shrink-0 ${
            isCloseFriendsOnly
              ? 'bg-green-500 text-white shadow-md shadow-green-500/20'
              : 'bg-white/10 text-white hover:bg-white/20 border border-white/10'
          }`}
        >
          <Star
            size={14}
            className={
              isCloseFriendsOnly
                ? 'fill-white text-white shrink-0'
                : 'text-green-500 shrink-0'
            }
          />
          <span className="truncate max-w-35">
            {isCloseFriendsOnly
              ? t('createPost.story.close_friends')
              : t('createPost.story.your_story')}
            {closeFriendsCount > 0 && (
              <span className="opacity-80 ml-1">({closeFriendsCount})</span>
            )}
          </span>
        </button>

        <button
          type="button"
          onClick={onManageCloseFriends}
          aria-label={t('createPost.story.manage_close_friends')}
          title={t('createPost.story.manage_close_friends')}
          className="flex items-center justify-center min-w-9 w-9 h-9 rounded-full bg-white/10 text-white hover:bg-white/20 border border-white/10 transition-all shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/50"
        >
          <UserPlus size={15} />
        </button>
      </div>
    </motion.div>
  );
}
