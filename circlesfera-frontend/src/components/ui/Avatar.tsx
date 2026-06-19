import React, { forwardRef } from 'react';

export interface AvatarProps
  extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src'> {
  src?: string | null;
  thumbnailUrl?: string | null;
  standardUrl?: string | null;
  alt: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'full';
  fallback?: React.ReactNode;
}

const sizeClasses: Record<NonNullable<AvatarProps['size']>, string> = {
  xs: 'w-6 h-6',
  sm: 'w-8 h-8',
  md: 'w-9 h-9',
  lg: 'w-12 h-12',
  xl: 'w-16 h-16',
  full: 'w-full h-full',
};

export const Avatar = forwardRef<HTMLDivElement, AvatarProps>(
  (
    {
      className = '',
      src,
      thumbnailUrl,
      standardUrl,
      alt,
      size = 'md',
      fallback,
      ...props
    },
    ref,
  ) => {
    const defaultAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(alt)}&background=random&color=fff&bold=true`;

    return (
      <div
        ref={ref}
        className={`relative inline-block rounded-full overflow-hidden bg-zinc-900 border-2 border-white/5 shadow-inner shrink-0 ${sizeClasses[size]} ${className}`}
      >
        <img
          src={src || defaultAvatar}
          srcSet={
            thumbnailUrl && standardUrl && src
              ? `${thumbnailUrl} 150w, ${standardUrl} 300w, ${src} 600w`
              : undefined
          }
          sizes={
            size === 'xs' || size === 'sm'
              ? '32px'
              : size === 'full'
                ? '128px'
                : '64px'
          }
          alt={alt}
          className="w-full h-full object-cover"
          loading="lazy"
          decoding="async"
          onError={(e) => {
            (e.target as HTMLImageElement).src = defaultAvatar;
            (e.target as HTMLImageElement).srcset = '';
          }}
          {...props}
        />
        {!src && fallback && (
          <div className="absolute inset-0 flex items-center justify-center bg-zinc-800 text-white font-bold">
            {fallback}
          </div>
        )}
      </div>
    );
  },
);

Avatar.displayName = 'Avatar';
