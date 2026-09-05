import { Gift } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import type { Post } from '../../types';
import InteractionRail from '../content/InteractionRail';

interface PostActionsProps {
  post: Post;
  isBookmarked: boolean;
  onToggleBookmark: () => void;
  isBookmarkPending: boolean;
  onLikeToggle: (newLiked: boolean) => void;
  onShare: () => void;
  onTip: () => void;
  size?: 'default' | 'lg';
  hideCommentLink?: boolean;
}

export default function PostActions({
  post,
  isBookmarked,
  onToggleBookmark,
  isBookmarkPending: _isBookmarkPending,
  onLikeToggle,
  onShare,
  onTip,
  size = 'default',
  hideCommentLink = false,
}: PostActionsProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const isLg = size === 'lg';
  const tipHit = isLg ? 'w-12 h-12' : 'w-11 h-11';
  const tipIcon = isLg ? 'w-6 h-6' : 'w-5 h-5';

  return (
    <InteractionRail
      postId={post.id}
      variant="horizontal"
      isBookmarked={isBookmarked}
      onLikeToggle={onLikeToggle}
      onComment={() => navigate(`/p/${post.id}`)}
      onShare={onShare}
      onBookmark={onToggleBookmark}
      hideComment={hideCommentLink}
      size={size}
      shareIcon="send"
      extraActions={
        <button
          type="button"
          onClick={onTip}
          className={`${tipHit} inline-flex items-center justify-center text-yellow-500 hover:text-yellow-400 drop-shadow-[0_0_5px_rgba(234,179,8,0.5)]`}
          aria-label={t('post.actions.tip')}
        >
          <Gift className={tipIcon} />
        </button>
      }
    />
  );
}
