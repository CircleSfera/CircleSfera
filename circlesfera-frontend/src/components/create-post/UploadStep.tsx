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
import { CREATE_PRIMARY, CREATE_SECONDARY } from './createStyles';

interface UploadStepProps {
  fileInputRef: MutableRefObject<HTMLInputElement | null>;
  handleFileSelect: (e: ChangeEvent<HTMLInputElement>) => void;
  mode: CreateMode;
  setMode: (mode: CreateMode) => void;
  onTextStory?: () => void;
  allowModeSwitch?: boolean;
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
  allowModeSwitch = true,
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
          const list = Array.from(files);
          const accepted =
            mode === 'FRAME'
              ? list.filter((f) => f.type.startsWith('video/')).slice(0, 1)
              : list;
          if (mode === 'FRAME' && accepted.length === 0) {
            return;
          }
          for (const file of accepted) {
            dt.items.add(file);
          }
          input.files = dt.files;
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }
    },
    [fileInputRef, mode],
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
    <div className="flex-1 flex flex-col w-full h-full relative overflow-hidden bg-surface-elevated">
      {/* biome-ignore lint/a11y/noStaticElementInteractions: Main drop zone container */}
      <div
        ref={dropRef}
        className={`
          flex-1 flex flex-col min-h-0 relative z-10
          px-4 pt-4 gap-3
          ${allowModeSwitch ? 'pb-[4.75rem] md:pb-16' : 'pb-4'}
          transition-colors duration-300
        `}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        role="presentation"
      >
        {/* The place to drop or pick files: a large panel with the brand glow,
            so the screen is not an empty black page. */}
        <motion.div
          className={`relative w-full flex-1 min-h-0 flex flex-col items-center justify-center gap-4 px-6 text-center overflow-hidden rounded-3xl border border-dashed transition-colors duration-300 ${
            isDragging
              ? `${translatedConfig.borderAccent} bg-white/8`
              : 'border-white/15 bg-white/3'
          }`}
          animate={{ scale: isDragging ? 1.005 : 1 }}
          transition={{ duration: 0.2 }}
        >
          <div
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(55%_40%_at_50%_42%,rgba(var(--brand-primary-rgb),0.22),transparent_70%)]"
            aria-hidden
          />
          <div className="relative w-16 h-16 rounded-3xl flex items-center justify-center bg-linear-to-br from-brand-primary/30 to-brand-blue/20 border border-white/12 shadow-lg shadow-brand-primary/20 shrink-0">
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
                    className="text-white"
                    strokeWidth={1.5}
                  />
                ) : (
                  <translatedConfig.icon
                    size={28}
                    className="text-white"
                    strokeWidth={1.5}
                  />
                )}
              </motion.div>
            </AnimatePresence>
          </div>

          <div className="relative space-y-1.5 w-full">
            <p className="text-xl font-semibold text-white leading-tight">
              {isDragging
                ? t('createPost.upload.drop_files')
                : translatedConfig.description}
            </p>
            {!isDragging ? (
              <p className="text-sm text-white/60 text-balance">
                <span className="hidden md:inline">
                  {t('createPost.upload.drag_files')}
                  {' · '}
                </span>
                {translatedConfig.hint}
              </p>
            ) : null}
          </div>
        </motion.div>

        {/* Actions at the bottom, within reach of the thumb. */}
        <div className="flex flex-col w-full gap-2 shrink-0 md:max-w-sm md:mx-auto">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className={`w-full ${CREATE_PRIMARY}`}
          >
            {mode === 'FRAME'
              ? t('createPost.upload.select_video')
              : t('createPost.upload.select_device')}
          </button>

          {mode !== 'FRAME' ? (
            <button
              type="button"
              onClick={openCamera}
              className={`w-full md:hidden ${CREATE_SECONDARY}`}
            >
              <Camera size={18} aria-hidden />
              {t('createPost.upload.take_photo')}
            </button>
          ) : null}

          <AnimatePresence>
            {mode === 'STORY' && onTextStory && (
              <motion.button
                type="button"
                onClick={onTextStory}
                className={`w-full ${CREATE_SECONDARY}`}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                transition={{ duration: 0.2 }}
              >
                <Sparkles size={18} className="text-brand-accent" aria-hidden />
                {t('createPost.upload.create_text_story')}
              </motion.button>
            )}
          </AnimatePresence>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        multiple={mode !== 'FRAME'}
        accept={translatedConfig.accept}
        className="hidden"
        onChange={handleFileSelect}
      />

      {allowModeSwitch ? (
        <div
          className="absolute bottom-0 left-0 right-0 z-20 max-md:px-4 max-md:pt-2 md:px-3 md:pt-2 bg-linear-to-t from-surface-elevated from-50% via-surface-elevated/90 to-transparent"
          style={{
            paddingBottom: '0.5rem',
          }}
        >
          <div
            className="flex w-full md:max-w-sm md:mx-auto bg-white/4 rounded-xl p-1 border border-white/8"
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
                  className="relative flex-1 min-h-11 px-2 rounded-lg flex items-center justify-center gap-1.5 transition-colors duration-200 outline-none focus-visible:ring-2 focus-visible:ring-white/20"
                >
                  {isActive && (
                    <motion.div
                      layoutId="mode-pill-bg"
                      className="absolute inset-0 bg-white/10 border border-white/12 rounded-lg"
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
                      isActive ? cfg.accent : 'text-white/30'
                    }`}
                    strokeWidth={2}
                  />
                  <span
                    className={`relative z-10 text-xs font-bold tracking-wide ${
                      isActive ? 'text-white' : 'text-white/35'
                    }`}
                  >
                    {t(`createPost.upload.${cfg.label.toLowerCase()}`)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
