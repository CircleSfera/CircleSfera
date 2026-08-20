import type { HTMLAttributes } from 'react';

export type GuestSurface =
  | 'home'
  | 'explore'
  | 'feed'
  | 'frames'
  | 'direct'
  | 'live'
  | 'creator';

export function chapterToSurface(chapter: string): GuestSurface {
  if (
    ['home', 'explore', 'feed', 'frames', 'direct', 'live', 'creator'].includes(
      chapter,
    )
  ) {
    return chapter as GuestSurface;
  }
  return 'home';
}

export interface GuestSurfaceMediaProps extends HTMLAttributes<HTMLDivElement> {
  surface: GuestSurface;
  compact?: boolean;
}

export function GuestSurfaceMedia({
  surface,
  compact,
  className = '',
  ...props
}: GuestSurfaceMediaProps) {
  return (
    <div
      className={`relative w-full rounded-4xl border border-white/10 bg-black/40 overflow-hidden shadow-2xl backdrop-blur-xl flex flex-col items-center justify-center p-8 sm:p-10 transform transition-transform hover:scale-[1.02] duration-500 ${
        compact ? 'aspect-square' : 'aspect-4/5 sm:aspect-auto sm:min-h-100'
      } ${className}`}
      {...props}
    >
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(var(--brand-primary-rgb),0.15),transparent_70%)]" />
      <div className="absolute inset-0 bg-linear-to-b from-transparent via-black/20 to-black/80" />

      <div
        className={`relative z-10 flex flex-col items-center h-full text-center w-full ${
          compact ? 'justify-center my-auto' : 'justify-end mt-auto'
        }`}
      >
        <div className="mb-6 w-20 h-20 sm:w-24 sm:h-24 rounded-[1.25rem] bg-linear-to-br from-brand-secondary via-brand-primary to-brand-blue p-0.5 shadow-xl shadow-brand-primary/20 animate-pulse-slow">
          <div className="w-full h-full rounded-[1.15rem] bg-black/80 backdrop-blur-md flex items-center justify-center">
            <svg
              className="w-10 h-10 sm:w-12 sm:h-12 text-white/90"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <title>Immersive Visuals Icon</title>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M14 10l-2 1m0 0l-2-1m2 1v2.5M20 7l-2 1m2-1l-2-1m2 1v2.5M14 4l-2-1-2 1M4 7l2-1M4 7l2 1M4 7v2.5M12 21l-2-1m2 1l2-1m-2 1v-2.5M6 18l-2-1v-2.5M18 18l2-1v-2.5"
              />
            </svg>
          </div>
        </div>

        <h3 className="text-2xl sm:text-3xl font-black text-white mb-3 tracking-tight">
          Immersive Visuals
        </h3>

        {!compact && (
          <p className="text-sm sm:text-base text-white/60 max-w-70 leading-relaxed">
            Experience a social interaction layer that prioritizes content
            depth.
          </p>
        )}
      </div>
    </div>
  );
}
