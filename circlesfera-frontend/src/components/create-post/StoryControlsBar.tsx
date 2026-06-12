import { motion } from 'framer-motion';
import { Music as MusicIcon, Star } from 'lucide-react';
import type { Audio as AudioTrack } from '../../types';

interface StoryControlsBarProps {
  setShowMusicPicker: (val: boolean) => void;
  selectedAudio: AudioTrack | null;
  isCloseFriendsOnly: boolean;
  setIsCloseFriendsOnly: (val: boolean) => void;
}

export default function StoryControlsBar({
  setShowMusicPicker,
  selectedAudio,
  isCloseFriendsOnly,
  setIsCloseFriendsOnly,
}: StoryControlsBarProps) {
  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: 'auto', opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="overflow-hidden shrink-0 z-20"
    >
      <div className="flex items-center justify-center gap-3 py-2.5 bg-black/20 backdrop-blur-md border-b border-white/4">
        <button
          type="button"
          onClick={() => setShowMusicPicker(true)}
          className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold transition-all ${
            selectedAudio
              ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/20'
              : 'bg-white/6 text-white/70 hover:bg-white/10'
          }`}
        >
          <MusicIcon size={12} className={selectedAudio ? 'fill-white' : ''} />
          {selectedAudio ? selectedAudio.title : 'Add Music'}
        </button>
        <button
          type="button"
          onClick={() => setIsCloseFriendsOnly(!isCloseFriendsOnly)}
          className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold transition-all ${
            isCloseFriendsOnly
              ? 'bg-green-500 text-white shadow-lg shadow-green-500/20'
              : 'bg-white/6 text-white/70 hover:bg-white/10'
          }`}
        >
          <Star size={12} className={isCloseFriendsOnly ? 'fill-white' : ''} />
          {isCloseFriendsOnly ? 'Close Friends' : 'Your Story'}
        </button>
      </div>
    </motion.div>
  );
}
