import {
  CameraResultType,
  CameraSource,
  Camera as NativeCamera,
} from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';
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
    accent: 'text-brand-primary',
    borderAccent: 'border-brand-primary/40',
    accept: 'image/*,video/*',
  },
  STORY: {
    icon: Clock,
    label: 'Story',
    accent: 'text-brand-accent',
    borderAccent: 'border-brand-accent/40',
    accept: 'image/*,video/*',
  },
  FRAME: {
    icon: Film,
    label: 'Frame',
    accent: 'text-brand-blue',
    borderAccent: 'border-brand-blue/40',
    accept: 'video/*',
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

  const openCamera = async (e: React.MouseEvent) => {
    e.stopPropagation();

    if (Capacitor.isNativePlatform()) {
      try {
        const photo = await NativeCamera.getPhoto({
          resultType: CameraResultType.Uri,
          source: CameraSource.Camera,
          quality: 90,
          allowEditing: false,
        });

        if (photo.webPath) {
          const response = await fetch(photo.webPath);
          const blob = await response.blob();
          const file = new File(
            [blob],
            `camera_${Date.now()}.${photo.format}`,
            {
              type: `image/${photo.format}`,
            },
          );

          const dt = new DataTransfer();
          dt.items.add(file);

          if (fileInputRef.current) {
            fileInputRef.current.files = dt.files;
            fileInputRef.current.dispatchEvent(
              new Event('change', { bubbles: true }),
            );
          }
        }
      } catch (err) {
        console.warn('Camera failed or user cancelled', err);
      }
    } else {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.capture = 'environment';
      input.onchange = (ev) =>
        handleFileSelect(ev as unknown as ChangeEvent<HTMLInputElement>);
      input.click();
    }
  };

  return (
    <div className="flex-1 flex flex-col w-full h-full relative overflow-hidden bg-surface-base">
      {/* biome-ignore lint/a11y/noStaticElementInteractions: Main drop zone container */}
      <div
        ref={dropRef}
        className="flex-1 flex flex-col items-center justify-center px-4 pb-28 pt-4 gap-4 relative z-10 min-h-0"
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        role="presentation"
      >
        <motion.div
          className={`
            relative w-full max-w-sm flex-1 max-h-[min(70vh,520px)] min-h-60 rounded-xl
            flex flex-col items-center justify-center gap-4
            border-2 border-dashed transition-colors duration-300
            ${
              isDragging
                ? `${translatedConfig.borderAccent} bg-white/4`
                : 'border-white/8 bg-white/2'
            }
          `}
          animate={{ scale: isDragging ? 1.01 : 1 }}
          transition={{ duration: 0.2 }}
        >
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center bg-white/6 border border-white/8">
            <AnimatePresence mode="wait">
              <motion.div
                key={isDragging ? 'drag' : mode}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ duration: 0.2 }}
              >
                {isDragging ? (
                  <ArrowUpFromLine
                    size={28}
                    className={translatedConfig.accent}
                    strokeWidth={1.5}
                  />
                ) : (
                  <translatedConfig.icon
                    size={28}
                    className="text-white/40"
                    strokeWidth={1.5}
                  />
                )}
              </motion.div>
            </AnimatePresence>
          </div>

          <div className="text-center space-y-1 px-4">
            <p className="text-sm font-semibold text-white/80">
              {isDragging
                ? t('createPost.upload.drop_files')
                : translatedConfig.description}
            </p>
            <p className="text-xs text-white/30 font-medium hidden md:block">
              {isDragging ? null : t('createPost.upload.drag_files')}
            </p>
            <p className="text-xs text-white/25 font-medium">
              {translatedConfig.hint}
            </p>
          </div>

          <div className="flex flex-col w-full max-w-xs gap-2 px-4">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full h-12 px-4 bg-linear-to-r from-brand-primary to-brand-blue text-white rounded-xl font-bold text-sm
                         shadow-lg shadow-brand-primary/20 active:scale-[0.98] transition-transform
                         outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/50"
            >
              {t('createPost.upload.select_device')}
            </button>

            <button
              type="button"
              onClick={openCamera}
              className="w-full h-12 px-4 flex items-center justify-center gap-2 rounded-xl font-bold text-sm
                         bg-white/6 border border-white/10 text-white/90 hover:bg-white/10
                         active:scale-[0.98] transition-all md:hidden
                         outline-none focus-visible:ring-2 focus-visible:ring-white/20"
            >
              <Camera size={18} />
              {t('createPost.upload.take_photo')}
            </button>
          </div>
        </motion.div>

        <AnimatePresence>
          {mode === 'STORY' && onTextStory && (
            <motion.button
              type="button"
              onClick={onTextStory}
              className="flex items-center gap-3 w-full max-w-sm px-4 h-14 rounded-xl
                         bg-white/4 border border-white/8
                         hover:bg-white/7 hover:border-white/15
                         transition-all duration-200 group shrink-0
                         outline-none focus-visible:ring-2 focus-visible:ring-white/20"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.2 }}
            >
              <div className="w-10 h-10 rounded-xl bg-brand-accent/15 border border-brand-accent/20 flex items-center justify-center shrink-0">
                <Sparkles size={18} className="text-brand-accent" />
              </div>
              <div className="text-left min-w-0">
                <p className="text-sm font-bold text-white/90 truncate">
                  {t('createPost.upload.create_text_story')}
                </p>
                <p className="text-xs text-white/30 font-medium truncate">
                  {t('createPost.upload.create_text_story_desc')}
                </p>
              </div>
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={translatedConfig.accept}
        className="hidden"
        onChange={handleFileSelect}
      />

      <div className="absolute bottom-0 left-0 right-0 p-3 pb-safe bg-linear-to-t from-surface-base via-surface-base/95 to-transparent z-20">
        <div className="flex justify-center">
          <div
            className="flex bg-white/4 rounded-xl p-1 border border-white/6"
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
                  className="relative min-h-11 px-4 rounded-lg flex items-center gap-2 transition-colors duration-200 outline-none focus-visible:ring-2 focus-visible:ring-white/20"
                >
                  {isActive && (
                    <motion.div
                      layoutId="mode-pill-bg"
                      className="absolute inset-0 bg-white/8 border border-white/10 rounded-lg"
                      transition={{
                        type: 'spring',
                        stiffness: 400,
                        damping: 30,
                      }}
                    />
                  )}
                  <Icon
                    size={15}
                    className={`relative z-10 ${
                      isActive ? cfg.accent : 'text-white/25'
                    }`}
                    strokeWidth={2}
                  />
                  <span
                    className={`relative z-10 text-xs font-bold tracking-wide ${
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
