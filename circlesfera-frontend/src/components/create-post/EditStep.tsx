import { AnimatePresence, motion } from 'framer-motion';
import { Clock, Film, Image, Pencil, Plus, Trash2 } from 'lucide-react';
import type { MutableRefObject } from 'react';
import { useEffect, useRef, useState } from 'react';
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
    accent: 'text-brand-primary',
    ratioW: 4,
    ratioH: 5,
    badge: '4:5',
  },
  STORY: {
    icon: Clock,
    label: 'Story',
    accent: 'text-brand-accent',
    ratioW: 9,
    ratioH: 16,
    badge: '9:16',
  },
  FRAME: {
    icon: Film,
    label: 'Frame',
    accent: 'text-brand-blue',
    ratioW: 9,
    ratioH: 16,
    badge: '9:16',
  },
} as const;

/** Largest box of ratioW:ratioH that fits inside availW×availH. */
export function fitAspectBox(
  availW: number,
  availH: number,
  ratioW: number,
  ratioH: number,
): { width: number; height: number } {
  if (availW <= 0 || availH <= 0) {
    return { width: 0, height: 0 };
  }
  const target = ratioW / ratioH;
  let width = availW;
  let height = width / target;
  if (height > availH) {
    height = availH;
    width = height * target;
  }
  return {
    width: Math.floor(width),
    height: Math.floor(height),
  };
}

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
  const hostRef = useRef<HTMLDivElement>(null);
  const [frameSize, setFrameSize] = useState({ width: 0, height: 0 });

  const { ratioW, ratioH } = config;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const measure = () => {
      const { clientWidth, clientHeight } = host;
      setFrameSize(fitAspectBox(clientWidth, clientHeight, ratioW, ratioH));
    };

    measure();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }
    const ro = new ResizeObserver(measure);
    ro.observe(host);
    return () => ro.disconnect();
  }, [ratioW, ratioH]);

  return (
    <div className="flex-1 bg-surface-base flex flex-col h-full w-full overflow-hidden min-h-0">
      <div
        ref={hostRef}
        className="flex-1 relative bg-surface-base flex items-center justify-center overflow-hidden min-h-0 w-full"
      >
        <div
          data-testid="edit-preview-frame"
          data-aspect={`${ratioW}:${ratioH}`}
          className="relative overflow-hidden bg-black shrink-0 rounded-xl md:rounded-2xl border border-white/6"
          style={{
            width: frameSize.width || undefined,
            height: frameSize.height || undefined,
            aspectRatio:
              frameSize.width === 0 ? `${ratioW} / ${ratioH}` : undefined,
            maxWidth: '100%',
            maxHeight: '100%',
          }}
        >
          <Carousel
            media={mediaFiles.map((m) => ({
              id: m.url,
              url: m.url,
              type: m.type,
              filter: m.filter,
            }))}
            aspectRatio="none"
            objectFit="cover"
            className="absolute inset-0 h-full! w-full!"
          />

          <button
            type="button"
            className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 px-4 h-11
                       bg-black/60 border border-white/15 rounded-full
                       text-white shadow-lg active:scale-95 transition-transform
                       outline-none focus-visible:ring-2 focus-visible:ring-white/30"
            onClick={() => setCurrentEditIndex(0)}
            aria-label={t('createPost.edit.edit_media')}
          >
            <Pencil size={16} strokeWidth={2} />
            <span className="text-sm font-bold">
              {t('createPost.edit.edit_media')}
            </span>
          </button>

          <div className="absolute top-3 left-3 px-2.5 py-1 rounded-lg bg-black/50 border border-white/10 text-xs font-bold text-white/60 uppercase tracking-wider pointer-events-none">
            {config.badge}
          </div>

          {mediaFiles.length > 1 && (
            <div className="absolute top-3 right-3 px-2.5 py-1 rounded-lg bg-black/50 border border-white/10 text-xs font-bold text-white/60 pointer-events-none">
              {t('createPost.edit.n_files', { count: mediaFiles.length })}
            </div>
          )}
        </div>
      </div>

      <div className="py-2 px-3 bg-surface-elevated border-t border-white/6 flex justify-center z-10 shrink-0">
        <div
          className="flex bg-white/3 rounded-xl p-0.5 border border-white/5"
          role="tablist"
          aria-label={t('createPost.upload.mode_switcher')}
        >
          {(['POST', 'STORY', 'FRAME'] as const).map((m) => {
            const cfg = MODE_CONFIG[m];
            const Icon = cfg.icon;
            const isActive = mode === m;
            return (
              <button
                type="button"
                role="tab"
                aria-selected={isActive}
                key={m}
                onClick={() => setMode(m)}
                className="relative min-h-11 px-3 rounded-lg flex items-center gap-1.5 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-white/20"
              >
                {isActive && (
                  <motion.div
                    layoutId="edit-mode-pill"
                    className="absolute inset-0 bg-white/7 border border-white/8 rounded-lg"
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  />
                )}
                <Icon
                  size={13}
                  className={`relative z-10 ${isActive ? cfg.accent : 'text-white/20'}`}
                  strokeWidth={2}
                />
                <span
                  className={`relative z-10 text-xs font-bold tracking-wide ${
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

      <div
        ref={thumbnailContainerRef}
        className="h-22 bg-surface-elevated border-t border-white/4 flex items-center px-3 gap-2.5 overflow-x-auto no-scrollbar shrink-0"
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
                className="relative shrink-0"
              >
                <button
                  type="button"
                  className="w-15 h-15 rounded-xl overflow-hidden border border-white/10 hover:border-white/25 transition-all cursor-pointer appearance-none bg-transparent p-0 outline-none focus-visible:ring-2 focus-visible:ring-white/30"
                  onClick={() => setCurrentEditIndex(idx)}
                  aria-label={t('createPost.edit.edit_media')}
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
                </button>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemoveFile(idx);
                  }}
                  className="absolute -top-1.5 -right-1.5 w-7 h-7 min-w-7 min-h-7 bg-brand-secondary/90 rounded-full
                             flex items-center justify-center text-white
                             hover:bg-brand-secondary active:scale-95 z-10
                             shadow-md border border-white/20
                             outline-none focus-visible:ring-2 focus-visible:ring-white/40"
                  aria-label={t('createPost.edit.remove_media')}
                >
                  <Trash2 size={12} strokeWidth={2.5} />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="w-11 h-11 min-w-11 min-h-11 rounded-xl border-2 border-dashed border-white/8
                     flex items-center justify-center text-white/30 hover:text-white/50
                     hover:border-white/15 hover:bg-white/2 transition-all shrink-0
                     outline-none focus-visible:ring-2 focus-visible:ring-white/20"
          aria-label={t('createPost.edit.add_more')}
        >
          <Plus size={20} strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}
