import { clsx } from 'clsx';
import type { HTMLAttributes } from 'react';
import { useTranslation } from 'react-i18next';

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

export interface GuestSurfaceMediaProps extends HTMLAttributes<HTMLElement> {
  surface: GuestSurface;
  compact?: boolean;
}

export function GuestSurfaceMedia({
  surface,
  compact,
  className = '',
  ...props
}: GuestSurfaceMediaProps) {
  const { t } = useTranslation();
  const label = t(`landing.preview.${surface}`);

  return (
    <figure
      aria-label={label}
      className={clsx(
        'relative w-full rounded-4xl border border-white/10 bg-black/40 overflow-hidden shadow-2xl backdrop-blur-xl flex flex-col items-center justify-center p-8 sm:p-10',
        compact ? 'aspect-square' : 'aspect-4/5 sm:aspect-auto sm:min-h-100',
        className,
      )}
      {...props}
    >
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(var(--brand-primary-rgb),0.15),transparent_70%)]" />
      <div className="absolute inset-0 bg-linear-to-b from-transparent via-black/20 to-black/80" />
      <figcaption className="relative z-10 flex flex-col items-center text-center">
        <p className="text-xs font-bold uppercase tracking-widest text-white/50 mb-3">
          {label}
        </p>
        <h3 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
          {label}
        </h3>
      </figcaption>
    </figure>
  );
}
