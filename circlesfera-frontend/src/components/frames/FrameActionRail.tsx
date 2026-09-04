import { Bookmark, MessageCircle, MoreHorizontal, Share2 } from 'lucide-react';
import type { RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import type { Post } from '../../types';
import LikeButton from '../LikeButton';
import UserAvatar from '../UserAvatar';

interface FrameActionRailProps {
  post: Post;
  likesCount: number;
  isBookmarked: boolean;
  onLikeToggle: (liked: boolean) => void;
  onCommentsOpen: () => void;
  onShareOpen: () => void;
  onBookmarkOpen: () => void;
  onMenuToggle: () => void;
  menuButtonRef: RefObject<HTMLButtonElement | null>;
}

export default function FrameActionRail({
  post,
  likesCount,
  isBookmarked,
  onLikeToggle,
  onCommentsOpen,
  onShareOpen,
  onBookmarkOpen,
  onMenuToggle,
  menuButtonRef,
}: FrameActionRailProps) {
  const { t } = useTranslation();

  const iconShadow =
    'drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)] transition-transform hover:scale-110 active:scale-90';

  return (
    <div className="absolute bottom-4 md:bottom-3 right-2 flex flex-col items-center gap-0.5 z-20 pointer-events-auto">
      <div className="flex flex-col items-center gap-0.5">
        <LikeButton
          postId={post.id}
          iconClassName={`w-6 h-6 ${iconShadow}`}
          onToggle={onLikeToggle}
        />
        <span className="text-white font-semibold text-[10px] drop-shadow-md leading-none">
          {likesCount}
        </span>
      </div>

      <button
        type="button"
        onClick={onCommentsOpen}
        aria-label={t('frames.comments', 'View comments')}
        className="flex flex-col items-center justify-center min-w-11 min-h-11 gap-0.5"
      >
        <MessageCircle
          size={24}
          className={`text-white fill-white/20 ${iconShadow}`}
        />
        <span className="text-white font-semibold text-[10px] drop-shadow-md leading-none">
          {post._count?.comments || 0}
        </span>
      </button>

      <button
        type="button"
        onClick={onShareOpen}
        aria-label={t('frames.share', 'Share frame')}
        className="flex flex-col items-center justify-center min-w-11 min-h-11"
      >
        <Share2 size={24} className={`text-white ${iconShadow}`} />
      </button>

      <button
        type="button"
        onClick={onBookmarkOpen}
        aria-label={
          isBookmarked
            ? t('post.actions.remove_bookmark', 'Remove from saved')
            : t('post.actions.add_bookmark', 'Save frame')
        }
        className="flex flex-col items-center justify-center min-w-11 min-h-11"
      >
        <Bookmark
          size={24}
          className={`${isBookmarked ? 'text-brand-primary fill-brand-primary' : 'text-white'} ${iconShadow}`}
        />
      </button>

      <button
        type="button"
        ref={menuButtonRef}
        onClick={onMenuToggle}
        aria-label={t('post.header.more_options', 'More options')}
        className="flex flex-col items-center justify-center min-w-11 min-h-11"
      >
        <MoreHorizontal size={24} className={`text-white ${iconShadow}`} />
      </button>

      <div className="mt-0.5 w-7 h-7 rounded-full bg-surface-raised border-2 border-surface-high overflow-hidden flex items-center justify-center shadow-[0_0_12px_rgba(0,0,0,0.5)] shrink-0 motion-reduce:animate-none animate-[spin_4s_linear_infinite]">
        <UserAvatar
          src={post.profile.avatar}
          alt={t('frames.audio_disc', 'Audio disc')}
          size="sm"
          className="w-full h-full"
        />
      </div>
    </div>
  );
}
