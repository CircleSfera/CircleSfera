import { motion } from 'framer-motion';
import { STICKER_CATEGORIES } from '../storyComposer.constants';

export interface StoryStickersPanelProps {
  activeStickerCategory: number;
  onActiveStickerCategoryChange: (index: number) => void;
  onAddSticker: (sticker: string) => void;
}

export default function StoryStickersPanel({
  activeStickerCategory,
  onActiveStickerCategoryChange,
  onAddSticker,
}: StoryStickersPanelProps) {
  return (
    <motion.div
      key="stickers-tab"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 16 }}
      transition={{ duration: 0.25 }}
      className="px-3 space-y-3"
    >
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
        {STICKER_CATEGORIES.map((cat, idx) => (
          <button
            type="button"
            key={cat.label}
            onClick={() => onActiveStickerCategoryChange(idx)}
            className={`min-h-9 px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${
              activeStickerCategory === idx
                ? 'bg-white text-black'
                : 'text-white/45 hover:text-white/75 bg-white/5 border border-white/8'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-6 sm:grid-cols-8 gap-1.5 pb-0.5">
        {STICKER_CATEGORIES[activeStickerCategory].items.map((s) => (
          <motion.button
            type="button"
            key={s}
            onClick={() => onAddSticker(s)}
            className="text-2xl min-h-12 min-w-12 p-2 rounded-xl hover:bg-white/8 active:bg-white/12 transition-colors flex items-center justify-center outline-none focus-visible:ring-2 focus-visible:ring-white/25"
            whileHover={{ scale: 1.12 }}
            whileTap={{ scale: 0.9 }}
          >
            {s}
          </motion.button>
        ))}
      </div>
    </motion.div>
  );
}
