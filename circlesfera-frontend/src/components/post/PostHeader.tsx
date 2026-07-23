import { MoreHorizontal } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
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
}

export default function PostHeader({
  post,
  menuButtonRef,
  onMenuToggle,
  size = 'default',
}: PostHeaderProps) {
  const { t } = useTranslation();
  const isLg = size === 'lg';

  const handleProfileClick = () => {
    telemetry.track({
      eventType: 'PROFILE_CLICK',
      targetId: post.userId,
      targetType: 'USER',
    });
  };

  return (
    <div
      className={`${isLg ? 'p-3' : 'p-2'} flex items-center gap-2 border-b border-white/5`}
    >
      <Link
        to={`/${post.user.profile.username}`}
        className="relative"
        onClick={handleProfileClick}
      >
        <div className="absolute -inset-0.5 bg-linear-to-tr from-purple-500 to-blue-500 rounded-full opacity-70 blur-sm" />
        <UserAvatar
          src={post.user.profile.avatar || undefined}
          thumbnailUrl={post.user.profile.thumbnailUrl}
          standardUrl={post.user.profile.standardUrl}
          alt={post.user.profile.username}
          className={`relative ${isLg ? 'w-9 h-9' : 'w-7 h-7'} rounded-full object-cover border border-white/20`}
        />
      </Link>
      <Link
        to={`/${post.user.profile.username}`}
        className="flex-1 min-w-0 hover:opacity-80 transition-opacity"
        onClick={handleProfileClick}
      >
        <div
          className={`font-bold ${isLg ? 'text-sm' : 'text-sm'} bg-linear-to-r from-white to-white/70 bg-clip-text text-transparent flex items-center gap-1 truncate`}
        >
          {post.user.profile.fullName || post.user.profile.username}
          <VerificationBadge
            level={post.user.verificationLevel as VerificationLevel}
          />
        </div>
        <div className="flex items-center gap-2">
          <div className="text-xs tracking-wider font-medium text-gray-500 truncate">
            @{post.user.profile.username}
          </div>
          {post.isPromoted && (
            <>
              <span className="text-gray-600">·</span>
              <span className="text-xs font-black uppercase tracking-wide text-brand-primary">
                {t('post.header.promoted')}
              </span>
            </>
          )}
        </div>
      </Link>

      <Button
        ref={menuButtonRef}
        onClick={onMenuToggle}
        variant="ghost"
        size="icon"
        className="text-gray-300 hover:bg-white/10 rounded-full shrink-0"
      >
        <MoreHorizontal size={20} />
      </Button>
    </div>
  );
}
