import { motion } from 'framer-motion';
import { Bookmark, Gift, MessageCircle, Send } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import type { Post } from '../../types';
import LikeButton from '../LikeButton';
import { Button } from '../ui';

const MotionButton = motion.create(Button);
const MotionLink = motion.create(Link as any) as any;

interface PostActionsProps {
  post: Post;
  isBookmarked: boolean;
  onToggleBookmark: () => void;
  isBookmarkPending: boolean;
  onLikeToggle: (newLiked: boolean) => void;
  onShare: () => void;
  onTip: () => void;
  /** Larger touch targets and icons for detail view */
  size?: 'default' | 'lg';
  /** Hide comment link when already on the detail page */
  hideCommentLink?: boolean;
}

export default function PostActions({
  post,
  isBookmarked,
  onToggleBookmark,
  isBookmarkPending,
  onLikeToggle,
  onShare,
  onTip,
  size = 'default',
  hideCommentLink = false,
}: PostActionsProps) {
  const { t } = useTranslation();
  const isLg = size === 'lg';
  const iconClass = isLg ? 'w-6 h-6' : 'w-5 h-5';
  const btnClass = isLg
    ? 'w-12 h-12 hover:scale-110 active:scale-95'
    : 'w-11 h-11 hover:scale-110 active:scale-95';

  return (
    <div
      className={`flex items-center justify-between ${isLg ? 'mb-1' : 'mb-1 md:mb-2'}`}
    >
      <div className={`flex items-center ${isLg ? 'gap-1' : 'gap-2 md:gap-3'}`}>
        <LikeButton
          postId={post.id}
          onToggle={onLikeToggle}
          iconClassName={iconClass}
          className={isLg ? 'w-12 h-12' : 'w-11 h-11'}
        />
        {!hideCommentLink && (
          <MotionLink
            to={`/p/${post.id}`}
            className={`${btnClass} inline-flex items-center justify-center text-white/60 hover:text-white transition-all`}
            aria-label={t('post.actions.comments')}
            whileTap={{ scale: 0.85 }}
            transition={{ type: 'spring', stiffness: 400, damping: 17 }}
          >
            <MessageCircle className={iconClass} strokeWidth={1.8} />
          </MotionLink>
        )}
        {hideCommentLink && (
          <span
            className={`${btnClass} inline-flex items-center justify-center text-white/60`}
            aria-hidden="true"
          >
            <MessageCircle className={iconClass} strokeWidth={1.8} />
          </span>
        )}
        <MotionButton
          onClick={onShare}
          variant="ghost"
          size="icon"
          className={`${btnClass} text-white/60 hover:text-white bg-transparent border-none`}
          aria-label={t('post.actions.share')}
          whileTap={{ scale: 0.85, rotate: -10 }}
          transition={{ type: 'spring', stiffness: 400, damping: 17 }}
        >
          <Send className={iconClass} />
        </MotionButton>
        <MotionButton
          onClick={onTip}
          variant="ghost"
          size="icon"
          className={`${btnClass} text-yellow-500 hover:text-yellow-400 drop-shadow-[0_0_5px_rgba(234,179,8,0.5)] bg-transparent border-none`}
          aria-label={t('post.actions.tip')}
          whileTap={{ scale: 0.85, y: -2 }}
          transition={{ type: 'spring', stiffness: 400, damping: 17 }}
        >
          <Gift className={iconClass} />
        </MotionButton>
      </div>
      <MotionButton
        onClick={onToggleBookmark}
        isLoading={isBookmarkPending}
        variant="ghost"
        size="icon"
        className={`${btnClass} bg-transparent border-none`}
        aria-label={
          isBookmarked
            ? t('post.actions.remove_bookmark')
            : t('post.actions.add_bookmark')
        }
        whileTap={{ scale: 0.85, y: -2 }}
        transition={{ type: 'spring', stiffness: 400, damping: 17 }}
      >
        <Bookmark
          size={isLg ? 24 : 20}
          className={`transition-all ${isBookmarked ? 'text-white fill-white drop-shadow-[0_0_8px_rgba(255,255,255,0.3)]' : 'text-white/60 hover:text-white'}`}
        />
      </MotionButton>
    </div>
  );
}
