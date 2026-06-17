import { AnimatePresence, motion } from 'framer-motion';
import { Clock, Film, Image, Pencil, Plus, Trash2 } from 'lucide-react';
import type { MutableRefObject } from 'react';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { CreateMode, MediaFile } from '../../hooks/useCreatePost';
import { parseFilter } from '../../utils/styleUtils';
import Carousel from '../Carousel';

interface EditStepProps {
  mediaFiles: MediaFile[];
  mode: CreateMode;
  setMode: (mode: CreateMode) => void;
  setCurrentEditIndex: (index: number | null) => void;
  handleRemoveFile: (index: number) => void;
  fileInputRef: MutableRefObject<HTMLInputElement | null>;
}

const MODE_CONFIG = {
  POST: {
    icon: Image,
    label: 'Post',
    accent: 'text-violet-400',
    ratio: 'aspect-square',
  },
  STORY: {
    icon: Clock,
    label: 'Story',
    accent: 'text-amber-400',
    ratio: 'aspect-9/16',
  },
  FRAME: {
    icon: Film,
    label: 'Frame',
    accent: 'text-cyan-400',
    ratio: 'aspect-9/16',
  },
} as const;

export default function EditStep({
  mediaFiles,
  mode,
  setMode,
  setCurrentEditIndex,
  handleRemoveFile,
  fileInputRef,
}: EditStepProps) {
  const { t } = useTranslation();
  const config = MODE_CONFIG[mode];
  const thumbnailContainerRef = useRef<HTMLDivElement>(null);

  return (
    <div className="flex-1 bg-black flex flex-col h-full w-full overflow-hidden">
      {/* Main Preview */}
      <div className="flex-1 relative bg-zinc-950 flex items-center justify-center overflow-hidden min-h-0 p-4 md:p-8">
        {/* Ambient glow behind preview */}
        <div className="absolute inset-0 bg-radial-[at_50%_50%] from-white/2 via-transparent to-transparent pointer-events-none" />

        <motion.div
          layout
          className={`relative w-auto h-full max-h-full max-w-full flex items-center justify-center overflow-hidden rounded-2xl shadow-2xl shadow-black/50 border border-white/6 ${config.ratio}`}
          transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
        >
          <Carousel
            media={mediaFiles.map((m) => ({
              id: m.url,
              url: m.url,
              type: m.type,
              filter: m.filter,
            }))}
            aspectRatio={config.ratio}
            objectFit="cover"
            className="w-full h-full"
          />

          {/* Edit Overlay */}
          <button
            type="button"
            className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-all duration-300 cursor-pointer group z-10 appearance-none bg-transparent border-none w-full h-full"
            onClick={() => setCurrentEditIndex(0)}
          >
            {/* Scrim */}
            <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] transition-all" />

            {/* Edit Button */}
            <motion.div
              className="relative z-10 flex items-center gap-3 bg-white/10 backdrop-blur-xl border border-white/15 px-5 py-3 rounded-2xl
                         shadow-xl shadow-black/30 group-hover:bg-white/15 transition-all duration-300"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center">
                <Pencil size={16} className="text-white" strokeWidth={2} />
              </div>
              <div className="text-left">
                <p className="text-sm font-bold text-white">
                  {t('createPost.edit.edit_media')}
                </p>
                <p className="text-[10px] text-white/50 font-medium">
                  {t('createPost.edit.filters_adjustments')}
                </p>
              </div>
            </motion.div>
          </button>

          {/* Aspect Ratio Badge */}
          <div className="absolute top-3 left-3 px-2.5 py-1 rounded-lg bg-black/50 backdrop-blur-md border border-white/10 text-[10px] font-bold text-white/60 uppercase tracking-wider pointer-events-none">
            {mode === 'POST' ? '1:1' : '9:16'}
          </div>

          {/* File count badge */}
          {mediaFiles.length > 1 && (
            <div className="absolute top-3 right-3 px-2.5 py-1 rounded-lg bg-black/50 backdrop-blur-md border border-white/10 text-[10px] font-bold text-white/60 pointer-events-none">
              {t('createPost.edit.n_files', { count: mediaFiles.length })}
            </div>
          )}
        </motion.div>
      </div>

      {/* Mode Switcher */}
      <div className="py-2.5 px-4 bg-black/80 backdrop-blur-md border-t border-white/4 flex justify-center z-10">
        <div className="flex bg-white/3 rounded-xl p-0.5 border border-white/5">
          {(['POST', 'STORY', 'FRAME'] as const).map((m) => {
            const cfg = MODE_CONFIG[m];
            const Icon = cfg.icon;
            const isActive = mode === m;
            return (
              <button
                type="button"
                key={m}
                onClick={() => setMode(m)}
                className="relative px-4 py-2 rounded-[10px] flex items-center gap-1.5 transition-all duration-200"
              >
                {isActive && (
                  <motion.div
                    layoutId="edit-mode-pill"
                    className="absolute inset-0 bg-white/7 border border-white/8 rounded-[10px]"
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  />
                )}
                <Icon
                  size={13}
                  className={`relative z-10 transition-colors ${isActive ? cfg.accent : 'text-white/20'}`}
                  strokeWidth={2}
                />
                <span
                  className={`relative z-10 text-[11px] font-bold tracking-wide transition-colors ${
                    isActive ? 'text-white' : 'text-white/25'
                  }`}
                >
                  {t(`createPost.edit.${cfg.label.toLowerCase()}`)}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Thumbnail Strip */}
      <div
        ref={thumbnailContainerRef}
        className="h-[88px] bg-black border-t border-white/4 flex items-center px-3 gap-2.5 overflow-x-auto no-scrollbar shrink-0"
      >
        <AnimatePresence>
          {mediaFiles.map((item, idx) => {
            const { className: filterClass, style: filterStyle } = parseFilter(
              item.filter,
            );
            return (
              <motion.div
                key={item.url}
                layout
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                className="relative group shrink-0"
              >
                <button
                  type="button"
                  className="w-[60px] h-[60px] rounded-xl overflow-hidden border border-white/10 hover:border-white/25 transition-all duration-200 cursor-pointer shadow-md shadow-black/30 appearance-none bg-transparent p-0"
                  onClick={() => setCurrentEditIndex(idx)}
                >
                  {item.type === 'video' ? (
                    <div className="relative w-full h-full">
                      <video
                        src={item.url}
                        className={`w-full h-full object-cover ${filterClass}`}
                        style={filterStyle}
                        muted
                        playsInline
                      />
                      <div className="absolute bottom-1 right-1">
                        <Film size={10} className="text-white/60" />
                      </div>
                    </div>
                  ) : (
                    <img
                      src={item.url}
                      className={`w-full h-full object-cover ${filterClass}`}
                      style={filterStyle}
                      alt=""
                    />
                  )}

                  {/* Hover edit indicator */}
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-xl">
                    <Pencil size={14} className="text-white/80" />
                  </div>
                </button>

                {/* Remove Button */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemoveFile(idx);
                  }}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500/90 backdrop-blur-sm rounded-full
                             flex items-center justify-center text-white
                             opacity-0 group-hover:opacity-100 transition-all duration-200
                             hover:bg-red-500 hover:scale-110 active:scale-95 z-10
                             shadow-md shadow-red-500/20 border border-red-400/30"
                >
                  <Trash2 size={10} strokeWidth={2.5} />
                </button>

                {/* Position indicator */}
                <div className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 text-[8px] font-bold text-white/20">
                  {idx + 1}
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>

        {/* Add More Button */}
        <motion.button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="w-[60px] h-[60px] rounded-xl border-2 border-dashed border-white/8
                     flex items-center justify-center text-white/20 hover:text-white/40
                     hover:border-white/15 hover:bg-white/2 transition-all duration-200 shrink-0"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          <Plus size={20} strokeWidth={2} />
        </motion.button>
      </div>
    </div>
  );
}
