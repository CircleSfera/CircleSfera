import { MoreHorizontal } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import type { Post } from '../../types';
import UserAvatar from '../UserAvatar';
import type { VerificationLevel } from '../VerificationBadge';
import VerificationBadge from '../VerificationBadge';

interface PostHeaderProps {
  post: Post;
  menuButtonRef: React.RefObject<HTMLButtonElement | null>;
  onMenuToggle: () => void;
}

export default function PostHeader({
  post,
  menuButtonRef,
  onMenuToggle,
}: PostHeaderProps) {
  const { t } = useTranslation();
  return (
    <div className="p-3 flex items-center gap-3 border-b border-white/5">
      <Link to={`/${post.user.profile.username}`} className="relative">
        <div className="absolute -inset-0.5 bg-linear-to-tr from-purple-500 to-blue-500 rounded-full opacity-70 blur-sm"></div>
        <UserAvatar
          src={post.user.profile.avatar || undefined}
          thumbnailUrl={post.user.profile.thumbnailUrl}
          standardUrl={post.user.profile.standardUrl}
          alt={post.user.profile.username}
          className="relative w-8 h-8 rounded-full object-cover border border-white/20"
        />
      </Link>
      <Link
        to={`/${post.user.profile.username}`}
        className="flex-1 hover:opacity-80 transition-opacity"
      >
        <div className="font-bold text-sm bg-linear-to-r from-white to-white/70 bg-clip-text text-transparent flex items-center gap-1">
          {post.user.profile.fullName || post.user.profile.username}
          <VerificationBadge
            level={post.user.verificationLevel as VerificationLevel}
          />
        </div>
        <div className="flex items-center gap-2">
          <div className="text-[10px] tracking-wider font-medium text-gray-500">
            @{post.user.profile.username}
          </div>
          {post.isPromoted && (
            <>
              <span className="text-gray-600">·</span>
              <span className="text-[10px] font-black uppercase tracking-widest text-brand-primary">
                {t('post.header.promoted')}
              </span>
            </>
          )}
        </div>
      </Link>

      <button
        type="button"
        ref={menuButtonRef}
        onClick={onMenuToggle}
        className="p-1.5 rounded-full hover:bg-white/10 transition-colors"
      >
        <MoreHorizontal size={20} className="text-gray-400" />
      </button>
    </div>
  );
}
