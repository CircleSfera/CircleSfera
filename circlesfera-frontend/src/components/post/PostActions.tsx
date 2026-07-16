import { Bookmark, Gift, Send } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import type { Post } from '../../types';
import LikeButton from '../LikeButton';
import { Button, Tooltip } from '../ui';

interface PostActionsProps {
  post: Post;
  isBookmarked: boolean;
  onToggleBookmark: () => void;
  isBookmarkPending: boolean;
  onLikeToggle: (newLiked: boolean) => void;
  onShare: () => void;
  onTip: () => void;
}

export default function PostActions({
  post,
  isBookmarked,
  onToggleBookmark,
  isBookmarkPending,
  onLikeToggle,
  onShare,
  onTip,
}: PostActionsProps) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-between mb-2">
      <div className="flex items-center gap-3">
        <Tooltip
          content={t('post.actions.like', 'Like')}
          position="top"
          className="hidden md:block"
        >
          <LikeButton postId={post.id} onToggle={onLikeToggle} />
        </Tooltip>

        <Tooltip
          content={t('post.actions.comments')}
          position="top"
          className="hidden md:block"
        >
          <Link
            to={`/p/${post.id}`}
            className="hover:scale-110 active:scale-95 transition-all text-white/60 hover:text-white"
            aria-label={t('post.actions.comments')}
          >
            <svg
              aria-hidden="true"
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.8}
                d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
              />
            </svg>
          </Link>
        </Tooltip>

        <Tooltip
          content={t('post.actions.share')}
          position="top"
          className="hidden md:block"
        >
          <Button
            onClick={onShare}
            variant="ghost"
            size="icon"
            className="hover:scale-110 active:scale-95 text-white/60 hover:text-white bg-transparent border-none"
            aria-label={t('post.actions.share')}
          >
            <Send className="w-5 h-5" />
          </Button>
        </Tooltip>

        <Tooltip
          content={t('post.actions.tip')}
          position="top"
          className="hidden md:block"
        >
          <Button
            onClick={onTip}
            variant="ghost"
            size="icon"
            className="hover:scale-110 active:scale-95 text-yellow-500 hover:text-yellow-400 drop-shadow-[0_0_5px_rgba(234,179,8,0.5)] bg-transparent border-none"
            aria-label={t('post.actions.tip')}
          >
            <Gift className="w-5 h-5" />
          </Button>
        </Tooltip>
      </div>
      <Tooltip
        content={
          isBookmarked
            ? t('post.actions.remove_bookmark')
            : t('post.actions.add_bookmark')
        }
        position="top"
        className="hidden md:block"
      >
        <Button
          onClick={onToggleBookmark}
          isLoading={isBookmarkPending}
          variant="ghost"
          size="icon"
          className="hover:scale-110 active:scale-95 bg-transparent border-none"
          aria-label={
            isBookmarked
              ? t('post.actions.remove_bookmark')
              : t('post.actions.add_bookmark')
          }
        >
          <Bookmark
            size={20}
            className={`transition-all ${isBookmarked ? 'text-white fill-white drop-shadow-[0_0_8px_rgba(255,255,255,0.3)]' : 'text-white/60 hover:text-white'}`}
          />
        </Button>
      </Tooltip>
    </div>
  );
}
