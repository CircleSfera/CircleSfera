import { AnimatePresence, motion } from 'framer-motion';
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  Crop,
  Film,
  Image,
  Layers,
  Pencil,
  Plus,
  Scissors,
  SlidersHorizontal,
  Sparkles,
  Trash2,
} from 'lucide-react';
import type { MutableRefObject } from 'react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { CreateMode, MediaFile } from '../../hooks/useCreatePost';
import { parseFilter } from '../../utils/styleUtils';
import Carousel from '../Carousel';
import type { PhotoEditorTab } from '../photo-editor/photoEditor.types';
import {
  CREATE_GLASS_CHIP,
  CREATE_GLASS_ICON,
  CREATE_PANEL,
  CREATE_THUMB,
  CREATE_TOOL,
} from './createStyles';

interface EditStepProps {
  mediaFiles: MediaFile[];
  mode: CreateMode;
  setMode: (mode: CreateMode) => void;
  setCurrentEditIndex: (index: number | null) => void;
  /** Says which tab the photo editor opens on. */
  onChooseEditorTab?: (tab: PhotoEditorTab | undefined) => void;
  /** When set (composed story), pencil reopens StoryComposer instead of PhotoEditor. */
  onEditMedia?: () => void;
  handleRemoveFile: (index: number) => void;
  /** Moves a file to another place in the carousel. */
  onMoveFile?: (from: number, to: number) => void;
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
  onChooseEditorTab,
  onEditMedia,
  handleRemoveFile,
  onMoveFile,
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

  const openEditor = (index: number, tab?: PhotoEditorTab) => {
    setSelectedIndex(index);
    if (onEditMedia) {
      onEditMedia();
      return;
    }
    onChooseEditorTab?.(tab);
    setCurrentEditIndex(index);
  };

  // The item on show keeps being the one on show after it moves.
  const moveSelected = (by: -1 | 1) => {
    const to = selectedIndex + by;
    if (!onMoveFile || to < 0 || to >= mediaFiles.length) return;
    onMoveFile(selectedIndex, to);
    setSelectedIndex(to);
  };

  // The tools of the item on show. Each opens the editor on its own tab, so
  // a filter is one tap away instead of two.
  const selectedType = mediaFiles[selectedIndex]?.type ?? 'image';
  const tools: { tab: PhotoEditorTab; icon: typeof Sparkles; label: string }[] =
    selectedType === 'video'
      ? [
          {
            tab: 'FILTERS',
            icon: Sparkles,
            label: t('createPost.edit.tab_filters'),
          },
          {
            tab: 'ADJUST',
            icon: SlidersHorizontal,
            label: t('createPost.edit.tab_adjust'),
          },
          { tab: 'TRIM', icon: Scissors, label: t('createPost.edit.tab_trim') },
        ]
      : [
          {
            tab: 'FILTERS',
            icon: Sparkles,
            label: t('createPost.edit.tab_filters'),
          },
          {
            tab: 'ADJUST',
            icon: SlidersHorizontal,
            label: t('createPost.edit.tab_adjust'),
          },
          { tab: 'CROP', icon: Crop, label: t('createPost.edit.tab_crop') },
          {
            tab: 'OVERLAY',
            icon: Layers,
            label: t('createPost.edit.tab_overlay'),
          },
        ];

  // On phones the preview is a card with a side gutter, like the Frames
  // card; the larger radius is kept from md up.
  const frameChrome =
    'rounded-3xl border border-white/10 shadow-[0_12px_48px_rgba(0,0,0,0.55)]';

