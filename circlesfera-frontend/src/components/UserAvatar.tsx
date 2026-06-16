import { memo } from 'react';
import { sanitizeUrl } from '../utils/apiUtils';

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
  isVerified?: boolean;
}

const sizeClasses: Record<NonNullable<UserAvatarProps['size']>, string> = {
  xs: 'w-6 h-6',
  sm: 'w-8 h-8',
  md: 'w-10 h-10',
  lg: 'w-14 h-14',
  xl: 'w-20 h-20',
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
  isVerified,
}: UserAvatarProps) {
  const defaultAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(alt)}&background=random&color=fff&bold=true`;
  const sanitizedSrc = sanitizeUrl(src);

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
          className="w-full h-full object-cover"
          loading="lazy"
          decoding="async"
          onError={(e) => {
            (e.target as HTMLImageElement).src = defaultAvatar;
            (e.target as HTMLImageElement).srcset = '';
          }}
        />
      </div>

      {isVerified && (
        <div
          className={`
            absolute top-0 right-0
            ${statusSizeClasses[size]}
            flex items-center justify-center
            bg-linear-to-tr from-purple-500 to-pink-500
            border border-white/20 rounded-full shadow-lg
            z-10
          `}
          title="Verified Creator"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="4"
            className="w-[70%] h-[70%] text-white"
          >
            <path
              d="M5 13l4 4L19 7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      )}

      {isOnline === true && (
        <span
          className={`
            absolute bottom-0 right-0
            ${statusSizeClasses[size]}
            bg-green-500
            border-2 border-[#1c1c1c] rounded-full
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
