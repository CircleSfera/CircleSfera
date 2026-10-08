import { motion } from 'framer-motion';
import { PHOTO_FILTERS } from '../photoEditor.constants';
import type { PhotoEditorState } from '../usePhotoEditor';

export default function PhotoFiltersPanel({
  editor,
}: {
  editor: PhotoEditorState;
}) {
  const { selectedFilter, setSelectedFilter, thumbnailUrl } = editor;

  return (
    <motion.div
      key="filters"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.12 }}
      className="flex overflow-x-auto items-start gap-3 px-4 scroll-px-4 no-scrollbar snap-x touch-pan-x"
    >
      {PHOTO_FILTERS.map((filter) => (
        <button
          type="button"
          key={filter.name}
          onClick={() => setSelectedFilter(filter)}
          className="flex flex-col items-center gap-1 shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-white/25 rounded-lg snap-start"
        >
          <div
            className={`w-14 h-14 rounded-md overflow-hidden border-2 transition-colors ${
              selectedFilter.name === filter.name
                ? 'border-brand-primary'
                : 'border-white/10'
            }`}
          >
            <img
              src={thumbnailUrl || undefined}
              alt=""
              className={`w-full h-full object-cover ${filter.class}`}
            />
          </div>
          <span
            className={`text-xs font-medium leading-none ${
              selectedFilter.name === filter.name
                ? 'text-white'
                : 'text-white/40'
            }`}
          >
            {filter.name}
          </span>
        </button>
      ))}
    </motion.div>
  );
}