  return (
    <div className="flex-1 bg-surface-elevated flex flex-col h-full w-full overflow-hidden min-h-0">
      <div className="flex-1 relative flex items-center justify-center overflow-hidden min-h-0 w-full px-4 pt-3 pb-2 md:px-8 md:py-4">
        {/* A soft glow of the brand behind the content. */}
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_45%_at_50%_45%,rgba(var(--brand-primary-rgb),0.24),transparent_72%)]"
          aria-hidden
        />
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
              hideCounter
            />

            {onEditMedia ? (
              <button
                type="button"
                className={`absolute bottom-3 left-1/2 -translate-x-1/2 z-10 px-4 gap-1.5 w-auto! ${CREATE_GLASS_ICON}`}
                onClick={() => openEditor(selectedIndex)}
              >
                <Pencil size={16} strokeWidth={2} aria-hidden />
                <span className="text-sm font-semibold">
                  {t('createPost.edit.edit_story')}
                </span>
              </button>
            ) : null}

            {/* Removes the item on show. One button of the common size, instead
                of a small badge on each thumbnail. Top right: a video keeps
                its sound button at the bottom right. */}
            <button
              type="button"
              className={`absolute top-3 right-3 z-10 ${CREATE_GLASS_ICON}`}
              onClick={() => handleRemoveFile(selectedIndex)}
              aria-label={t('createPost.edit.remove_media')}
            >
              <Trash2 size={18} strokeWidth={2} aria-hidden />
            </button>

            <div className="absolute top-3 left-3 flex items-center gap-1.5 pointer-events-none">
              <span className={CREATE_GLASS_CHIP}>{config.badge}</span>
              {mediaFiles.length > 1 && (
                <span className={CREATE_GLASS_CHIP}>
                  {selectedIndex + 1} / {mediaFiles.length}
                </span>
              )}
            </div>
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
                  className="relative flex-1 min-h-11 px-2.5 rounded-lg flex items-center justify-center gap-1.5 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-white/20"
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

      {!onEditMedia ? (
        <div className="px-4 pb-1 shrink-0">
          <div
            role="toolbar"
            aria-label={t('createPost.edit.edit_media')}
            className={`flex items-stretch gap-1 p-1 md:max-w-sm md:mx-auto ${CREATE_PANEL}`}
          >
            {tools.map(({ tab, icon: Icon, label }) => (
              <button
                type="button"
                key={tab}
                onClick={() => openEditor(selectedIndex, tab)}
                className={CREATE_TOOL}
              >
                <Icon size={20} strokeWidth={1.75} aria-hidden />
                {label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div
        ref={thumbnailContainerRef}
        className="min-h-18 flex items-center px-4 gap-2.5 overflow-x-auto no-scrollbar shrink-0 py-2"
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
                  className={`${CREATE_THUMB} transition-all cursor-pointer appearance-none bg-transparent p-0 outline-none focus-visible:ring-2 focus-visible:ring-white/30 ${
                    isSelected
                      ? 'border-brand-primary shadow-[0_0_0_1px_rgba(136,76,255,0.35)]'
                      : 'border-white/10 hover:border-white/25'
                  }`}
                  style={{ aspectRatio: `${ratioW} / ${ratioH}` }}
                  onClick={() => {
                    if (isSelected) openEditor(idx);
                    else setSelectedIndex(idx);
                  }}
                  onDoubleClick={() => openEditor(idx)}
                  aria-label={t('createPost.edit.media_item', {
                    index: idx + 1,
                    total: mediaFiles.length,
                  })}
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
              </motion.div>
            );
          })}
        </AnimatePresence>

        {mode !== 'FRAME' ? (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="h-14 w-auto min-w-11 rounded-md border-2 border-dashed border-white/10
                     flex items-center justify-center text-white/35 hover:text-white/55
                     hover:border-white/20 hover:bg-white/4 transition-all shrink-0
                     outline-none focus-visible:ring-2 focus-visible:ring-white/20"
            style={{ aspectRatio: `${ratioW} / ${ratioH}` }}
            aria-label={t('createPost.edit.add_more')}
          >
            <Plus size={18} strokeWidth={2} />
          </button>
        ) : null}

        {/* The order of a carousel: the item on show moves one place. */}
        {onMoveFile && mediaFiles.length > 1 ? (
          <div className="ml-auto flex items-center gap-1 shrink-0 sticky right-0 pl-2">
            <button
              type="button"
              disabled={selectedIndex === 0}
              onClick={() => moveSelected(-1)}
              className={`${CREATE_GLASS_ICON} disabled:opacity-30`}
              aria-label={t('createPost.edit.move_earlier')}
            >
              <ChevronLeft size={18} aria-hidden />
            </button>
            <button
              type="button"
              disabled={selectedIndex === mediaFiles.length - 1}
              onClick={() => moveSelected(1)}
              className={`${CREATE_GLASS_ICON} disabled:opacity-30`}
              aria-label={t('createPost.edit.move_later')}
            >
              <ChevronRight size={18} aria-hidden />
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
