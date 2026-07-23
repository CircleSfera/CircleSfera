import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { usePostInteractions } from '../hooks/usePostInteractions';
import type { Post } from '../types';
import { PollWidget } from './interactive/PollWidget';
import { QnaWidget } from './interactive/QnaWidget';
import PostActions from './post/PostActions';
import PostContent from './post/PostContent';
import PostHeader from './post/PostHeader';
import PostMedia from './post/PostMedia';
import PostOverlays from './post/PostOverlays';

interface PostCardProps {
  post: Post;
  priority?: boolean;
}

export default memo(function PostCard({ post, priority }: PostCardProps) {
  const { t } = useTranslation();
  const interactions = usePostInteractions(post);

  if (interactions.isDeleted) return null;

  const {
    postRef,
    menuButtonRef,
    showMenu,
    setShowMenu,
    likesCount,
    isBookmarked,
    isBookmarkPending,
    handleToggleBookmark,
    handleLikeToggle,
    handleShare,
    handleTip,
  } = interactions;

  return (
    <>
      <div
        ref={postRef}
        className="glass-panel-post rounded-lg overflow-hidden mb-2 content-visibility-auto"
        data-post-card="true"
      >
        {post.recommendationReason && (
          <div className="px-3 py-1.5 text-xs border-b border-white/5 bg-white/2">
            <div className="flex items-center gap-1.5 text-white/50">
              {post.recommendationReason === 'close_friend' && (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                  <span className="font-semibold text-green-400">
                    {t('post.recommendation.close_friends', 'Mejores Amigos')}
                  </span>
                </>
              )}
              {post.recommendationReason === 'following' && (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                  <span>{t('post.recommendation.following', 'Siguiendo')}</span>
                </>
              )}
              {post.recommendationReason === 'interest' && (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-pulse" />
                  <span className="text-purple-300 font-medium">
                    {t('post.recommendation.interest', 'Recomendado para ti')}
                  </span>
                </>
              )}
              {post.recommendationReason === 'popular' && (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                  <span className="text-amber-300 font-medium">
                    {t('post.recommendation.popular', 'Popular')}
                  </span>
                </>
              )}
              {post.recommendationReason === 'new' && (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-gray-500" />
                  <span>{t('post.recommendation.new', 'Nuevo para ti')}</span>
                </>
              )}
            </div>
            {post.recommendationSignals &&
              post.recommendationSignals.length > 0 && (
                <details className="mt-1 text-xs text-gray-500">
                  <summary className="cursor-pointer hover:text-gray-400 font-medium">
                    {t('post.recommendation.why', 'Why?')}
                  </summary>
                  <div className="mt-1 pl-2 text-gray-600">
                    {post.recommendationSignals.join(', ')}
                  </div>
                </details>
              )}
          </div>
        )}

        <PostHeader
          post={post}
          menuButtonRef={menuButtonRef}
          onMenuToggle={() => setShowMenu(!showMenu)}
        />

        <PostMedia
          post={post}
          aspectRatio="aspect-4/5"
          objectFit="cover"
          priority={priority}
        />

        {(post.poll?.id || post.qnaBox?.id) && (
          <div className="px-3 pb-2">
            {post.poll?.id && <PollWidget pollId={post.poll.id} />}
            {post.qnaBox?.id && <QnaWidget qnaBoxId={post.qnaBox.id} />}
          </div>
        )}

        <div className="p-3 pb-1">
          <PostActions
            post={post}
            isBookmarked={isBookmarked}
            onToggleBookmark={handleToggleBookmark}
            isBookmarkPending={isBookmarkPending}
            onLikeToggle={handleLikeToggle}
            onShare={handleShare}
            onTip={handleTip}
          />
          <PostContent post={post} likesCount={likesCount} />
        </div>
      </div>

      <PostOverlays post={post} interactions={interactions} />
    </>
  );
});
