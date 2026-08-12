import type React from 'react';
import { memo, useState } from 'react';
import { getBlurFallbackUrl, sanitizeUrl } from '../utils/apiUtils';
import VerificationBadge, { type VerificationLevel } from './VerificationBadge';

interface UserAvatarProps {
  src?: string | null;
  thumbnailUrl?: string | null;
  standardUrl?: string | null;
  alt: string;
  /** xs=24 sm=32 md=40 lg=56 xl=80 profile=96 full=100% — tokens --avatar-* */
  size?: 'xs' | 'sm' | 'compact' | 'md' | 'lg' | 'xl' | 'full' | 'profile';
  className?: string;
  style?: React.CSSProperties;
  onClick?: () => void;
  hasStory?: boolean;
  isOnline?: boolean;
  verificationLevel?: VerificationLevel;
}

const sizeClasses: Record<NonNullable<UserAvatarProps['size']>, string> = {
  xs: 'w-6 h-6' /* 24px */,
  sm: 'w-8 h-8' /* 32px */,
  compact: 'w-8 h-8' /* 32px — alias for sm */,
  md: 'w-10 h-10' /* 40px */,
  lg: 'w-14 h-14' /* 56px — --avatar-lg */,
  xl: 'w-20 h-20' /* 80px */,
  profile: 'w-24 h-24' /* 96px — --avatar-profile */,
  full: 'w-full h-full',
};

const statusSizeClasses: Record<
  NonNullable<UserAvatarProps['size']>,
  string
> = {
  xs: 'w-2 h-2',
  sm: 'w-2.5 h-2.5',
  compact: 'w-2.5 h-2.5',
  md: 'w-3 h-3',
  lg: 'w-3.5 h-3.5',
  xl: 'w-4 h-4',
  profile: 'w-5 h-5',
  full: 'w-4 h-4',
};

export default memo(function UserAvatar({
  src,
  thumbnailUrl,
  standardUrl,
  alt,
  size = 'md',
  className = '',
  style,
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
      {/* Animated Story Ring — dual-layer for cinematic depth */}
      {hasStory && (
        <>
          {/* Outer glow ring (static) */}
          <div
            className="absolute rounded-full pointer-events-none"
            style={{
              inset: '-3px',
              background:
                'linear-gradient(135deg, rgba(var(--brand-primary-rgb),0.4) 0%, rgba(253,29,29,0.35) 50%, rgba(252,176,69,0.3) 100%)',
              filter: 'blur(4px)',
              borderRadius: '9999px',
            }}
          />
          {/* Animated gradient ring */}
          <div
            className="absolute rounded-full animate-spin-slow"
            style={{
              inset: '-2px',
              background: 'linear-gradient(90deg, #ff5757 0%, #8c52ff 100%)',
              borderRadius: '9999px',
              padding: '2px',
            }}
          >
            {/* Inner mask to create ring shape */}
            <div
              className="absolute inset-0.5 bg-black rounded-full"
              style={{ borderRadius: '9999px' }}
            />
          </div>
        </>
      )}

      {/* Avatar image container */}
      <div
        className={`relative w-full h-full rounded-full overflow-hidden bg-zinc-900 shadow-inner ${
          hasStory ? 'border-2 border-black' : 'border border-white/8'
        }`}
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
          <div
            className="absolute inset-0 w-full h-full"
            style={{
              background:
                'linear-gradient(135deg, rgba(var(--brand-primary-rgb),0.15) 0%, rgba(64,93,230,0.1) 100%)',
              animation: 'pulse-slow 2s ease-in-out infinite',
            }}
          />
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

      {/* Verification Badge */}
      {verificationLevel && verificationLevel !== 'BASIC' && (
        <div
          className={`absolute top-0 right-0 ${statusSizeClasses[size]} rounded-full flex items-center justify-center drop-shadow-sm z-10`}
        >
          <VerificationBadge
            level={verificationLevel}
            size={size === 'xs' || size === 'sm' ? 10 : 14}
          />
        </div>
      )}

      {/* Online Indicator */}
      {isOnline === true && (
        <span
          className={`
            absolute bottom-0 right-0
            ${statusSizeClasses[size]}
            border-2 border-surface-raised rounded-full
            z-10
          `}
          style={{
            background: 'radial-gradient(circle, #4ade80 0%, #22c55e 100%)',
            boxShadow: '0 0 6px rgba(74,222,128,0.6)',
            animation: 'pulse-slow 2s ease-in-out infinite',
          }}
        />
      )}
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        style={style}
        aria-label={`Ver perfil de ${alt}`}
        className={`relative block ${sizeClasses[size]} rounded-full cursor-pointer hover:scale-105 transition-transform duration-300 group p-0 border-none bg-transparent ${className}`}
      >
        {innerContent}
      </button>
    );
  }

  return (
    <div
      style={style}
      className={`relative block ${sizeClasses[size]} rounded-full ${className}`}
    >
      {innerContent}
    </div>
  );
});
