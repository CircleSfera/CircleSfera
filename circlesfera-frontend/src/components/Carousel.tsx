import { ChevronLeft, ChevronRight, Volume2, VolumeX } from 'lucide-react';
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
  /** Leave the counter out where the screen already shows the position. */
  hideCounter?: boolean;
}

const IMAGE_AUDIO_WINDOW_MS = 15_000;

// A finger has to travel this far before the gesture counts as a swipe, and
// this far along the carousel to change the item on show.
const SWIPE_SLOP_PX = 8;
const SWIPE_CHANGE_PX = 48;
// More dots than this say nothing at a glance; the counter carries the place.
const MAX_DOTS = 10;

const ARROW_CLASS =
  'absolute top-1/2 -translate-y-1/2 w-11 h-11 hidden [@media(hover:hover)]:flex items-center justify-center rounded-full bg-black/55 backdrop-blur-md border border-white/12 text-white shadow-lg z-30 transition-transform active:scale-95 outline-none focus-visible:ring-2 focus-visible:ring-white/40';

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
  hideCounter = false,
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
  const swipeRef = useRef<{
    x: number;
    y: number;
    axis: 'x' | 'y' | null;
  } | null>(null);
  const [dragPx, setDragPx] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

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
              className="absolute bottom-4 right-4 w-11 h-11 flex items-center justify-center bg-black/50 backdrop-blur-md rounded-full text-white z-20 hover:bg-black/70 transition-colors"
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

  const position = t('post.media.position', {
    n: currentIndex + 1,
    total: media.length,
  });

  const prevSlide = (e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    setCurrentIndex((prev) => (prev - 1 + media.length) % media.length);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight') nextSlide();
    if (e.key === 'ArrowLeft') prevSlide();
  };

  // Swipe with a finger: the strip follows it, and on release it settles on
  // the next or previous item. A vertical gesture is left to the page scroll.
  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    swipeRef.current = { x: touch.clientX, y: touch.clientY, axis: null };
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const swipe = swipeRef.current;
    if (!swipe) return;
    const touch = e.touches[0];
    const dx = touch.clientX - swipe.x;
    const dy = touch.clientY - swipe.y;
    if (!swipe.axis) {
      if (Math.abs(dx) < SWIPE_SLOP_PX && Math.abs(dy) < SWIPE_SLOP_PX) return;
      swipe.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      if (swipe.axis === 'x') setIsDragging(true);
    }
    if (swipe.axis !== 'x') return;
    const atEdge =
      (dx > 0 && currentIndex === 0) ||
      (dx < 0 && currentIndex === media.length - 1);
    // Past the first or the last item the strip gives a little and comes back.
    setDragPx(atEdge ? dx / 3 : dx);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const swipe = swipeRef.current;
    swipeRef.current = null;
    setIsDragging(false);
    setDragPx(0);
    if (swipe?.axis !== 'x') return;
    const dx = e.changedTouches[0].clientX - swipe.x;
    if (dx <= -SWIPE_CHANGE_PX && currentIndex < media.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else if (dx >= SWIPE_CHANGE_PX && currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  return (
    <section
      ref={rootRef}
      className={`relative w-full overflow-hidden ${ratioClass} bg-black ${className}`}
      onKeyDown={handleKeyDown}
      aria-label={t('post.media.carousel')}
    >
      <div
        className={`flex h-full touch-pan-y ${
          isDragging ? '' : 'transition-transform duration-300 ease-out'
        }`}
        style={{
          transform: `translateX(calc(-${currentIndex * 100}% + ${dragPx}px))`,
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
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

      {/* Arrows for a pointer; on a touch screen the carousel is swiped. */}
      {currentIndex > 0 && (
        <button
          type="button"
          onClick={prevSlide}
          aria-label={t('post.media.previous_slide')}
          className={`${ARROW_CLASS} left-2`}
        >
          <ChevronLeft size={20} strokeWidth={2.25} aria-hidden="true" />
        </button>
      )}

      {currentIndex < media.length - 1 && (
        <button
          type="button"
          onClick={nextSlide}
          aria-label={t('post.media.next_slide')}
          className={`${ARROW_CLASS} right-2`}
        >
          <ChevronRight size={20} strokeWidth={2.25} aria-hidden="true" />
        </button>
      )}

      {/* Where you are: read out as text, shown as a counter and as dots. */}
      <p className="sr-only" aria-live="polite">
        {position}
      </p>
      {!hideCounter && (
        <div
          className="absolute top-3 right-3 min-h-7 px-2.5 inline-flex items-center rounded-full bg-black/55 backdrop-blur-md border border-white/12 text-xs font-semibold text-white/90 tabular-nums z-30 pointer-events-none"
          aria-hidden="true"
        >
          {currentIndex + 1}/{media.length}
        </div>
      )}
      {media.length <= MAX_DOTS && (
        <div
          className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-2 py-1.5 rounded-full bg-black/35 backdrop-blur-sm z-30 pointer-events-none"
          aria-hidden="true"
        >
          {media.map((item, i) => (
            <span
              key={item.id}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === currentIndex ? 'w-4 bg-white' : 'w-1.5 bg-white/50'
              }`}
            />
          ))}
        </div>
      )}
    </section>
  );
}
