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
import UserAvatar from '../UserAvatar';
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

  const optionRows = [
    {
      key: 'location',
      icon: MapPin,
      label: location || t('createPost.caption.add_location'),
      isActive: !!location,
      onClick: () => setSubScreen('location'),
    },
    {
      key: 'tags',
      icon: UserPlus,
      label: t('createPost.caption.tag_people'),
      isActive: false,
      onClick: () => setSubScreen('tags'),
    },
    {
      key: 'music',
      icon: MusicIcon,
      label: selectedAudio
        ? `${selectedAudio.title} — ${selectedAudio.artist}`
        : t('createPost.caption.add_music'),
      isActive: !!selectedAudio,
      onClick: () => setShowMusicPicker(true),
      suffix: selectedAudio ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setSelectedAudio(null);
          }}
          className="p-2 min-h-11 min-w-11 flex items-center justify-center hover:bg-white/10 rounded-full transition-colors"
          aria-label={t('createPost.caption.clear_music')}
        >
          <X size={14} className="text-white/40 hover:text-white/70" />
        </button>
      ) : null,
    },
    ...(mode === 'POST' || mode === 'FRAME'
      ? [
          {
            key: 'interactive',
            icon: BarChart2,
            label: interactiveDraft
              ? interactiveDraft.kind === 'poll'
                ? t('createPost.interactive.poll_attached')
                : t('createPost.interactive.qna_attached')
              : t('createPost.interactive.add'),
            isActive: !!interactiveDraft,
            onClick: () => setSubScreen('interactive'),
          },
        ]
      : []),
    {
      key: 'monetization',
      icon: DollarSign,
      label: isPremium
        ? t('createPost.caption.monetization_active')
        : t('createPost.caption.monetization'),
      isActive: !!isPremium,
      onClick: () => setSubScreen('monetization'),
    },
    {
      key: 'accessibility',
      icon: Eye,
      label: t('createPost.caption.accessibility'),
      isActive: false,
      onClick: () => setSubScreen('accessibility'),
    },
    {
      key: 'advanced',
      icon: Settings,
      label: t('createPost.caption.advanced_settings'),
      isActive: false,
      onClick: () => setSubScreen('advanced'),
    },
  ];

  const username = profile?.username || t('createPost.caption.you');

  return (
    <div className="flex flex-col md:flex-row h-full overflow-y-auto md:overflow-hidden bg-surface-elevated">
      {/* Desktop media column */}
      <div className="hidden md:flex w-full md:w-[42%] bg-surface-base items-center justify-center border-r border-white/6 p-6 relative shrink-0">
        <div
          className={`relative w-full ${
            mode === 'POST' ? 'max-w-64 aspect-4/5' : 'max-w-48 aspect-9/16'
          } bg-black rounded-2xl border border-white/10 overflow-hidden shadow-2xl z-10`}
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
        </div>
      </div>

      <div className="flex-1 flex flex-col min-h-0 overflow-y-auto no-scrollbar">
        {/* Caption block */}
        <div className="flex items-start gap-3 p-4 border-b border-white/8 shrink-0">
          <div className="md:hidden shrink-0">
            <InteractiveMediaPreview mediaFiles={mediaFiles} mode={mode} />
          </div>

          <div className="flex-1 min-w-0 flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <UserAvatar src={profile?.avatar} alt={username} size="sm" />
              <span className="font-bold text-sm text-white/90 truncate">
                {username}
              </span>
            </div>

            <div
              className={`relative rounded-xl transition-all duration-200 border ${
                isFocused
                  ? 'ring-1 ring-brand-primary/40 bg-white/5 border-brand-primary/30'
                  : 'border-transparent md:border-white/8 md:bg-white/3'
              }`}
            >
              <textarea
                ref={textareaRef}
                value={caption}
                onChange={(e) => {
                  if (e.target.value.length <= MAX_CAPTION_LENGTH + 100) {
                    setCaption(e.target.value);
                    requestAnimationFrame(autoResize);
                  }
                }}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                placeholder={t('createPost.caption.write_caption')}
                className="w-full bg-transparent text-white/90 border-0 resize-none focus:outline-none placeholder-white/30 text-base leading-relaxed min-h-24 max-h-48 p-0 md:p-3"
                aria-label={t('createPost.caption.write_caption')}
              />
              <div className="flex items-center justify-end md:px-3 md:pb-2">
                <span
                  className={`text-xs font-bold tabular-nums ${
                    isOverLimit
                      ? 'text-brand-secondary'
                      : isNearLimit
                        ? 'text-brand-accent'
                        : 'text-white/30'
                  }`}
                >
                  {charCount} / {MAX_CAPTION_LENGTH}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Single options list */}
        <div className="p-3 space-y-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-white/40 px-1 block">
            {t('createPost.caption.options')}
          </span>
          <div className="rounded-2xl border border-white/8 bg-white/2 overflow-hidden divide-y divide-white/6">
            {optionRows.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  type="button"
                  key={item.key}
                  onClick={item.onClick}
                  className="w-full flex items-center justify-between min-h-12 px-3.5 py-2.5 hover:bg-white/5 transition-all text-left group outline-none focus-visible:bg-white/8"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 transition-all ${
                        item.isActive
                          ? 'bg-brand-primary/15 border-brand-primary/30 text-brand-primary'
                          : 'bg-white/5 border-white/8 text-white/70 group-hover:text-white'
                      }`}
                    >
                      <Icon size={16} strokeWidth={1.8} />
                    </div>
                    <span
                      className={`text-sm font-semibold truncate ${
                        item.isActive ? 'text-white' : 'text-white/90'
                      }`}
                    >
                      {item.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {'suffix' in item ? item.suffix : null}
                    <ChevronRight
                      size={16}
                      className="text-white/30 group-hover:text-white/60 transition-colors"
                    />
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
