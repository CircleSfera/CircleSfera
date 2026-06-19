import { Volume2, VolumeX } from 'lucide-react';
import { useRef, useState } from 'react';
import { parseFilter } from '../utils/styleUtils';

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
  aspectRatio?: string; // e.g. "aspect-square"
  objectFit?: 'cover' | 'contain';
  className?: string;
}

export default function Carousel({
  media,
  aspectRatio = 'aspect-4/5',
  objectFit = 'cover',
  className = '',
}: CarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isMuted, setIsMuted] = useState(true);
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([]);

  if (!media || media.length === 0) return null;

  const toggleMute = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsMuted(!isMuted);
  };

  const renderMediaItem = (item: MediaItem, index: number) => {
    const { className: filterClass, style: filterStyle } = parseFilter(
      item.filter,
    );

    if (item.type === 'video') {
      return (
        <div className="relative w-full h-full">
          <video
            ref={(el) => {
              videoRefs.current[index] = el;
            }}
            src={item.url}
            className={`w-full h-full object-${objectFit} ${filterClass}`}
            style={filterStyle}
            autoPlay
            muted={isMuted}
            loop
            playsInline
            disablePictureInPicture
            controlsList="nodownload nofullscreen noremoteplayback"
            onClick={toggleMute}
          />
          <button
            type="button"
            onClick={toggleMute}
            className="absolute bottom-4 right-4 p-2 bg-black/50 backdrop-blur-md rounded-full text-white z-20 hover:bg-black/70 transition-colors"
          >
            {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
          </button>
        </div>
      );
    }

    // Build srcSet for responsive images
    const srcSet = [
      item.thumbnailUrl ? `${item.thumbnailUrl} 300w` : '',
      item.standardUrl ? `${item.standardUrl} 800w` : '',
      `${item.url} 1200w`,
    ]
      .filter(Boolean)
      .join(', ');

    return (
      <img
        src={item.url}
        srcSet={srcSet || undefined}
        sizes="(max-width: 768px) 100vw, 800px"
        alt={item.altText || 'Post content'}
        className={`w-full h-full object-${objectFit} ${filterClass}`}
        style={filterStyle}
        loading="lazy"
        decoding="async"
      />
    );
  };

  if (media.length === 1) {
    return (
      <div
        className={`relative w-full overflow-hidden ${aspectRatio} bg-black ${className}`}
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
      className={`relative w-full overflow-hidden group ${aspectRatio} bg-black ${className}`}
      onKeyDown={handleKeyDown}
      aria-label="Media carousel"
    >
      {/* Media Slides */}
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

      {/* Navigation Arrows */}
      {currentIndex > 0 && (
        <button
          type="button"
          onClick={prevSlide}
          aria-label="Previous slide"
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
          aria-label="Next slide"
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

      {/* Dots */}
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
            aria-label={`Go to slide ${i + 1}`}
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

      {/* Counter Bubble */}
      <div
        className="absolute top-4 right-4 bg-black/60 backdrop-blur-sm text-white text-xs font-medium px-2.5 py-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity z-30"
        aria-hidden="true"
      >
        {currentIndex + 1}/{media.length}
      </div>
    </section>
  );
}
