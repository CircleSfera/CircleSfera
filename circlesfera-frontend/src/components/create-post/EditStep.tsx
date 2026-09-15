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
  /** When set (composed story), pencil reopens StoryComposer instead of PhotoEditor. */
  onEditMedia?: () => void;
  handleRemoveFile: (index: number) => void;
  fileInputRef: MutableRefObject<HTMLInputElement | null>;
  allowModeSwitch?: boolean;
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

// Largest box of ratioW:ratioH that fits inside availW×availH.
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
  onEditMedia,
  handleRemoveFile,
  fileInputRef,
  allowModeSwitch = true,
}: EditStepProps) {
  const { t } = useTranslation();
  const config = MODE_CONFIG[mode];
  const thumbnailContainerRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const [frameSize, setFrameSize] = useState({ width: 0, height: 0 });
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Post shell is vertical 4:5 (ratioW:ratioH = 4:5 → taller than wide).
  const { ratioW, ratioH } = config;

  useEffect(() => {
    if (selectedIndex >= mediaFiles.length) {
      setSelectedIndex(Math.max(0, mediaFiles.length - 1));
    }
  }, [mediaFiles.length, selectedIndex]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const measure = () => {
      const { clientWidth, clientHeight } = host;
      const isMd =
        typeof window !== 'undefined' &&
        window.matchMedia('(min-width: 768px)').matches;
      let box = fitAspectBox(clientWidth, clientHeight, ratioW, ratioH);
      if (isMd) {
        const maxW = ratioW === 9 && ratioH === 16 ? 300 : 400;
        if (box.width > maxW) {
          box = {
            width: maxW,
            height: Math.floor((maxW * ratioH) / ratioW),
          };
        }
      }
      setFrameSize(box);
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

  const openEditor = (index: number) => {
    setSelectedIndex(index);
    if (onEditMedia) onEditMedia();
    else setCurrentEditIndex(index);
  };

  // Maintain rounded corners everywhere for consistency with composer
  const frameChrome =
    'rounded-[32px] border-0 shadow-none md:border md:border-white/10 md:shadow-[0_12px_48px_rgba(0,0,0,0.55)]';

  return (
    <div className="flex-1 bg-surface-elevated flex flex-col h-full w-full overflow-hidden min-h-0">
      <div className="flex-1 relative bg-zinc-950/40 flex items-center justify-center overflow-hidden min-h-0 w-full px-0 py-0 md:px-8 md:py-4">
        <div
          ref={hostRef}
          className="relative h-full w-full max-w-full flex items-center justify-center min-h-0"
        >
          <div
            data-testid="edit-preview-frame"
            data-aspect={`${ratioW}:${ratioH}`}
            className={`relative overflow-hidden bg-black shrink-0 ${frameChrome}`}
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
              activeIndex={selectedIndex}
              onActiveIndexChange={setSelectedIndex}
            />

            <button
              type="button"
              className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1.5 px-3.5 h-10 min-h-10
                       bg-black/60 border border-white/15 rounded-full
                       text-white shadow-lg active:scale-95 transition-transform
                       outline-none focus-visible:ring-2 focus-visible:ring-white/30"
              onClick={() => openEditor(selectedIndex)}
              aria-label={
                onEditMedia
                  ? t('createPost.edit.edit_story')
                  : t('createPost.edit.edit_media')
              }
            >
              <Pencil size={14} strokeWidth={2} />
              <span className="text-xs font-bold">
                {onEditMedia
                  ? t('createPost.edit.edit_story')
                  : t('createPost.edit.edit_media')}
              </span>
            </button>

            <div className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded-lg bg-black/50 border border-white/10 text-[10px] font-bold text-white/60 uppercase tracking-wider pointer-events-none">
              {config.badge}
            </div>

            {mediaFiles.length > 1 && (
              <div className="absolute top-2.5 right-2.5 px-2 py-0.5 rounded-lg bg-black/50 border border-white/10 text-[10px] font-bold text-white/60 pointer-events-none">
                {t('createPost.edit.n_files', { count: mediaFiles.length })}
              </div>
            )}
          </div>
        </div>
      </div>

      {allowModeSwitch ? (
        <div className="py-1.5 px-3 bg-surface-elevated border-t border-white/8 flex justify-center z-10 shrink-0">
          <div
            className="flex w-full max-w-sm bg-white/4 rounded-xl p-1 border border-white/8"
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
                  className="relative flex-1 min-h-10 px-2.5 rounded-lg flex items-center justify-center gap-1.5 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-white/20"
                >
                  {isActive && (
                    <motion.div
                      layoutId="edit-mode-pill"
                      className="absolute inset-0 bg-white/10 border border-white/12 rounded-lg"
                      transition={{
                        type: 'spring',
                        stiffness: 400,
                        damping: 30,
                      }}
                    />
                  )}
                  <Icon
                    size={14}
                    className={`relative z-10 ${isActive ? cfg.accent : 'text-white/30'}`}
                    strokeWidth={2}
                  />
                  <span
                    className={`relative z-10 text-xs font-bold tracking-wide ${
                      isActive ? 'text-white' : 'text-white/35'
                    }`}
                  >
                    {t(`createPost.edit.${cfg.label.toLowerCase()}`)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      <div
        ref={thumbnailContainerRef}
        className="min-h-16 bg-surface-elevated border-t border-white/8 flex items-center px-3 gap-2.5 overflow-x-auto no-scrollbar shrink-0 py-1.5 pb-2"
      >
        <AnimatePresence>
          {mediaFiles.map((item, idx) => {
            const { className: filterClass, style: filterStyle } = parseFilter(
              item.filter,
            );
            const isSelected = idx === selectedIndex;
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
                  className={`h-12 w-auto rounded overflow-hidden border-2 transition-all cursor-pointer appearance-none bg-transparent p-0 outline-none focus-visible:ring-2 focus-visible:ring-white/30 ${
                    isSelected
                      ? 'border-brand-primary shadow-[0_0_0_1px_rgba(140,82,255,0.35)]'
                      : 'border-white/10 hover:border-white/25'
                  }`}
                  style={{ aspectRatio: `${ratioW} / ${ratioH}` }}
                  onClick={() => {
                    if (isSelected) openEditor(idx);
                    else setSelectedIndex(idx);
                  }}
                  onDoubleClick={() => openEditor(idx)}
                  aria-label={
                    isSelected
                      ? onEditMedia
                        ? t('createPost.edit.edit_story')
                        : t('createPost.edit.edit_media')
                      : t('createPost.edit.select_media')
                  }
                  aria-current={isSelected ? 'true' : undefined}
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
                      <div className="absolute bottom-0.5 right-0.5">
                        <Film size={9} className="text-white/60" />
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
                  className="absolute -top-1 -right-1 w-7 h-7 min-w-7 min-h-7 bg-brand-secondary/90 rounded-full
                             flex items-center justify-center text-white
                             hover:bg-brand-secondary active:scale-95 z-10
                             shadow-md border border-white/20
                             outline-none focus-visible:ring-2 focus-visible:ring-white/40"
                  aria-label={t('createPost.edit.remove_media')}
                >
                  <Trash2 size={11} strokeWidth={2.5} />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>

        {mode !== 'FRAME' ? (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="h-12 w-auto rounded border-2 border-dashed border-white/10
                     flex items-center justify-center text-white/35 hover:text-white/55
                     hover:border-white/20 hover:bg-white/4 transition-all shrink-0
                     outline-none focus-visible:ring-2 focus-visible:ring-white/20"
            style={{ aspectRatio: `${ratioW} / ${ratioH}` }}
            aria-label={t('createPost.edit.add_more')}
          >
            <Plus size={18} strokeWidth={2} />
          </button>
        ) : null}
      </div>
    </div>
  );
}
