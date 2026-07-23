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
          md:grid-cols-[minmax(0,1fr)_380px]
          lg:grid-cols-[minmax(0,1fr)_420px]
          md:grid-rows-[auto_minmax(0,1fr)]
          md:h-[calc(100vh-120px)] md:max-h-[850px] md:max-w-5xl md:mx-auto
          md:bg-black/40 md:backdrop-blur-3xl md:border md:border-white/10
          md:rounded-3xl md:overflow-hidden
          md:shadow-[0_0_50px_rgba(0,0,0,0.5)]
          mb-4
        "
      >
        {/* Header — full width on mobile, right column on desktop */}
        <div className="[grid-area:header] bg-transparent">
          <PostHeader
            post={post}
            menuButtonRef={menuButtonRef}
            onMenuToggle={() => setShowMenu(!showMenu)}
            size="lg"
          />
        </div>

        {/* Media — full width on mobile, left column spanning rows on desktop */}
        <div className="[grid-area:media] bg-black flex justify-center items-center md:border-r md:border-white/10 relative min-h-0">
          <PostMedia
            post={post}
            aspectRatio="aspect-auto"
            className="w-full max-h-[70vh] md:max-h-none md:h-full"
            objectFit="contain"
            priority={priority}
          />
        </div>

        {/* Body — comments + actions + composer */}
        <div className="[grid-area:body] flex flex-col min-h-0 bg-transparent">
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
