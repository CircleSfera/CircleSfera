import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowUpFromLine,
  Camera,
  Clock,
  Film,
  Image,
  Sparkles,
} from 'lucide-react';
import type { ChangeEvent, MutableRefObject } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { CreateMode } from '../../hooks/useCreatePost';

interface UploadStepProps {
  fileInputRef: MutableRefObject<HTMLInputElement | null>;
  handleFileSelect: (e: ChangeEvent<HTMLInputElement>) => void;
  mode: CreateMode;
  setMode: (mode: CreateMode) => void;
  onTextStory?: () => void;
}

const MODE_CONFIG = {
  POST: {
    icon: Image,
    label: 'Post',
    description: 'Share photos & carousels',
    gradient: 'from-violet-500/20 via-purple-500/10 to-fuchsia-500/20',
    accent: 'text-violet-400',
    borderAccent: 'border-violet-500/30',
    glowColor: 'shadow-violet-500/10',
    accept: 'image/*,video/*',
    hint: 'JPG, PNG, MP4 · Max 100MB',
  },
  STORY: {
    icon: Clock,
    label: 'Story',
    description: 'Disappears in 24h',
    gradient: 'from-amber-500/20 via-orange-500/10 to-rose-500/20',
    accent: 'text-amber-400',
    borderAccent: 'border-amber-500/30',
    glowColor: 'shadow-amber-500/10',
    accept: 'image/*,video/*',
    hint: 'Photo or video · Up to 60s',
  },
  FRAME: {
    icon: Film,
    label: 'Frame',
    description: 'Short-form video',
    gradient: 'from-cyan-500/20 via-blue-500/10 to-indigo-500/20',
    accent: 'text-cyan-400',
    borderAccent: 'border-cyan-500/30',
    glowColor: 'shadow-cyan-500/10',
    accept: 'video/*',
    hint: 'MP4, MOV · 15-90 seconds',
  },
} as const;

