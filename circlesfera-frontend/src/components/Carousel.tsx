import { Volume2, VolumeX } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSyncedLibraryAudio } from '../hooks/useSyncedLibraryAudio';
import { parseFilter } from '../utils/styleUtils';
import HlsVideoPlayer from './common/HlsVideoPlayer';
import ProgressiveImage from './common/ProgressiveImage';

interface MediaItem {
  id: string;
  url: string;
  standardUrl?: string;
  thumbnailUrl?: string;
  type: string;
  filter?: string;
  altText?: string;
}

interface CarouselProps {
  media: MediaItem[];
  aspectRatio?: string;
  objectFit?: 'cover' | 'contain';
  className?: string;
  isLocked?: boolean;
  priority?: boolean;
  activeIndex?: number;
  onActiveIndexChange?: (index: number) => void;
  libraryAudioUrl?: string | null;
  libraryAudioStartMs?: number | null;
}

const IMAGE_AUDIO_WINDOW_MS = 15_000;

export default function Carousel({
  media,
  aspectRatio = 'aspect-4/5',
  objectFit = 'cover',
  className = '',
  isLocked = false,
  priority = false,
  activeIndex,
  onActiveIndexChange,
  libraryAudioUrl,
  libraryAudioStartMs = 0,
}: CarouselProps) {
  const { t } = useTranslation();
  const [internalIndex, setInternalIndex] = useState(0);
  const isControlled = typeof activeIndex === 'number';
  const currentIndex = isControlled ? activeIndex : internalIndex;
  const setCurrentIndex = (next: number | ((prev: number) => number)) => {
    const resolved =
      typeof next === 'function'
        ? next(isControlled ? activeIndex : internalIndex)
        : next;
    if (!isControlled) setInternalIndex(resolved);
    onActiveIndexChange?.(resolved);
  };
  const [isMuted, setIsMuted] = useState(true);
  const [isInView, setIsInView] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([]);
  const activeVideoRef = useRef<HTMLVideoElement | null>(null);

  const hasLibraryAudio = Boolean(libraryAudioUrl);
  const activeIsVideo = media[currentIndex]?.type === 'video';
  const imageOnlyWithAudio =
    hasLibraryAudio && media.every((m) => m.type !== 'video');

  useEffect(() => {
    if (!isControlled) return;
    if (activeIndex < 0 || activeIndex >= (media?.length || 0)) return;
    setInternalIndex(activeIndex);
  }, [activeIndex, isControlled, media?.length]);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) =>
        setIsInView(entry.isIntersecting && entry.intersectionRatio >= 0.45),
      { threshold: [0, 0.45, 1] },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    for (const video of videoRefs.current) {
      if (video) {
        try {
          video.pause();
        } catch (_) {}
      }
    }

    const activeVideo = videoRefs.current[currentIndex];
    activeVideoRef.current = activeVideo;
    if (activeVideo) {
      if (hasLibraryAudio) {
        activeVideo.muted = true;
      }
      activeVideo.play().catch((err) => {
        console.warn('Video autoplay failed:', err);
      });
    }
  }, [currentIndex, hasLibraryAudio]);

  useSyncedLibraryAudio({
    enabled: isInView && hasLibraryAudio && activeIsVideo,
    trackUrl: libraryAudioUrl,
    audioStartMs: libraryAudioStartMs,
    isMuted,
    videoRef: activeVideoRef,
  });

  useEffect(() => {
    if (!imageOnlyWithAudio || !libraryAudioUrl || !isInView) return;

    const startSec = Math.max(0, libraryAudioStartMs ?? 0) / 1000;
    const audio = new window.Audio(libraryAudioUrl);
    audio.muted = isMuted;
    audio.currentTime = startSec;
    audio.play().catch(() => {});

    const stopAt = window.setTimeout(() => {
      audio.pause();
    }, IMAGE_AUDIO_WINDOW_MS);

    return () => {
      window.clearTimeout(stopAt);
      audio.pause();
      audio.src = '';
    };
  }, [
    imageOnlyWithAudio,
    libraryAudioUrl,
    libraryAudioStartMs,
    isInView,
    isMuted,
  ]);

  if (!media || media.length === 0) return null;

  const toggleMute = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsMuted(!isMuted);
  };

  const renderMediaItem = (item: MediaItem, index: number) => {
    const { className: filterClass, style: filterStyle } = parseFilter(
      item.filter,
    );

    const blurClass = isLocked
      ? 'blur-2xl scale-[1.2] pointer-events-none'
      : '';

    const fitClass = objectFit === 'cover' ? 'object-cover' : 'object-contain';

    if (item.type === 'video') {
      return (
        <div className="relative w-full h-full">
          <HlsVideoPlayer
            ref={(el) => {
              videoRefs.current[index] = el;
              if (index === currentIndex) {
                activeVideoRef.current = el;
              }
            }}
            src={item.url}
            hlsUrl={
              item.standardUrl?.endsWith('.m3u8') ? item.standardUrl : undefined
            }
            className={`w-full h-full ${fitClass} ${filterClass} ${blurClass} transition-all duration-300`}
            style={filterStyle}
            autoPlay
            muted={hasLibraryAudio ? true : isMuted}
            loop
            playsInline
            disablePictureInPicture
            controlsList="nodownload nofullscreen noremoteplayback"
            onClick={toggleMute}
            preload={priority ? 'auto' : 'metadata'}
          />
          {!isLocked && (
            <button
              type="button"
              onClick={toggleMute}
              aria-label={isMuted ? t('common.unmute') : t('common.mute')}
              className="absolute bottom-4 right-4 p-2 bg-black/50 backdrop-blur-md rounded-full text-white z-20 hover:bg-black/70 transition-colors"
            >
              {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
            </button>
          )}
        </div>
      );
    }

    const isLocalUrl =
      item.url.startsWith('blob:') || item.url.startsWith('data:');
    const srcSet = !isLocalUrl
      ? [
          item.thumbnailUrl ? `${item.thumbnailUrl} 300w` : '',
          item.standardUrl ? `${item.standardUrl} 800w` : '',
          `${item.url} 1200w`,
        ]
          .filter(Boolean)
          .join(', ')
      : undefined;

    return (
      <ProgressiveImage
        placeholderSrc={item.thumbnailUrl}
        src={item.url}
        srcSet={srcSet}
        sizes="(max-width: 768px) 100vw, 800px"
        alt={item.altText || 'Post content'}
        className={`w-full h-full ${fitClass} ${filterClass} ${blurClass}`}
        style={filterStyle}
        loading={priority ? 'eager' : 'lazy'}
        fetchPriority={priority ? 'high' : undefined}
        decoding={priority ? 'sync' : 'async'}
      />
    );
  };

  const ratioClass =
    aspectRatio && aspectRatio !== 'none' ? aspectRatio : 'h-full';

  if (media.length === 1) {
    return (
      <div
        ref={rootRef}
        className={`relative w-full overflow-hidden ${ratioClass} bg-black ${className}`}
      >
        {renderMediaItem(media[0], 0)}
      </div>
    );
  }

  const nextSlide = (e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    setCurrentIndex((prev) => (prev + 1) % media.length);
  };

  const prevSlide = (e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    setCurrentIndex((prev) => (prev - 1 + media.length) % media.length);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight') nextSlide();
    if (e.key === 'ArrowLeft') prevSlide();
  };

  return (
    <section
      ref={rootRef}
      className={`relative w-full overflow-hidden group ${ratioClass} bg-black ${className}`}
      onKeyDown={handleKeyDown}
      aria-label={t('post.media.carousel')}
    >
      <div
        className="flex transition-transform duration-300 ease-out h-full"
        style={{ transform: `translateX(-${currentIndex * 100}%)` }}
        aria-live="polite"
      >
        {media.map((item, index) => (
          <div
            key={item.id}
            className="min-w-full h-full relative flex items-center justify-center"
            aria-hidden={index !== currentIndex}
          >
            {renderMediaItem(item, index)}
          </div>
        ))}
      </div>

      {currentIndex > 0 && (
        <button
          type="button"
          onClick={prevSlide}
          aria-label={t('post.media.previous_slide')}
          className="absolute left-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/70 z-30 focus:opacity-100 outline-none focus:ring-2 focus:ring-primary"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
        </button>
      )}

      {currentIndex < media.length - 1 && (
        <button
          type="button"
          onClick={nextSlide}
          aria-label={t('post.media.next_slide')}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/70 z-30 focus:opacity-100 outline-none focus:ring-2 focus:ring-primary"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5l7 7-7 7"
            />
          </svg>
        </button>
      )}

      <div
        className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1 shadow-sm z-30"
        role="tablist"
      >
        {media.map((item, i) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={i === currentIndex}
            aria-label={t('post.media.go_to_slide', { n: i + 1 })}
            onClick={(e) => {
              e.stopPropagation();
              setCurrentIndex(i);
            }}
            className={`w-2 h-2 rounded-full transition-all focus:outline-none focus:ring-2 focus:ring-primary ${
              i === currentIndex
                ? 'bg-white scale-110'
                : 'bg-white/50 hover:bg-white/70 shadow-sm'
            }`}
          />
        ))}
      </div>

      <div
        className="absolute top-4 right-4 bg-black/60 backdrop-blur-sm text-white text-xs font-medium px-2.5 py-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity z-30"
        aria-hidden="true"
      >
        {currentIndex + 1}/{media.length}
      </div>
    </section>
  );
}
