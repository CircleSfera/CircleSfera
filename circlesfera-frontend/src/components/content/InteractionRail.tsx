import {
  Bookmark,
  MessageCircle,
  MoreHorizontal,
  Send,
  Share2,
} from 'lucide-react';
import type { ReactNode, RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import LikeButton from '../LikeButton';

export type InteractionRailVariant = 'horizontal' | 'vertical';

export interface InteractionRailProps {
  postId: string;
  variant?: InteractionRailVariant;
  likesCount?: number;
  commentsCount?: number;
  isBookmarked: boolean;
  onLikeToggle: (liked: boolean) => void;
  onComment: () => void;
  onShare: () => void;
  onBookmark: () => void;
  // Inserted after share (for example tip on posts)
  extraActions?: ReactNode;
  // Overflow menu for frames
  onMenu?: () => void;
  menuButtonRef?: RefObject<HTMLButtonElement | null>;
  hideComment?: boolean;
  size?: 'default' | 'lg';
  className?: string;
  shareIcon?: 'send' | 'share';
  showCounts?: boolean;
  footer?: ReactNode;
}

// Shared like, comment, share, and save controls for posts (horizontal) and frames (vertical)
export default function InteractionRail({
  postId,
  variant = 'horizontal',
  likesCount,
  commentsCount,
  isBookmarked,
  onLikeToggle,
  onComment,
  onShare,
  onBookmark,
  extraActions,
  onMenu,
  menuButtonRef,
  hideComment = false,
  size = 'default',
  className = '',
  shareIcon = 'send',
  showCounts = false,
  footer,
}: InteractionRailProps) {
  const { t } = useTranslation();
  const isVertical = variant === 'vertical';
  const isLg = size === 'lg';
  const iconSize = isVertical ? 24 : isLg ? 24 : 20;
  const iconClass = isLg || isVertical ? 'w-6 h-6' : 'w-5 h-5';
  const hitClass = isVertical
    ? 'flex flex-col items-center justify-center min-w-11 min-h-11 gap-0.5'
    : isLg
      ? 'w-12 h-12 inline-flex items-center justify-center'
      : 'w-11 h-11 inline-flex items-center justify-center';

  const iconShadow = isVertical
    ? 'drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)] transition-transform hover:scale-110 active:scale-90'
    : '';

  const ShareIcon = shareIcon === 'share' ? Share2 : Send;
  const countClass = isVertical
    ? 'text-white font-semibold text-[10px] drop-shadow-md leading-none'
    : 'sr-only';

  const likeCommentShare = (
    <>
      <div
        className={
          isVertical ? 'flex flex-col items-center gap-0.5' : undefined
        }
      >
        <LikeButton
          postId={postId}
          onToggle={onLikeToggle}
          iconClassName={`${iconClass} ${iconShadow}`}
          className={isVertical ? undefined : hitClass}
        />
        {showCounts && likesCount !== undefined ? (
          <span className={countClass}>{likesCount}</span>
        ) : null}
      </div>

      {!hideComment ? (
        <button
          type="button"
          onClick={onComment}
          aria-label={t('post.actions.comments')}
          className={`${hitClass} ${
            isVertical ? '' : 'text-white/60 hover:text-white transition-all'
          }`}
        >
          <MessageCircle
            size={iconSize}
            strokeWidth={1.8}
            className={
              isVertical ? `text-white fill-white/20 ${iconShadow}` : iconClass
            }
          />
          {showCounts ? (
            <span className={countClass}>{commentsCount ?? 0}</span>
          ) : null}
        </button>
      ) : hideComment && !isVertical ? (
        <span className={`${hitClass} text-white/60`} aria-hidden="true">
          <MessageCircle
            size={iconSize}
            strokeWidth={1.8}
            className={iconClass}
          />
        </span>
      ) : null}

      <button
        type="button"
        onClick={onShare}
        aria-label={t('post.actions.share')}
        className={`${hitClass} ${
          isVertical ? '' : 'text-white/60 hover:text-white transition-all'
        }`}
      >
        <ShareIcon
          size={iconSize}
          className={isVertical ? `text-white ${iconShadow}` : iconClass}
        />
      </button>

      {extraActions}
    </>
  );

  const bookmarkButton = (
    <button
      type="button"
      onClick={onBookmark}
      aria-label={
        isBookmarked
          ? t('post.actions.remove_bookmark', 'Remove from saved')
          : t('post.actions.add_bookmark', 'Save')
      }
      className={`${hitClass} ${
        isVertical ? '' : 'text-white/60 hover:text-white transition-all'
      }`}
    >
      <Bookmark
        size={iconSize}
        className={
          isVertical
            ? `${
                isBookmarked
                  ? 'text-brand-primary fill-brand-primary'
                  : 'text-white'
              } ${iconShadow}`
            : `transition-all ${
                isBookmarked
                  ? 'text-white fill-white drop-shadow-[0_0_8px_rgba(255,255,255,0.3)]'
                  : 'text-white/60 hover:text-white'
              }`
        }
      />
    </button>
  );

  const menuButton = onMenu ? (
    <button
      type="button"
      ref={menuButtonRef}
      onClick={onMenu}
      aria-label={t('post.header.more_options', 'More options')}
      className={hitClass}
    >
      <MoreHorizontal size={iconSize} className={`text-white ${iconShadow}`} />
    </button>
  ) : null;

  if (isVertical) {
    return (
      <div
        className={`flex flex-col items-center gap-0.5 pointer-events-auto ${className}`}
        data-interaction-rail="vertical"
      >
        <div className="flex flex-col items-center gap-0.5">
          {likeCommentShare}
          {bookmarkButton}
          {menuButton}
        </div>
        {footer}
      </div>
    );
  }

  return (
    <div
      className={`flex items-center justify-between ${
        isLg ? 'mb-1' : 'mb-1 md:mb-2'
      } ${className}`}
      data-interaction-rail="horizontal"
    >
      <div className={`flex items-center ${isLg ? 'gap-1' : 'gap-2 md:gap-3'}`}>
        {likeCommentShare}
      </div>
      {bookmarkButton}
    </div>
  );
}
