import { memo } from 'react';
import { usePostInteractions } from '../../hooks/usePostInteractions';
import type { Comment, Post } from '../../types';
import CommentList from '../CommentList';
import { PollWidget } from '../interactive/PollWidget';
import { QnaWidget } from '../interactive/QnaWidget';
import PostActions from './PostActions';
import PostContent from './PostContent';
import PostHeader from './PostHeader';
import PostMedia from './PostMedia';
import PostOverlays from './PostOverlays';

interface PostDetailViewProps {
  post: Post;
  comments: Comment[];
  priority?: boolean;
}

/**
 * Single-tree responsive layout for post detail.
 * Mobile: header → media → body (actions, caption, comments, sticky composer)
 * Desktop (md+): media | sidebar (header / scrollable comments / actions + composer)
 */
export default memo(function PostDetailView({
  post,
  comments,
  priority,
}: PostDetailViewProps) {
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

  const actionsNode = (
    <PostActions
      post={post}
      isBookmarked={isBookmarked}
      onToggleBookmark={handleToggleBookmark}
      isBookmarkPending={isBookmarkPending}
      onLikeToggle={handleLikeToggle}
      onShare={handleShare}
      onTip={handleTip}
      size="lg"
      hideCommentLink
    />
  );

  const statsNode = (
    <PostContent post={post} likesCount={likesCount} hideCaption isDetailMode />
  );

  const captionNode = (
    <PostContent post={post} likesCount={likesCount} hideStats isDetailMode />
  );

  const widgetsNode =
    post.poll?.id || post.qnaBox?.id ? (
      <div className="px-3 pb-2">
        {post.poll?.id && <PollWidget pollId={post.poll.id} />}
        {post.qnaBox?.id && <QnaWidget qnaBoxId={post.qnaBox.id} />}
      </div>
    ) : null;

  return (
    <>
      <div
        ref={postRef}
        data-post-card="true"
        className="
          w-full grid
          [grid-template-areas:'header'_'media'_'body']
          grid-cols-1
          md:[grid-template-areas:'media_header'_'media_body']
          md:grid-cols-[minmax(0,1.2fr)_360px]
          lg:grid-cols-[minmax(0,1.3fr)_390px]
          md:grid-rows-[auto_minmax(0,1fr)]
          md:h-[calc(100vh-140px)] md:max-h-180 md:max-w-4xl md:mx-auto
          glass-panel rounded-2xl md:rounded-3xl overflow-hidden
          border border-white/10 shadow-2xl
          mb-4
        "
      >
        {/* Header — full width on mobile, right column on desktop */}
        <div className="[grid-area:header] border-b border-white/8 bg-black/20 backdrop-blur-xl">
          <PostHeader
            post={post}
            menuButtonRef={menuButtonRef}
            onMenuToggle={() => setShowMenu(!showMenu)}
            size="default"
            showBack
          />
        </div>

        {/* Media — full width on mobile, left column spanning rows on desktop */}
        <div className="[grid-area:media] bg-black/60 flex justify-center items-center md:border-r md:border-white/8 relative aspect-4/5 md:aspect-auto md:min-h-112.5 overflow-hidden group">
          {/* Blurred backdrop image to eliminate letterbox empty black space */}
          {post.media?.[0]?.url && (
            <img
              src={post.media[0].thumbnailUrl || post.media[0].url}
              alt=""
              className="absolute inset-0 w-full h-full object-cover blur-3xl opacity-35 scale-110 pointer-events-none"
            />
          )}

          <PostMedia
            post={post}
            aspectRatio="aspect-4/5"
            className="w-full h-full relative z-10 bg-transparent"
            objectFit="contain"
            priority={priority}
          />
        </div>

        {/* Body — comments + actions + composer */}
        <div className="[grid-area:body] flex flex-col min-h-0 bg-black/20 backdrop-blur-xl">
          {/* Mobile-only: actions + caption between media and comments */}
          <div className="md:hidden px-3 pt-3 pb-1">
            {actionsNode}
            <PostContent post={post} likesCount={likesCount} isDetailMode />
          </div>

          {widgetsNode}

          <div className="flex-1 flex flex-col min-h-0">
            <CommentList
              postId={post.id}
              comments={comments}
              isDetailMode
              captionComponent={
                <div className="hidden md:block pb-3 border-b border-white/5 mb-1">
                  {captionNode}
                </div>
              }
              actionsComponent={
                <div className="hidden md:block">
                  {actionsNode}
                  <div className="mt-1">{statsNode}</div>
                </div>
              }
            />
          </div>
        </div>
      </div>

      <PostOverlays post={post} interactions={interactions} />
    </>
  );
});
