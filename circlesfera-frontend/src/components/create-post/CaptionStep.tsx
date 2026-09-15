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
import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import type {
  CreateMode,
  InteractiveDraft,
  MediaFile,
  SubScreen,
} from '../../hooks/useCreatePost';
import { useAuthStore } from '../../stores/authStore';
import type { Audio as AudioTrack } from '../../types';
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
  onClearAudio: () => void;
  onOpenMusic: () => void;
  isPremium?: boolean;
  interactiveDraft?: InteractiveDraft;
}

const MAX_CAPTION_LENGTH = 2200;

type OptionRow = {
  key: string;
  icon: typeof MapPin;
  label: string;
  isActive: boolean;
  onClick: () => void;
  suffix?: ReactNode;
};

export default function CaptionStep({
  mediaFiles,
  mode,
  caption,
  setCaption,
  location,
  setSubScreen,
  selectedAudio,
  onClearAudio,
  onOpenMusic,
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

  const hasImageMedia = mediaFiles.some((m) => m.type === 'image');
  const showTagPeople = mode !== 'FRAME' && hasImageMedia;

  const primaryRows: OptionRow[] = [
    {
      key: 'location',
      icon: MapPin,
      label: location || t('createPost.caption.add_location'),
      isActive: !!location,
      onClick: () => setSubScreen('location'),
    },
    ...(showTagPeople
      ? [
          {
            key: 'tags',
            icon: UserPlus,
            label: t('createPost.caption.tag_people'),
            isActive: false,
            onClick: () => setSubScreen('tags'),
          } satisfies OptionRow,
        ]
      : []),
    {
      key: 'music',
      icon: MusicIcon,
      label: selectedAudio
        ? `${selectedAudio.title} — ${selectedAudio.artist}`
        : t('createPost.caption.add_music'),
      isActive: !!selectedAudio,
      onClick: onOpenMusic,
      suffix: selectedAudio ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onClearAudio();
          }}
          className="p-1.5 min-h-9 min-w-9 flex items-center justify-center hover:bg-white/10 rounded-full transition-colors"
          aria-label={t('createPost.caption.clear_music')}
        >
          <X size={14} className="text-white/40 hover:text-white/70" />
        </button>
      ) : null,
    },
  ];

  if (mode === 'FRAME') {
    const musicIdx = primaryRows.findIndex((r) => r.key === 'music');
    if (musicIdx > 0) {
      const [music] = primaryRows.splice(musicIdx, 1);
      primaryRows.unshift(music);
    }
  }

  const moreRows: OptionRow[] = [
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
          } satisfies OptionRow,
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

  const renderRows = (rows: OptionRow[]) => (
    <div className="rounded-xl border border-white/8 bg-white/2 overflow-hidden divide-y divide-white/6">
      {rows.map((item) => {
        const Icon = item.icon;
        return (
          <button
            type="button"
            key={item.key}
            onClick={item.onClick}
            className="w-full flex items-center justify-between min-h-11 px-3 py-2 hover:bg-white/5 transition-all text-left group outline-none focus-visible:bg-white/8"
          >
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              <div
                className={`w-8 h-8 rounded-lg border flex items-center justify-center shrink-0 transition-all ${
                  item.isActive
                    ? 'bg-brand-primary/15 border-brand-primary/30 text-brand-primary'
                    : 'bg-white/5 border-white/8 text-white/70 group-hover:text-white'
                }`}
              >
                <Icon size={14} strokeWidth={1.8} />
              </div>
              <span
                className={`text-[13px] font-semibold text-left wrap-break-word line-clamp-2 ${
                  item.isActive ? 'text-white' : 'text-white/90'
                }`}
              >
                {item.label}
              </span>
            </div>
            <div className="flex items-center gap-1 shrink-0 ml-2">
              {item.suffix ?? null}
              <ChevronRight
                size={16}
                className="text-white/30 group-hover:text-white/60 transition-colors"
              />
            </div>
          </button>
        );
      })}
    </div>
  );

  return (
    <div className="flex flex-col md:flex-row h-full overflow-y-auto md:overflow-hidden bg-surface-elevated">
      <div className="hidden md:flex w-[38%] min-w-37 max-w-50 bg-surface-base items-center justify-center border-r border-white/8 p-3 relative shrink-0">
        <div
          className={`relative w-full ${
            mode === 'POST' ? 'max-w-37 aspect-4/5' : 'max-w-30 aspect-9/16'
          } bg-black rounded-xl border border-white/10 overflow-hidden shadow-xl z-10`}
        >
          <InteractiveMediaPreview
            mediaFiles={mediaFiles}
            mode={mode}
            className="w-full! h-full! max-h-none! rounded-xl border-0 shadow-none"
          />
        </div>
      </div>

      <div className="flex-1 flex flex-col min-h-0 overflow-y-auto no-scrollbar">
        <div className="flex items-start gap-2.5 px-3 py-2.5 border-b border-white/8 shrink-0">
          <div className="md:hidden shrink-0">
            <InteractiveMediaPreview mediaFiles={mediaFiles} mode={mode} />
          </div>

          <div className="flex-1 min-w-0 flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <UserAvatar src={profile?.avatar} alt={username} size="sm" />
              <span className="font-bold text-[13px] text-white/90 truncate">
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
                className="w-full bg-transparent text-white/90 border-0 resize-none focus:outline-none placeholder-white/30 text-sm leading-relaxed min-h-20 max-h-40 p-0 md:p-2.5"
                aria-label={t('createPost.caption.write_caption')}
              />
              <div className="flex items-center justify-end md:px-2.5 md:pb-1.5">
                <span
                  className={`text-[11px] font-bold tabular-nums ${
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

        <div className="px-3 py-2.5 space-y-2.5 pb-3">
          <span className="text-[11px] font-bold uppercase tracking-wider text-white/50 px-1 block">
            {t('createPost.caption.options')}
          </span>
          {renderRows(primaryRows)}

          <span className="text-[11px] font-bold uppercase tracking-wider text-white/50 px-1 block pt-0.5">
            {t('createPost.caption.more_options')}
          </span>
          {renderRows(moreRows)}
        </div>
      </div>
    </div>
  );
}
