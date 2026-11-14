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
  size = 'default',
  hideCommentLink = false,
}: PostActionsProps) {
  const navigate = useNavigate();

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
    />
  );
}
