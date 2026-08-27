import { ArrowLeft, Globe, Lock, MoreHorizontal, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import type { Post } from '../../types';
import { telemetry } from '../../utils/telemetry.js';
import UserAvatar from '../UserAvatar';
import { Button } from '../ui';
import type { VerificationLevel } from '../VerificationBadge';
import VerificationBadge from '../VerificationBadge';

interface PostHeaderProps {
  post: Post;
  menuButtonRef: React.RefObject<HTMLButtonElement | null>;
  onMenuToggle: () => void;
  /** Slightly larger avatar and padding for detail view */
  size?: 'default' | 'lg';
  /** Show back arrow button directly in header */
  showBack?: boolean;
}

/**
 * PostHeader — Layout Guidelines §17.6
 * Contains: Avatar, Display Name, Username, Verification, Timestamp, More Menu
 * Compact height — never dominates the post
 * Avatar: 40px (md) standard, 44px detail
 */

/** Lightweight relative time — no date-fns dependency required */
function relativeTime(dateStr: string): string {
  try {
    const diff = Date.now() - new Date(dateStr).getTime();
    const secs = Math.floor(diff / 1000);
    if (secs < 60) return `${secs}s`;
    const mins = Math.floor(secs / 60);
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days}d`;
    const weeks = Math.floor(days / 7);
    if (weeks < 4) return `${weeks}sem`;
    const months = Math.floor(days / 30);
    if (months < 12) return `${months}mes`;
    return `${Math.floor(months / 12)}a`;
  } catch {
    return '';
  }
}

/** Visibility indicator — uses Post['visibility'] if defined in shared types */
const VisibilityIcon = ({ post }: { post: Post }) => {
  // visibility may be on the base Post from shared; access safely
  const v = (post as any).visibility as string | undefined;
  if (!v || v === 'PUBLIC')
    return <Globe size={11} className="text-gray-400" aria-hidden="true" />;
  if (v === 'FOLLOWERS')
    return <Users size={11} className="text-gray-400" aria-hidden="true" />;
  if (v === 'PRIVATE')
    return <Lock size={11} className="text-gray-400" aria-hidden="true" />;
  return null;
};

export default function PostHeader({
  post,
  menuButtonRef,
  onMenuToggle,
  size = 'default',
  showBack = false,
}: PostHeaderProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const isLg = size === 'lg';

  const handleProfileClick = () => {
    telemetry.track({
      eventType: 'PROFILE_CLICK',
      targetId: post.profileId,
      targetType: 'USER',
    });
  };

  const timeAgo = relativeTime(post.createdAt as string);

  return (
    <div
      className={`${isLg ? 'px-3 py-2 md:py-2.5' : 'px-2.5 py-1.5 md:px-3 md:py-2'} flex items-center gap-2 md:gap-2.5`}
      style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}
    >
      {showBack && (
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="p-1.5 -ml-1 text-white/70 hover:text-white hover:bg-white/10 rounded-full transition-all shrink-0 active:scale-95 cursor-pointer"
          aria-label={t('common.back', 'Volver')}
        >
          <ArrowLeft size={20} />
        </button>
      )}
      {/* Avatar with story ring glow */}
      <Link
        to={`/${post.profile.username}`}
        className="relative shrink-0"
        onClick={handleProfileClick}
        aria-label={`Ver perfil de ${post.profile.username}`}
      >
        <div
          className="absolute -inset-0.5 rounded-full opacity-55"
          style={{
            background: 'linear-gradient(135deg, #ff5757, #8c52ff)',
            filter: 'blur(1.5px)',
          }}
        />
        <UserAvatar
          src={post.profile.avatar || undefined}
          thumbnailUrl={post.profile.thumbnailUrl}
          standardUrl={post.profile.standardUrl}
          alt={post.profile.username || ''}
          className={`relative ${isLg ? 'w-10 h-10 md:w-11 md:h-11' : 'w-9 h-9 md:w-10 md:h-10'} rounded-full object-cover`}
        />
      </Link>

      {/* Author info */}
      <Link
        to={`/${post.profile.username}`}
        className="flex-1 min-w-0 hover:opacity-80 transition-opacity"
        onClick={handleProfileClick}
      >
        {/* Display name + verification */}
        <div className="flex items-center gap-1 truncate">
          <span className="text-sm font-bold text-white truncate leading-tight">
            {post.profile.fullName || post.profile.username}
          </span>
          <VerificationBadge
            level={post.profile.user?.verificationLevel as VerificationLevel}
          />
          {post.isPromoted && (
            <>
              <span className="text-gray-700 text-xs">·</span>
              <span
                className="text-brand-primary font-black uppercase shrink-0"
                style={{
                  fontSize: 'var(--text-badge, 11px)',
                  letterSpacing: '0.06em',
                }}
              >
                {t('post.header.promoted')}
              </span>
            </>
          )}
        </div>

        {/* Username + timestamp + visibility */}
        <div className="flex items-center gap-1 mt-0.5">
          <span
            className="font-medium text-gray-500 truncate leading-tight"
            style={{ fontSize: 'var(--text-badge, 11px)' }}
          >
            @{post.profile.username}
          </span>
          {timeAgo && (
            <>
              <span className="text-gray-700" style={{ fontSize: 9 }}>
                ·
              </span>
              <span
                className="text-gray-600 shrink-0"
                style={{ fontSize: 'var(--text-badge, 11px)' }}
              >
                {timeAgo}
              </span>
            </>
          )}
          <VisibilityIcon post={post} />
        </div>
      </Link>

      {/* More menu — 44x44 for mobile density accessibility */}
      <Button
        ref={menuButtonRef}
        onClick={onMenuToggle}
        variant="ghost"
        size="icon"
        className="text-gray-400 hover:text-white hover:bg-white/8 rounded-full shrink-0 w-11 h-11"
        aria-label={t('post.header.more_options', 'Más opciones')}
      >
        <MoreHorizontal size={18} />
      </Button>
    </div>
  );
}
