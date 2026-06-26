import { memo, useState } from 'react';
import { getBlurFallbackUrl, sanitizeUrl } from '../utils/apiUtils';
import VerificationBadge, { type VerificationLevel } from './VerificationBadge';

interface UserAvatarProps {
  src?: string | null;
  thumbnailUrl?: string | null;
  standardUrl?: string | null;
  alt: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'full';
  className?: string;
  onClick?: () => void;
  hasStory?: boolean;
  isOnline?: boolean;
  verificationLevel?: VerificationLevel;
}

const sizeClasses: Record<NonNullable<UserAvatarProps['size']>, string> = {
  xs: 'w-6 h-6',
  sm: 'w-8 h-8',
  md: 'w-9 h-9',
  lg: 'w-12 h-12',
  xl: 'w-16 h-16',
  full: 'w-full h-full',
};

const statusSizeClasses: Record<
  NonNullable<UserAvatarProps['size']>,
  string
> = {
  xs: 'w-2 h-2',
  sm: 'w-2.5 h-2.5',
  md: 'w-3 h-3',
  lg: 'w-3.5 h-3.5',
  xl: 'w-4 h-4',
  full: 'w-4 h-4',
};

export default memo(function UserAvatar({
  src,
  thumbnailUrl,
  standardUrl,
  alt,
  size = 'md',
  className = '',
  onClick,
  hasStory = false,
  isOnline,
  verificationLevel,
}: UserAvatarProps) {
  const [isLoaded, setIsLoaded] = useState(false);

  const defaultAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(alt)}&background=random&color=fff&bold=true`;
  const sanitizedSrc = sanitizeUrl(src);
  const blurUrl =
    getBlurFallbackUrl(sanitizedSrc) || getBlurFallbackUrl(thumbnailUrl);

  const innerContent = (
    <>
      {/* Animated Story Ring */}
      {hasStory && (
        <div className="absolute -inset-1 rounded-full p-[2px] bg-linear-to-tr from-brand-primary via-brand-secondary to-brand-accent animate-spin-slow opacity-90 group-hover:opacity-100 transition-opacity">
          <div className="absolute inset-0 bg-black rounded-full" />
        </div>
      )}
      <div
        className={`relative w-full h-full rounded-full overflow-hidden bg-zinc-900 border-2 ${hasStory ? 'border-black' : 'border-white/5'} shadow-inner`}
      >
        {/* Blurhash / Fallback Image */}
        {!isLoaded && blurUrl && (
          <img
            src={blurUrl}
            alt="loading"
            className="absolute inset-0 w-full h-full object-cover scale-110 blur-sm"
          />
        )}

        {/* Shimmer Skeleton (If no Blurhash available) */}
        {!isLoaded && !blurUrl && (
          <div className="absolute inset-0 w-full h-full bg-zinc-800 animate-pulse" />
        )}

        {/* Main Image */}
        <img
          src={sanitizedSrc || defaultAvatar}
          srcSet={
            thumbnailUrl && standardUrl
              ? `${thumbnailUrl} 150w, ${standardUrl} 300w, ${sanitizedSrc} 600w`
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
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${isLoaded ? 'opacity-100' : 'opacity-0'}`}
          loading="lazy"
          decoding="async"
          onLoad={() => setIsLoaded(true)}
          onError={(e) => {
            (e.target as HTMLImageElement).src = defaultAvatar;
            (e.target as HTMLImageElement).srcset = '';
          }}
        />
      </div>

      {verificationLevel && verificationLevel !== 'BASIC' && (
        <div
          className={`absolute top-0 right-0 ${statusSizeClasses[size]} rounded-full flex items-center justify-center drop-shadow-sm`}
        >
          <VerificationBadge
            level={verificationLevel}
            size={size === 'xs' || size === 'sm' ? 10 : 14}
          />
        </div>
      )}

      {isOnline === true && (
        <span
          className={`
            absolute bottom-0 right-0
            ${statusSizeClasses[size]}
            bg-green-500
            border-2 border-surface-raised rounded-full
            z-10
          `}
        />
      )}
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={`Ver perfil de ${alt}`}
        className={`relative block ${sizeClasses[size]} rounded-full cursor-pointer hover:scale-105 transition-transform duration-300 group p-0 border-none bg-transparent ${className}`}
      >
        {innerContent}
      </button>
    );
  }

  return (
    <div
      className={`relative block ${sizeClasses[size]} rounded-full ${className}`}
    >
      {innerContent}
    </div>
  );
});
