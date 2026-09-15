import type { RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import type { Post } from '../../types';
import InteractionRail from '../content/InteractionRail';
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

  return (
    <div className="absolute bottom-4 md:bottom-3 right-2 pb-safe z-20">
      <InteractionRail
        postId={post.id}
        variant="vertical"
        likesCount={likesCount}
        commentsCount={post._count?.comments || 0}
        isBookmarked={isBookmarked}
        onLikeToggle={onLikeToggle}
        onComment={onCommentsOpen}
        onShare={onShareOpen}
        onBookmark={onBookmarkOpen}
        onMenu={onMenuToggle}
        menuButtonRef={menuButtonRef}
        shareIcon="share"
        showCounts
        footer={
          <div className="mt-0.5 w-7 h-7 rounded-full bg-surface-raised border-2 border-surface-high overflow-hidden flex items-center justify-center shadow-[0_0_12px_rgba(0,0,0,0.5)] shrink-0 motion-reduce:animate-none animate-[spin_4s_linear_infinite]">
            <UserAvatar
              src={post.profile.avatar}
              alt={t('frames.audio_disc')}
              size="sm"
              className="w-full h-full"
            />
          </div>
        }
      />
    </div>
  );
}
