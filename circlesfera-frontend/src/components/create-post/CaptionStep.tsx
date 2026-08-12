import { motion } from 'framer-motion';
import {
  BarChart2,
  ChevronRight,
  DollarSign,
  Eye,
  MapPin,
  Music as MusicIcon,
  Settings,
  UserPlus,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  CreateMode,
  InteractiveDraft,
  MediaFile,
  SubScreen,
} from '../../hooks/useCreatePost';
import { useAuthStore } from '../../stores/authStore';
import type { Audio as AudioTrack } from '../../types';
import Carousel from '../Carousel';
import InteractiveMediaPreview from './InteractiveMediaPreview';

interface CaptionStepProps {
  mediaFiles: MediaFile[];
  mode: CreateMode;
  caption: string;
  setCaption: (caption: string) => void;
  location: string;
  setSubScreen: (screen: SubScreen) => void;
  selectedAudio: AudioTrack | null;
  setSelectedAudio: (audio: AudioTrack | null) => void;
  setShowMusicPicker: (show: boolean) => void;
  isPremium?: boolean;
  interactiveDraft?: InteractiveDraft;
}

const MAX_CAPTION_LENGTH = 2200;

export default function CaptionStep({
  mediaFiles,
  mode,
  caption,
  setCaption,
  location,
  setSubScreen,
  selectedAudio,
  setSelectedAudio,
  setShowMusicPicker,
  isPremium,
  interactiveDraft,
}: CaptionStepProps) {
  const { t } = useTranslation();
  const profile = useAuthStore((state) => state.profile);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isFocused, setIsFocused] = useState(false);

  const charCount = caption.length;
  const isNearLimit = charCount > MAX_CAPTION_LENGTH * 0.9;
  const isOverLimit = charCount > MAX_CAPTION_LENGTH;

  // Auto-resize textarea
  const autoResize = useCallback(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
    }
  }, []);

  useEffect(() => {
    autoResize();
  }, [autoResize]);

  // Count hashtags
  const hashtagCount = (caption.match(/#\w+/g) || []).length;

  const actionItems = [
    {
      key: 'location',
      icon: MapPin,
      label: location || t('createPost.caption.add_location'),
      isActive: !!location,
      activeColor: 'text-brand-primary',
      onClick: () => setSubScreen('location'),
    },
    {
      key: 'tags',
      icon: UserPlus,
      label: t('createPost.caption.tag_people'),
      isActive: false,
      activeColor: 'text-brand-primary',
      onClick: () => setSubScreen('tags'),
    },
    {
      key: 'accessibility',
      icon: Eye,
      label: t('createPost.caption.accessibility'),
      isActive: false,
      activeColor: '',
      onClick: () => setSubScreen('accessibility'),
    },
    {
      key: 'advanced',
      icon: Settings,
      label: t('createPost.caption.advanced_settings'),
      isActive: false,
      activeColor: '',
      onClick: () => setSubScreen('advanced'),
    },
    ...(mode === 'POST' || mode === 'FRAME'
      ? [
          {
            key: 'interactive',
            icon: BarChart2,
            label: interactiveDraft
              ? interactiveDraft.kind === 'poll'
                ? t('createPost.interactive.poll_attached', 'Poll attached')
                : t('createPost.interactive.qna_attached', 'Q&A attached')
              : t('createPost.interactive.add', 'Add poll or Q&A'),
            isActive: !!interactiveDraft,
            activeColor: 'text-sky-400',
            onClick: () => setSubScreen('interactive'),
          },
        ]
      : []),
    {
      key: 'monetization',
      icon: DollarSign,
      label: t('createPost.caption.monetization', 'Monetization'),
      isActive: !!isPremium,
      activeColor: 'text-emerald-500',
      onClick: () => setSubScreen('monetization'),
    },
    {
      key: 'music',
      icon: MusicIcon,
      label: selectedAudio
        ? `${selectedAudio.title} — ${selectedAudio.artist}`
        : t('createPost.caption.add_music'),
      isActive: !!selectedAudio,
      activeColor: 'text-brand-primary',
      onClick: () => setShowMusicPicker(true),
      suffix: selectedAudio ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setSelectedAudio(null);
          }}
          className="p-1 hover:bg-white/10 rounded-full transition-colors"
        >
          <X size={14} className="text-white/40 hover:text-white/70" />
        </button>
      ) : null,
    },
  ];

  return (
    <div className="flex flex-col md:flex-row h-full overflow-y-auto md:overflow-hidden">
      {/* Desktop Media Preview Panel */}
      <div className="hidden md:flex w-full md:w-[42%] bg-zinc-950 items-center justify-center border-r border-white/6 p-6 relative shrink-0">
        <div className="absolute inset-0 bg-radial-[at_50%_50%] from-brand-primary/10 via-transparent to-transparent pointer-events-none" />

        <motion.div
          layout
          className={`relative w-full ${
            mode === 'POST' ? 'max-w-64 aspect-4/5' : 'max-w-48 aspect-9/16'
          } bg-black rounded-2xl border border-white/10 overflow-hidden shadow-2xl shadow-black/80 z-10`}
          transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
        >
          <Carousel
            media={mediaFiles.map((m) => ({
              id: m.url,
              url: m.url,
              type: m.type,
              filter: m.filter,
            }))}
            aspectRatio={mode === 'POST' ? 'aspect-4/5' : 'aspect-9/16'}
            objectFit="cover"
          />
        </motion.div>
      </div>

      {/* Main Creation & Caption Panel */}
      <div className="flex-1 flex flex-col min-h-0 bg-zinc-900/60 overflow-y-auto no-scrollbar">
        {/* Mobile Header: Prominent Media Card & Caption Area */}
        <div className="flex md:hidden items-start gap-3.5 p-4 border-b border-white/8 bg-white/2 shrink-0">
          {/* Interactive Media Card Preview */}
          <InteractiveMediaPreview mediaFiles={mediaFiles} mode={mode} />

          {/* User Profile & Expanded Caption Box */}
          <div className="flex-1 min-w-0 flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full overflow-hidden bg-neutral-800 border border-white/10 shrink-0">
                {profile?.avatar ? (
                  <img
                    src={profile.avatar}
                    alt={profile.username}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-linear-to-tr from-brand-primary to-brand-blue flex items-center justify-center text-[10px] font-bold text-white">
                    {profile?.username?.[0]?.toUpperCase() || 'U'}
                  </div>
                )}
              </div>
              <span className="font-bold text-xs text-white/90 truncate">
                {profile?.username || t('createPost.caption.you')}
              </span>
            </div>

            <textarea
              value={caption}
              onChange={(e) => {
                if (e.target.value.length <= MAX_CAPTION_LENGTH + 100) {
                  setCaption(e.target.value);
                }
              }}
              placeholder={t(
                'createPost.caption.write_caption',
                'Escribe una descripción o pie de foto...',
              )}
              className="w-full bg-transparent text-white/90 border-0 resize-none focus:outline-none placeholder-white/30 text-xs sm:text-sm leading-relaxed min-h-24 max-h-36 p-0"
            />

            <div className="flex items-center justify-end text-[10px] text-white/30 font-bold tabular-nums">
              {charCount} / {MAX_CAPTION_LENGTH}
            </div>
          </div>
        </div>

        {/* Desktop Header: User Info & Caption Textarea */}
        <div className="hidden md:flex flex-col px-5 pt-5 pb-3">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-full overflow-hidden bg-neutral-800 border border-white/10 shrink-0">
              {profile?.avatar ? (
                <img
                  src={profile.avatar}
                  alt={profile.username}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full bg-linear-to-tr from-brand-primary to-brand-blue flex items-center justify-center text-xs font-bold text-white">
                  {profile?.username?.[0]?.toUpperCase() || 'U'}
                </div>
              )}
            </div>
            <span className="font-bold text-sm text-white">
              {profile?.username || t('createPost.caption.you')}
            </span>
          </div>

          <div
            className={`relative rounded-xl transition-all duration-300 border border-white/8 ${
              isFocused
                ? 'ring-1 ring-brand-primary/40 bg-white/5 border-brand-primary/30'
                : 'bg-white/3 hover:bg-white/4'
            }`}
          >
            <textarea
              ref={textareaRef}
              value={caption}
              onChange={(e) => {
                if (e.target.value.length <= MAX_CAPTION_LENGTH + 100) {
                  setCaption(e.target.value);
                }
              }}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              placeholder={t(
                'createPost.caption.write_caption',
                'Escribe una descripción o pie de foto...',
              )}
              className="w-full bg-transparent text-white border-0 resize-none focus:ring-0 
                         placeholder-white/30 text-sm leading-relaxed outline-none
                         min-h-24 max-h-48 font-normal p-4"
            />
            <div className="flex items-center justify-between px-4 pb-2.5">
              <span className="text-[11px] text-white/30 font-medium">
                {hashtagCount > 0 && `${hashtagCount} hashtags`}
              </span>
              <span
                className={`text-[11px] font-bold tabular-nums ${
                  isOverLimit
                    ? 'text-red-400'
                    : isNearLimit
                      ? 'text-amber-400'
                      : 'text-white/30'
                }`}
              >
                {charCount} / {MAX_CAPTION_LENGTH}
              </span>
            </div>
          </div>
        </div>

        {/* Interactive Quick-Action Chips Bar */}
        <div className="px-4 py-2.5 border-y border-white/6 bg-white/1">
          <span className="text-[10px] font-black uppercase tracking-wider text-white/40 mb-2 block">
            Acciones rápidas
          </span>
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
            <button
              type="button"
              onClick={() => setSubScreen('location')}
              className={`inline-flex items-center gap-1.5 px-4 h-11 rounded-full text-xs font-bold transition-all shrink-0 border ${
                location
                  ? 'bg-brand-primary/20 text-brand-primary border-brand-primary/40 shadow-sm'
                  : 'bg-white/5 hover:bg-white/10 text-white/80 border-white/10'
              }`}
            >
              <MapPin
                size={13}
                className={location ? 'text-brand-primary' : 'text-white/60'}
              />
              <span className="truncate max-w-32">
                {location || t('createPost.caption.add_location', 'Ubicación')}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setSubScreen('tags')}
              className="inline-flex items-center gap-1.5 px-4 h-11 rounded-full text-xs font-bold bg-white/5 hover:bg-white/10 text-white/80 border border-white/10 transition-all shrink-0"
            >
              <UserPlus size={13} className="text-white/60" />
              <span>{t('createPost.caption.tag_people', 'Etiquetar')}</span>
            </button>

            <button
              type="button"
              onClick={() => setShowMusicPicker(true)}
              className={`inline-flex items-center gap-1.5 px-4 h-11 rounded-full text-xs font-bold transition-all shrink-0 border ${
                selectedAudio
                  ? 'bg-purple-500/20 text-purple-300 border-purple-500/40 shadow-sm'
                  : 'bg-white/5 hover:bg-white/10 text-white/80 border-white/10'
              }`}
            >
              <MusicIcon
                size={13}
                className={selectedAudio ? 'text-purple-400' : 'text-white/60'}
              />
              <span className="truncate max-w-32">
                {selectedAudio
                  ? selectedAudio.title
                  : t('createPost.caption.add_music', 'Música')}
              </span>
            </button>

            {(mode === 'POST' || mode === 'FRAME') && (
              <button
                type="button"
                onClick={() => setSubScreen('interactive')}
                className={`inline-flex items-center gap-1.5 px-4 h-11 rounded-full text-xs font-bold transition-all shrink-0 border ${
                  interactiveDraft
                    ? 'bg-sky-500/20 text-sky-300 border-sky-500/40 shadow-sm'
                    : 'bg-white/5 hover:bg-white/10 text-white/80 border-white/10'
                }`}
              >
                <BarChart2
                  size={13}
                  className={
                    interactiveDraft ? 'text-sky-400' : 'text-white/60'
                  }
                />
                <span>
                  {interactiveDraft ? 'Encuesta activa' : 'Encuesta / Q&A'}
                </span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setSubScreen('monetization')}
              className={`inline-flex items-center gap-1.5 px-4 h-11 rounded-full text-xs font-bold transition-all shrink-0 border ${
                isPremium
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-sm'
                  : 'bg-white/5 hover:bg-white/10 text-white/80 border-white/10'
              }`}
            >
              <DollarSign
                size={13}
                className={isPremium ? 'text-emerald-400' : 'text-white/60'}
              />
              <span>{isPremium ? 'De pago' : 'Monetización'}</span>
            </button>
          </div>
        </div>

        {/* Compact Settings Options Container */}
        <div className="p-4 space-y-2">
          <span className="text-[10px] font-black uppercase tracking-wider text-white/40 px-1 block">
            Ajustes de publicación
          </span>
          <div className="rounded-2xl border border-white/8 bg-white/2 overflow-hidden divide-y divide-white/6">
            {actionItems
              .filter((item) =>
                ['accessibility', 'advanced'].includes(item.key),
              )
              .map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    type="button"
                    key={item.key}
                    onClick={item.onClick}
                    className="w-full flex items-center justify-between p-3.5 hover:bg-white/5 transition-all text-left group"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-xl bg-white/5 border border-white/8 flex items-center justify-center text-white/70 group-hover:text-white group-hover:bg-white/10 transition-all shrink-0">
                        <Icon size={16} strokeWidth={1.8} />
                      </div>
                      <span className="text-xs font-bold text-white/90 group-hover:text-white truncate">
                        {item.label}
                      </span>
                    </div>
                    <ChevronRight
                      size={16}
                      className="text-white/30 group-hover:text-white/60 transition-colors shrink-0"
                    />
                  </button>
                );
              })}
          </div>
        </div>
      </div>
    </div>
  );
}
