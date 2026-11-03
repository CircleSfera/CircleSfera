import type { ReactNode } from 'react';

/** The shape of a thumbnail: of a post, of an upright video, or square. */
export type ThumbShape = 'POST' | 'FRAME' | 'STORY' | 'LIVE' | 'SQUARE';

/**
 * A thumbnail of a piece of content, one size and shape everywhere: 56 px
 * high, at least 44 px wide, in the shape of what it shows, with 12 px
 * corners. The border's colour is the caller's (a chosen one stands out).
 */
export const MEDIA_THUMB =
  'h-14 w-auto min-w-11 shrink-0 rounded-md overflow-hidden border-2';

/** The width to height of a thumbnail of the given shape. */
export function thumbRatio(shape: ThumbShape): string {
  if (shape === 'POST') return '4 / 5';
  if (shape === 'SQUARE') return '1 / 1';
  return '9 / 16';
}

/** The shape of the thumbnail of a post of the given type. */
export function postThumbShape(type?: string | null): ThumbShape {
  return type === 'FRAME' ? 'FRAME' : 'POST';
}

export interface MediaThumbProps {
  src?: string | null;
  /** A video shows its first frame. */
  video?: boolean;
  shape?: ThumbShape;
  /** What shows when there is no picture: an icon. */
  fallback?: ReactNode;
  alt?: string;
  className?: string;
}

/** A thumbnail of a piece of content, as in every list of the app. */
export default function MediaThumb({
  src,
  video = false,
  shape = 'POST',
  fallback,
  alt = '',
  className = 'border-white/10',
}: MediaThumbProps) {
  return (
    <span
      className={`${MEDIA_THUMB} flex items-center justify-center bg-surface-raised text-white/50 ${className}`}
      style={{ aspectRatio: thumbRatio(shape) }}
    >
      {src ? (
        video ? (
          <video
            src={src}
            muted
            playsInline
            preload="metadata"
            className="h-full w-full object-cover"
          />
        ) : (
          <img
            src={src}
            alt={alt}
            loading="lazy"
            className="h-full w-full object-cover"
          />
        )
      ) : (
        fallback
      )}
    </span>
  );
}
