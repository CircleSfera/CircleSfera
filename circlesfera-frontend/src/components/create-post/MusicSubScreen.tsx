import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Check, Music, Pause, Play, Search } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { audioApi } from '../../services/audio.service';
import type { Audio } from '../../types';
import AudioClipWaveform from '../audio/AudioClipWaveform';
import { SUBSCREEN_SHELL } from './ComposerChrome';
import SubScreenHeader from './SubScreenHeader';

function generateGradient(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h1 = Math.abs(hash % 360);
  const h2 = (h1 + 40 + Math.abs((hash >> 3) % 80)) % 360;
  return `linear-gradient(135deg, hsl(${h1}, 80%, 65%), hsl(${h2}, 85%, 50%))`;
}

export type AudioSelection = {
  audio: Audio;
  audioStartMs: number;
};

interface MusicSubScreenProps {
  onClose: () => void;
  onSelectAudio: (selection: AudioSelection | null) => void;
  selectedAudioId?: string | null;
  selectedAudioStartMs?: number;
  /** Desired clip window in ms (media duration). Clamped to track length. */
  clipWindowMs?: number;
}

const DEFAULT_CLIP_WINDOW_MS = 15_000;

function formatClock(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function MusicSubScreen({
  onClose,
  onSelectAudio,
  selectedAudioId,
  selectedAudioStartMs = 0,
  clipWindowMs = DEFAULT_CLIP_WINDOW_MS,
}: MusicSubScreenProps) {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(
    null,
  );
  const [trimTrack, setTrimTrack] = useState<Audio | null>(null);
  const [trimStartMs, setTrimStartMs] = useState(0);
  const [isTrimPreviewPlaying, setIsTrimPreviewPlaying] = useState(false);
  const trimAudioRef = useRef<HTMLAudioElement | null>(null);
  const trimStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: trendingAudios, isLoading: isLoadingTrending } = useQuery({
    queryKey: ['audio', 'trending'],
    queryFn: async () => {
      const res = await audioApi.getTrending();
      return res.data;
    },
    enabled: !searchQuery && !trimTrack,
  });

  const { data: searchAudios, isLoading: isLoadingSearch } = useQuery({
    queryKey: ['audio', 'search', searchQuery],
    queryFn: async () => {
      const res = await audioApi.search(searchQuery);
      return res.data;
    },
    enabled: searchQuery.trim().length > 0 && !trimTrack,
  });

  useEffect(() => {
    return () => {
      setAudioElement((prev) => {
        prev?.pause();
        return null;
      });
      if (trimStopTimerRef.current) {
        clearTimeout(trimStopTimerRef.current);
        trimStopTimerRef.current = null;
      }
      if (trimAudioRef.current) {
        trimAudioRef.current.pause();
        trimAudioRef.current = null;
      }
    };
  }, []);

  const audioList =
    searchQuery.trim().length > 0 ? searchAudios || [] : trendingAudios || [];

  const trackDurationMs = useMemo(() => {
    if (!trimTrack) return 0;
    return Math.max(0, Math.floor((trimTrack.duration || 0) * 1000));
  }, [trimTrack]);

  const effectiveWindowMs = useMemo(() => {
    if (trackDurationMs <= 0) return Math.max(1000, clipWindowMs);
    return Math.min(Math.max(1000, clipWindowMs), trackDurationMs);
  }, [clipWindowMs, trackDurationMs]);

  const maxStartMs = Math.max(0, trackDurationMs - effectiveWindowMs);

  const stopListPreview = () => {
    audioElement?.pause();
    setPlayingAudioId(null);
    setAudioElement(null);
  };

  const stopTrimPreview = () => {
    if (trimStopTimerRef.current) {
      clearTimeout(trimStopTimerRef.current);
      trimStopTimerRef.current = null;
    }
    if (trimAudioRef.current) {
      trimAudioRef.current.pause();
      trimAudioRef.current = null;
    }
    setIsTrimPreviewPlaying(false);
  };

  const handleTogglePreview = (audio: Audio) => {
    if (playingAudioId === audio.id) {
      stopListPreview();
    } else {
      stopListPreview();
      const newAudio = new window.Audio(audio.url);
      newAudio.play().catch(() => {});
      setPlayingAudioId(audio.id);
      setAudioElement(newAudio);
      newAudio.onended = () => setPlayingAudioId(null);
    }
  };

  const openTrim = (audio: Audio) => {
    stopListPreview();
    stopTrimPreview();
    const durationMs = Math.max(0, Math.floor((audio.duration || 0) * 1000));
    const windowMs = Math.min(
      Math.max(1000, clipWindowMs),
      durationMs || clipWindowMs,
    );
    const maxStart = Math.max(0, durationMs - windowMs);
    const initialStart =
      selectedAudioId === audio.id
        ? Math.min(Math.max(0, selectedAudioStartMs), maxStart)
        : 0;
    setTrimTrack(audio);
    setTrimStartMs(initialStart);
  };

  const handleConfirmTrim = () => {
    if (!trimTrack) return;
    stopTrimPreview();
    onSelectAudio({ audio: trimTrack, audioStartMs: Math.round(trimStartMs) });
    onClose();
  };

  const handleBackFromTrim = () => {
    stopTrimPreview();
    setTrimTrack(null);
  };

  const handleClearSelection = () => {
    stopListPreview();
    stopTrimPreview();
    onSelectAudio(null);
    onClose();
  };

  const handleTrimPreview = () => {
    if (!trimTrack) return;

    if (isTrimPreviewPlaying) {
      stopTrimPreview();
      return;
    }

    stopTrimPreview();

    if (!trimAudioRef.current || trimAudioRef.current.src !== trimTrack.url) {
      trimAudioRef.current = new window.Audio(trimTrack.url);
    }

    const audio = trimAudioRef.current;
    audio.currentTime = trimStartMs / 1000;

    audio.play().catch(console.error);
    setIsTrimPreviewPlaying(true);

    // Clear any previous timer
    if (trimStopTimerRef.current) {
      clearTimeout(trimStopTimerRef.current);
    }

    // Fallback timer in case ontimeupdate misses
    trimStopTimerRef.current = setTimeout(() => {
      stopTrimPreview();
    }, effectiveWindowMs);

    audio.ontimeupdate = () => {
      if (audio.currentTime >= (trimStartMs + effectiveWindowMs) / 1000) {
        stopTrimPreview();
      }
    };

    audio.onpause = () => {
      setIsTrimPreviewPlaying(false);
    };

    audio.onended = () => {
      stopTrimPreview();
    };
  };

  const handleTrimStartChange = (next: number) => {
    stopTrimPreview();
    setTrimStartMs(next);
  };

  return (
    <div className={`${SUBSCREEN_SHELL}`}>
      <motion.div
        initial={{ opacity: 0, x: '100%' }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: '100%' }}
        transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
        className="w-full max-w-md mx-auto h-full max-md:h-full bg-surface-elevated flex flex-col relative"
      >
        <SubScreenHeader
          title={
            trimTrack ? t('modals.audio.trim_title') : t('modals.audio.title')
          }
          onClose={trimTrack ? handleBackFromTrim : onClose}
          closeIcon={trimTrack ? 'back' : 'close'}
        />
        <div className="flex flex-col flex-1 min-h-0 relative">
          {trimTrack ? (
            <div className="flex flex-col flex-1 min-h-0 p-5 gap-5">
              <div className="flex items-center gap-4">
                <div
                  className="w-16 h-16 rounded-2xl shrink-0 shadow-lg"
                  style={{ background: generateGradient(trimTrack.id) }}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-lg font-bold text-white truncate">
                    {trimTrack.title}
                  </p>
                  <p className="text-sm font-medium text-white/50 truncate">
                    {trimTrack.artist || t('modals.audio.unknown_artist')}
                  </p>
                </div>
              </div>

              <p className="text-[13px] font-medium text-white/40">
                {t('modals.audio.trim_hint', {
                  seconds: Math.round(effectiveWindowMs / 1000),
                })}
              </p>

              <div className="rounded-2xl border border-white/5 bg-white/5 p-4 space-y-4 shadow-inner mb-4">
                <div className="flex items-center justify-between text-xs font-semibold tracking-wide text-white/40">
                  <span>{formatClock(trimStartMs)}</span>
                  <span>
                    {formatClock(trimStartMs + effectiveWindowMs)}
                    {trackDurationMs > 0
                      ? ` / ${formatClock(trackDurationMs)}`
                      : ''}
                  </span>
                </div>

                <div className="py-2">
                  <AudioClipWaveform
                    url={trimTrack.url}
                    seed={trimTrack.id}
                    trackDurationMs={trackDurationMs}
                    windowMs={effectiveWindowMs}
                    startMs={Math.min(trimStartMs, maxStartMs)}
                    maxStartMs={maxStartMs}
                    disabled={maxStartMs <= 0}
                    onStartMsChange={handleTrimStartChange}
                    aria-label={t('modals.audio.trim_slider')}
                  />
                </div>

                <div className="flex items-center gap-3 pt-2">
                  <button
                    type="button"
                    onClick={handleTrimPreview}
                    className="min-h-12 h-12 px-5 rounded-full bg-white/10 hover:bg-white/20 text-white text-[13px] font-bold inline-flex items-center justify-center gap-2 transition-all shadow-sm"
                  >
                    {isTrimPreviewPlaying ? (
                      <>
                        <Pause className="w-4 h-4 fill-current" aria-hidden />
                        {t('modals.audio.pause_preview')}
                      </>
                    ) : (
                      <>
                        <Play
                          className="w-4 h-4 fill-current ml-0.5"
                          aria-hidden
                        />
                        {t('modals.audio.preview_clip')}
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmTrim}
                    className="min-h-12 h-12 flex-1 px-5 rounded-full bg-linear-to-r from-brand-primary to-brand-blue text-white text-[14px] font-bold inline-flex items-center justify-center gap-1.5 shadow-lg shadow-brand-primary/25 transition-transform active:scale-95"
                  >
                    <Check className="w-4 h-4" strokeWidth={2.5} aria-hidden />
                    {t('modals.audio.confirm_clip')}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col flex-1 min-h-0">
              <div className="relative shrink-0 px-6 pt-4 pb-4 bg-surface-elevated/95 backdrop-blur-xl border-b border-white/4 z-10">
                <Search
                  className="absolute left-9 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40"
                  aria-hidden
                />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t('modals.audio.search_placeholder')}
                  className="w-full bg-white/5 border border-white/10 rounded-2xl pl-11 pr-4 py-2 min-h-11 h-11 text-[14px] font-medium text-white placeholder-white/30 focus:outline-none focus:border-white/20 focus:bg-white/10 transition-all shadow-inner"
                />
              </div>

              <div className="flex-1 overflow-y-auto px-2 py-3 space-y-1 custom-scrollbar min-h-0 relative">
                {selectedAudioId && (
                  <div className="px-4 mb-4 mt-1">
                    <button
                      type="button"
                      onClick={handleClearSelection}
                      className="w-full px-4 py-2 min-h-10 text-[13px] font-semibold text-red-400 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 rounded-xl flex items-center justify-center transition shrink-0"
                    >
                      {t('modals.audio.clear_selection')}
                    </button>
                  </div>
                )}

                {isLoadingTrending || isLoadingSearch ? (
                  <div className="py-16 text-center text-sm font-medium text-white/40 animate-pulse">
                    {t('modals.audio.loading')}
                  </div>
                ) : audioList.length === 0 ? (
                  <div className="py-16 text-center text-sm font-medium text-white/40">
                    {searchQuery
                      ? t('modals.audio.no_results')
                      : t('modals.audio.empty')}
                  </div>
                ) : (
                  audioList.map((audio) => {
                    const isSelected = selectedAudioId === audio.id;
                    const isPlaying = playingAudioId === audio.id;

                    return (
                      <motion.div
                        whileTap={{ scale: 0.98 }}
                        key={audio.id}
                        className={`group flex items-center justify-between gap-4 px-3 py-2.5 rounded-2xl transition-all cursor-pointer mx-3 ${
                          isSelected
                            ? 'bg-brand-primary/10'
                            : 'hover:bg-white/3'
                        }`}
                        onClick={(e) => {
                          if ((e.target as HTMLElement).closest('button'))
                            return;
                          handleTogglePreview(audio);
                        }}
                      >
                        <div className="flex items-center gap-4 min-w-0 flex-1">
                          <div
                            className="relative w-10 h-10 rounded-lg overflow-hidden shrink-0 flex items-center justify-center shadow-md"
                            style={{ background: generateGradient(audio.id) }}
                          >
                            <Music className="w-4 h-4 text-white/30 absolute" />
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleTogglePreview(audio);
                              }}
                              aria-label={
                                isPlaying
                                  ? t('modals.audio.pause_preview')
                                  : t('modals.audio.play_preview')
                              }
                              className={`absolute inset-0 flex items-center justify-center transition-all duration-300 ${
                                isPlaying
                                  ? 'bg-black/40 backdrop-blur-[2px]'
                                  : 'bg-black/20 opacity-0 group-hover:opacity-100 backdrop-blur-[2px]'
                              }`}
                            >
                              {isPlaying ? (
                                <Pause className="w-4 h-4 fill-white text-white drop-shadow-md" />
                              ) : (
                                <Play className="w-4 h-4 fill-white text-white ml-0.5 drop-shadow-md" />
                              )}
                            </button>
                          </div>

                          <div className="min-w-0 flex-1">
                            <p
                              className={`text-[14px] font-semibold truncate transition-colors ${isSelected ? 'text-brand-primary' : 'text-white'}`}
                            >
                              {audio.title}
                            </p>
                            <p className="text-[12px] text-white/50 font-medium truncate mt-0.5">
                              {audio.artist || t('modals.audio.unknown_artist')}
                            </p>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            openTrim(audio);
                          }}
                          className={`px-3.5 py-1.5 min-h-8 rounded-full text-[12px] font-bold flex items-center gap-1.5 transition-all shrink-0 shadow-sm ${
                            isSelected
                              ? 'bg-white text-black'
                              : 'bg-white/10 hover:bg-white/20 text-white'
                          }`}
                        >
                          {isSelected ? (
                            <>
                              <Check className="w-3.5 h-3.5" aria-hidden />
                              {t('modals.audio.selected')}
                            </>
                          ) : (
                            t('modals.audio.use')
                          )}
                        </button>
                      </motion.div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