export default function UploadStep({
  fileInputRef,
  handleFileSelect,
  mode,
  setMode,
  onTextStory,
}: UploadStepProps) {
  const { t } = useTranslation();
  const [isDragging, setIsDragging] = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);
  const dragCounter = useRef(0);

  const config = MODE_CONFIG[mode];
  const translatedConfig = {
    ...config,
    label: t(`createPost.upload.${mode.toLowerCase()}`),
    description: t(`createPost.upload.${mode.toLowerCase()}_desc`),
    hint: t(`createPost.upload.${mode.toLowerCase()}_hint`),
  };

  // Update accepted file types on native input based on mode
  useEffect(() => {
    if (fileInputRef.current) {
      fileInputRef.current.accept = translatedConfig.accept;
    }
  }, [translatedConfig.accept, fileInputRef]);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) {
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      dragCounter.current = 0;

      const files = e.dataTransfer.files;
      if (files && files.length > 0) {
        // Create a synthetic event to reuse existing handler
        const input = fileInputRef.current;
        if (input) {
          const dt = new DataTransfer();
          for (let i = 0; i < files.length; i++) {
            dt.items.add(files[i]);
          }
          input.files = dt.files;
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }
    },
    [fileInputRef],
  );

  return (
    <div className="flex-1 flex flex-col w-full h-full relative overflow-hidden">
      {/* Ambient Background Glow */}
      <AnimatePresence mode="wait">
        <motion.div
          key={mode}
          className={`absolute inset-0 bg-radial-[at_50%_30%] ${translatedConfig.gradient} to-transparent pointer-events-none`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.6 }}
        />
      </AnimatePresence>

      {/* Main Drop Zone */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: Main drop zone container */}
      <div
        ref={dropRef}
        className="flex-1 flex flex-col items-center justify-center px-6 pb-28 pt-4 gap-4 relative z-10"
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        role="presentation"
      >
        {/* Drop Zone Visual */}
        <motion.div
          className={`
            relative w-full max-w-[320px] aspect-4/5 rounded-xl
            flex flex-col items-center justify-center gap-5
            border-2 border-dashed transition-colors duration-300 cursor-pointer
            ${
              isDragging
                ? `${translatedConfig.borderAccent} bg-white/4`
                : 'border-white/8 hover:border-white/15 bg-white/2 hover:bg-white/3'
            }
          `}
          animate={{
            scale: isDragging ? 1.02 : 1,
            borderColor: isDragging ? undefined : undefined,
          }}
          transition={{ duration: 0.2 }}
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              fileInputRef.current?.click();
            }
          }}
          role="button"
          tabIndex={0}
        >
          {/* Animated Icon Container */}
          <motion.div
            className={`
              w-20 h-20 rounded-[22px] flex items-center justify-center
              bg-linear-to-br from-white/6 to-white/2
              border border-white/8 ${translatedConfig.glowColor} shadow-lg
            `}
            animate={{
              y: isDragging ? -8 : 0,
              scale: isDragging ? 1.1 : 1,
            }}
            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
          >
            <AnimatePresence mode="wait">
              <motion.div
                key={mode}
                initial={{ opacity: 0, scale: 0.5, rotate: -20 }}
                animate={{ opacity: 1, scale: 1, rotate: 0 }}
                exit={{ opacity: 0, scale: 0.5, rotate: 20 }}
                transition={{ duration: 0.3 }}
              >
                {isDragging ? (
                  <ArrowUpFromLine
                    size={36}
                    className={translatedConfig.accent}
                    strokeWidth={1.5}
                  />
                ) : (
                  <translatedConfig.icon
                    size={36}
                    className="text-white/40"
                    strokeWidth={1.5}
                  />
                )}
              </motion.div>
            </AnimatePresence>
          </motion.div>

          {/* Text */}
          <div className="text-center space-y-2 px-4">
            <AnimatePresence mode="wait">
              <motion.p
                key={isDragging ? 'dragging' : mode}
                className="text-base font-semibold text-white/80"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
              >
                {isDragging
                  ? t('createPost.upload.drop_files')
                  : t('createPost.upload.drag_files')}
              </motion.p>
            </AnimatePresence>
            <p className="text-xs text-white/30 font-medium">
              {translatedConfig.hint}
            </p>
          </div>

          {/* Upload Button */}
          <motion.button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              fileInputRef.current?.click();
            }}
            className="px-7 py-2.5 bg-linear-to-r from-brand-primary to-brand-blue text-white rounded-xl font-bold text-sm
                       shadow-lg shadow-brand-primary/20 hover:shadow-brand-primary/30
                       transition-all duration-300 active:scale-95"
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
          >
            {t('createPost.upload.select_device')}
          </motion.button>

          {/* Camera Quick Action (hidden on desktop) */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              // For mobile: use capture attribute
              const input = document.createElement('input');
              input.type = 'file';
              input.accept = 'image/*';
              input.capture = 'environment';
              input.onchange = (ev) =>
                handleFileSelect(
                  ev as unknown as ChangeEvent<HTMLInputElement>,
                );
              input.click();
            }}
            className="flex items-center gap-2 text-xs text-white/30 hover:text-white/50 transition-colors font-medium md:hidden"
          >
            <Camera size={14} /> {t('createPost.upload.take_photo')}
          </button>

          {/* Drag overlay shimmer effect */}
          {isDragging && (
            <motion.div
              className="absolute inset-0 rounded-xl pointer-events-none"
              style={{
                background:
                  'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, transparent 50%, rgba(255,255,255,0.03) 100%)',
              }}
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 1, 0.5, 1] }}
              transition={{ duration: 1.5, repeat: Number.POSITIVE_INFINITY }}
            />
          )}
        </motion.div>

        {/* Text Story CTA (Story mode only) */}
        <AnimatePresence>
          {mode === 'STORY' && onTextStory && (
            <motion.button
              type="button"
              onClick={onTextStory}
              className="flex items-center gap-3 px-5 py-3 rounded-lg
                         bg-white/4 border border-white/8
                         hover:bg-white/7 hover:border-white/15
                         transition-all duration-300 group"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              transition={{ duration: 0.3, delay: 0.1 }}
            >
              <div className="w-10 h-10 rounded-xl bg-linear-to-br from-amber-500/20 to-rose-500/20 border border-white/10 flex items-center justify-center">
                <Sparkles size={18} className="text-amber-400" />
              </div>
              <div className="text-left">
                <p className="text-sm font-bold text-white/90 group-hover:text-white transition-colors">
                  {t('createPost.upload.create_text_story')}
                </p>
                <p className="text-xs text-white/30 font-medium">
                  {t('createPost.upload.create_text_story_desc')}
                </p>
              </div>
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={translatedConfig.accept}
        className="hidden"
        onChange={handleFileSelect}
      />

      {/* Mode Switcher — Premium Pill Design */}
      <div className="absolute bottom-0 left-0 right-0 p-4 bg-linear-to-t from-neutral-900/95 via-neutral-900/80 to-transparent z-20">
        <div className="flex justify-center">
          <div className="flex bg-white/4 backdrop-blur-xl rounded-lg p-1 border border-white/6 shadow-2xl">
            {(['POST', 'STORY', 'FRAME'] as const).map((m) => {
              const cfg = MODE_CONFIG[m];
              const Icon = cfg.icon;
              const isActive = mode === m;
              return (
                <button
                  type="button"
                  key={m}
                  onClick={() => setMode(m)}
                  className="relative px-5 py-2.5 rounded-xl flex items-center gap-2 transition-all duration-300"
                >
                  {isActive && (
                    <motion.div
                      layoutId="mode-pill-bg"
                      className="absolute inset-0 bg-white/8 border border-white/10 rounded-xl"
                      transition={{
                        type: 'spring',
                        stiffness: 400,
                        damping: 30,
                      }}
                    />
                  )}
                  <Icon
                    size={15}
                    className={`relative z-10 transition-colors duration-200 ${
                      isActive ? cfg.accent : 'text-white/25'
                    }`}
                    strokeWidth={2}
                  />
                  <span
                    className={`relative z-10 text-xs font-bold tracking-wide transition-colors duration-200 ${
                      isActive ? 'text-white' : 'text-white/30'
                    }`}
                  >
                    {t(`createPost.upload.${cfg.label.toLowerCase()}`)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
