import { AnimatePresence, motion } from 'framer-motion';
import {
  ChevronRight,
  DollarSign,
  Eye,
  Hash,
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
  MediaFile,
  SubScreen,
} from '../../hooks/useCreatePost';
import { useAuthStore } from '../../stores/authStore';
import type { Audio as AudioTrack } from '../../types';
import Carousel from '../Carousel';

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
}: CaptionStepProps) {
  const { t } = useTranslation();
  const { profile } = useAuthStore();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isFocused, setIsFocused] = useState(false);

  const charCount = caption.length;
  const charPercent = Math.min((charCount / MAX_CAPTION_LENGTH) * 100, 100);
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
      activeColor: 'text-blue-400',
      onClick: () => setSubScreen('location'),
    },
    {
      key: 'tags',
      icon: UserPlus,
      label: t('createPost.caption.tag_people'),
      isActive: false,
      activeColor: 'text-blue-400',
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
      activeColor: 'text-blue-400',
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
    <div className="flex flex-col md:flex-row h-full">
      {/* Preview Panel */}
      <div className="w-full md:w-[45%] bg-zinc-950 flex items-center justify-center border-b md:border-b-0 md:border-r border-white/4 p-6 md:p-8 relative">
        {/* Ambient glow */}
        <div className="absolute inset-0 bg-radial-[at_50%_50%] from-brand-primary/4 via-transparent to-transparent pointer-events-none" />

        <motion.div
          layout
          className={`relative w-full ${
            mode === 'POST'
              ? 'max-w-[280px] aspect-square'
              : 'max-w-[220px] aspect-9/16'
          } bg-black rounded-2xl border border-white/6 overflow-hidden shadow-2xl shadow-black/60 z-10`}
          transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
        >
          <Carousel
            media={mediaFiles.map((m) => ({
              id: m.url,
              url: m.url,
              type: m.type,
              filter: m.filter,
            }))}
            aspectRatio={mode === 'POST' ? 'aspect-square' : 'aspect-9/16'}
            objectFit="cover"
          />
        </motion.div>
      </div>

      {/* Caption Panel */}
      <div className="w-full md:w-[55%] flex flex-col min-h-0">
        {/* User Info */}
        <div className="flex items-center gap-3 px-5 pt-5 pb-3">
          <div className="w-9 h-9 rounded-full overflow-hidden bg-neutral-800 border border-white/6 shrink-0">
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
          <span className="font-bold text-sm text-white/90">
            {profile?.username || t('createPost.caption.you')}
          </span>
        </div>

        {/* Caption Input */}
        <div className="px-5 pb-5 relative">
          <div
            className={`relative rounded-2xl transition-all duration-300 border border-white/5 ${
              isFocused
                ? 'ring-1 ring-white/10 bg-white/5 border-white/10'
                : 'bg-white/3'
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
              placeholder={t('createPost.caption.write_caption')}
              className="w-full bg-transparent text-white/90 border-0 resize-none focus:ring-0 
                         placeholder-white/20 text-[15px] leading-relaxed outline-none
                         min-h-[100px] max-h-[220px] font-normal p-4"
              style={{ fontFamily: 'Inter, system-ui, sans-serif' }}
            />
          </div>

          {/* Caption Footer: Counter + Hashtag count */}
          <div className="flex items-center justify-between mt-2">
            <div className="flex items-center gap-3">
              {hashtagCount > 0 && (
                <motion.div
                  className="flex items-center gap-1 text-[10px] text-white/25 font-medium"
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                >
                  <Hash size={10} />
                  <span>{hashtagCount}</span>
                </motion.div>
              )}
            </div>

            {/* Character Counter - Circular */}
            <div className="flex items-center gap-2">
              <AnimatePresence>
                {charCount > 0 && (
                  <motion.div
                    className="flex items-center gap-1.5"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                  >
                    {/* Circular progress indicator */}
                    <svg
                      aria-hidden="true"
                      width="20"
                      height="20"
                      viewBox="0 0 20 20"
                      className="-rotate-90"
                    >
                      {/* Background circle */}
                      <circle
                        cx="10"
                        cy="10"
                        r="8"
                        fill="none"
                        stroke="rgba(255,255,255,0.06)"
                        strokeWidth="2"
                      />
                      {/* Progress circle */}
                      <circle
                        cx="10"
                        cy="10"
                        r="8"
                        fill="none"
                        stroke={
                          isOverLimit
                            ? '#ef4444'
                            : isNearLimit
                              ? '#f59e0b'
                              : 'rgba(255,255,255,0.2)'
                        }
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeDasharray={`${2 * Math.PI * 8}`}
                        strokeDashoffset={`${2 * Math.PI * 8 * (1 - charPercent / 100)}`}
                        className="transition-all duration-300"
                      />
                    </svg>

                    <span
                      className={`text-[10px] font-bold tabular-nums transition-colors ${
                        isOverLimit
                          ? 'text-red-400'
                          : isNearLimit
                            ? 'text-amber-400'
                            : 'text-white/20'
                      }`}
                    >
                      {isNearLimit ? MAX_CAPTION_LENGTH - charCount : ''}
                    </span>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>

        {/* Divider */}
        <div className="h-px bg-white/4 mx-5" />

        {/* Action Items */}
        <div className="flex-1 overflow-y-auto px-3 py-2">
          {actionItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                type="button"
                key={item.key}
                onClick={item.onClick}
                className="w-full flex items-center gap-3 py-3.5 px-3 hover:bg-white/3 rounded-xl
                           cursor-pointer transition-all duration-200 group"
              >
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors
                    ${item.isActive ? 'bg-blue-500/10' : 'bg-white/3'}
                  `}
                >
                  <Icon
                    size={16}
                    className={`transition-colors ${
                      item.isActive
                        ? item.activeColor
                        : 'text-white/30 group-hover:text-white/50'
                    }`}
                    strokeWidth={1.8}
                  />
                </div>
                <span
                  className={`flex-1 text-left text-sm font-medium truncate transition-colors ${
                    item.isActive
                      ? `${item.activeColor} font-semibold`
                      : 'text-white/60 group-hover:text-white/80'
                  }`}
                >
                  {item.label}
                </span>
                {item.suffix || (
                  <ChevronRight
                    size={16}
                    className="text-white/15 group-hover:text-white/30 transition-colors"
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
