import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence } from 'framer-motion';
import { lazy, memo, Suspense, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { bookmarksApi, creatorApi, followsApi, postsApi } from '../services';
import { useAuthStore } from '../stores/authStore';
import type { Post } from '../types';
import { telemetry } from '../utils/telemetry';
import { PollWidget } from './interactive/PollWidget';
import { QnaWidget } from './interactive/QnaWidget';
import AddToCollectionModal from './modals/AddToCollectionModal';
import ReportModal from './modals/ReportModal';
import SharePostModal from './modals/SharePostModal';
import TipModal from './monetization/TipModal';
import PostActions from './post/PostActions';
import PostContent from './post/PostContent';
// Sub-components
import PostHeader from './post/PostHeader';
import PostMedia from './post/PostMedia';
import PostMenu from './post/PostMenu';
import PostModals from './post/PostModals';

const PromoteModal = lazy(() => import('./creator/PromoteModal'));

interface PostCardProps {
  post: Post;
  isDetailMode?: boolean;
  renderComments?: (props?: any) => React.ReactNode;
  priority?: boolean;
}

export default memo(function PostCard({
  post,
  isDetailMode,
  renderComments,
  priority,
}: PostCardProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { profile } = useAuthStore();
  const verificationLevel =
    profile?.user?.verificationLevel || profile?.verificationLevel;
  const canPromote = verificationLevel === 'ELITE';

  // States
  const [showMenu, setShowMenu] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ top: 0, right: 0 });
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [showAddToCollectionModal, setShowAddToCollectionModal] =
    useState(false);
  const [showPromoteModal, setShowPromoteModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showTipModal, setShowTipModal] = useState(false);
  const [editCaption, setEditCaption] = useState(post.caption || '');
  const [likesCount, setLikesCount] = useState(post._count?.likes || 0);
  const [isDeleted, setIsDeleted] = useState(false);

  const postRef = useRef<HTMLDivElement>(null);
  const viewRecorded = useRef(false);

  useEffect(() => {
    let visibleStartTime = 0;
    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry.isIntersecting) {
          visibleStartTime = Date.now();
          // Log impression
          telemetry.track({
            eventType: 'IMPRESSION',
            targetId: post.id,
            targetType: 'POST',
          });

          // If promoted, also record promotion view
          if (post.isPromoted && post.promotionId && !viewRecorded.current) {
            viewRecorded.current = true;
            creatorApi
              .recordPromotionView(post.promotionId!)
              .catch(console.error);
          }
        } else {
          // If was visible, log DWELL_TIME
          if (visibleStartTime > 0) {
            const duration = Date.now() - visibleStartTime;
            if (duration > 500) {
              telemetry.track({
                eventType: 'DWELL_TIME',
                targetId: post.id,
                targetType: 'POST',
                dwellTime: duration,
              });
            }
            visibleStartTime = 0;
          }
        }
      },
      { threshold: 0.3 },
    );

    if (postRef.current) {
      observer.observe(postRef.current);
    }

    return () => {
      observer.disconnect();
      if (visibleStartTime > 0) {
        const duration = Date.now() - visibleStartTime;
        if (duration > 500) {
          telemetry.track({
            eventType: 'DWELL_TIME',
            targetId: post.id,
            targetType: 'POST',
            dwellTime: duration,
          });
        }
      }
    };
  }, [post.id, post.isPromoted, post.promotionId]);

  // Refs
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const isOwner = profile?.userId === post.userId;

  // Bookmark status
  const { data: bookmarkData } = useQuery({
    queryKey: ['bookmark', post.id],
    queryFn: () => bookmarksApi.check(post.id),
  });
  const isBookmarked = bookmarkData?.data?.bookmarked ?? false;
  const collectionId = (
    bookmarkData?.data as { bookmarked?: boolean; collectionId?: string }
  )?.collectionId;

  const toggleBookmarkMutation = useMutation({
    mutationFn: (id: string) => bookmarksApi.toggle(id),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['bookmark', post.id] });
      const previousBookmark = queryClient.getQueryData(['bookmark', post.id]);

      const newBookmarked = !isBookmarked;
      queryClient.setQueryData(['bookmark', post.id], {
        data: { bookmarked: newBookmarked },
      });

      if (newBookmarked) {
        telemetry.track({
          eventType: 'SAVE',
          targetId: post.id,
          targetType: 'POST',
        });
      }

      return { previousBookmark };
    },
    onError: (err, variables, context) => {
      console.error('Failed to toggle bookmark:', err, 'for post:', variables);
      if (context?.previousBookmark) {
        queryClient.setQueryData(
          ['bookmark', post.id],
          context.previousBookmark,
        );
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['bookmark', post.id] });
      queryClient.invalidateQueries({ queryKey: ['bookmarks'] });
    },
  });

  // Calculate menu position when showing
  useEffect(() => {
    if (showMenu && menuButtonRef.current) {
      const rect = menuButtonRef.current.getBoundingClientRect();
      setMenuPosition({
        top: rect.bottom + 8,
        right: window.innerWidth - rect.right,
      });
    }
  }, [showMenu]);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(event.target as Node) &&
        menuButtonRef.current &&
        !menuButtonRef.current.contains(event.target as Node)
      ) {
        setShowMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: () => postsApi.delete(post.id),
    onSuccess: () => {
      setShowDeleteModal(false);
      setIsDeleted(true);
      queryClient.invalidateQueries({ queryKey: ['feed'] });
      queryClient.invalidateQueries({ queryKey: ['posts'] });
      queryClient.invalidateQueries({ queryKey: ['userPosts'] });
      queryClient.invalidateQueries({ queryKey: ['frames'] });
      queryClient.invalidateQueries({ queryKey: ['userFrames'] });
      queryClient.invalidateQueries({ queryKey: ['userTagged'] });
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: (caption: string) => postsApi.update(post.id, caption),
    onSuccess: () => {
      setShowEditModal(false);
      queryClient.invalidateQueries({ queryKey: ['feed'] });
      queryClient.invalidateQueries({ queryKey: ['posts'] });
      queryClient.invalidateQueries({ queryKey: ['post', post.id] });
    },
  });

  const handleEdit = (e: React.FormEvent) => {
    e.preventDefault();
    updateMutation.mutate(editCaption);
  };

  if (isDeleted) return null;

  const actionsNode = (
    <PostActions
      post={post}
      isBookmarked={isBookmarked}
      onToggleBookmark={() => {
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          navigator.vibrate(50);
        }
        toggleBookmarkMutation.mutate(post.id);
      }}
      isBookmarkPending={toggleBookmarkMutation.isPending}
      onLikeToggle={(newLiked) => {
        setLikesCount((prev) => (newLiked ? prev + 1 : prev - 1));
        if (newLiked) {
          telemetry.track({
            eventType: 'LIKE',
            targetId: post.id,
            targetType: 'POST',
          });
        }
      }}
      onShare={() => {
        setShowShareModal(true);
        telemetry.track({
          eventType: 'SHARE',
          targetId: post.id,
          targetType: 'POST',
        });
      }}
      onTip={() => setShowTipModal(true)}
    />
  );

  const statsNode = (
    <PostContent post={post} likesCount={likesCount} hideCaption />
  );
  const captionNode = (
    <PostContent post={post} likesCount={likesCount} hideStats />
  );

  return (
    <>
      {/* Desktop Split View (Instagram Style) */}
      <div
        ref={postRef}
        className={
          isDetailMode
            ? 'hidden md:flex flex-row md:h-[calc(100vh-80px)] md:max-h-[850px] md:max-w-5xl md:mx-auto bg-black/40 backdrop-blur-3xl md:border md:border-white/10 md:rounded-3xl overflow-hidden mb-4 shadow-[0_0_50px_rgba(0,0,0,0.5)]'
            : 'hidden'
        }
        data-post-card="true"
      >
        <div className="flex flex-col flex-1 bg-black/20 justify-center items-center border-r border-white/10 relative">
          <PostMedia
            post={post}
            aspectRatio="aspect-auto"
            className="w-full h-full"
            objectFit="contain"
            priority={priority}
          />
        </div>

        <div className="flex flex-col w-[350px] lg:w-[400px] shrink-0 bg-transparent">
          <PostHeader
            post={post}
            menuButtonRef={menuButtonRef}
            onMenuToggle={() => setShowMenu(!showMenu)}
          />

          {renderComments?.({
            isDetailMode: true,
            captionComponent: (
              <div className="pb-2 border-b border-white/5">{captionNode}</div>
            ),
            actionsComponent: (
              <>
                {actionsNode}
                <div className="mt-1">{statsNode}</div>
              </>
            ),
          })}
        </div>
      </div>

      {/* Mobile or Feed Layout */}
      <div
        className={
          isDetailMode
            ? 'md:hidden w-full flex flex-col pb-4'
            : 'glass-panel-post rounded-lg overflow-hidden mb-2 content-visibility-auto'
        }
        data-post-card="true"
      >
        {post.recommendationReason && !isDetailMode && (
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

        <div
          className={
            isDetailMode
              ? 'w-full bg-black flex justify-center items-center'
              : ''
          }
        >
          <PostMedia
            post={post}
            aspectRatio={isDetailMode ? 'aspect-auto' : 'aspect-4/5'}
            className={isDetailMode ? 'max-h-[75vh] w-full' : ''}
            objectFit={isDetailMode ? 'contain' : 'cover'}
            priority={priority}
          />
        </div>

        {/* Poll and QnA widgets after media */}
        {(post.poll?.id || post.qnaBox?.id) && (
          <div className="px-3 pb-2">
            {post.poll?.id && <PollWidget pollId={post.poll.id} />}
            {post.qnaBox?.id && <QnaWidget qnaBoxId={post.qnaBox.id} />}
          </div>
        )}

        <div className="p-3 pb-1">
          {actionsNode}
          <PostContent post={post} likesCount={likesCount} />
        </div>

        {isDetailMode && renderComments && (
          <div className="p-4 border-t border-white/5">
            {renderComments?.()}
          </div>
        )}
      </div>

      {/* Overlays & Modals */}
      <AnimatePresence>
        {showMenu && (
          <PostMenu
            showMenu={showMenu}
            menuRef={menuRef}
            menuPosition={menuPosition}
            isOwner={isOwner}
            onEdit={() => {
              setShowMenu(false);
              setEditCaption(post.caption || '');
              setShowEditModal(true);
            }}
            onDelete={() => {
              setShowMenu(false);
              setShowDeleteModal(true);
            }}
            onReport={() => {
              setShowMenu(false);
              setShowReportModal(true);
            }}
            onPromote={
              canPromote
                ? () => {
                    setShowMenu(false);
                    setShowPromoteModal(true);
                  }
                : undefined
            }
            onAddToCollection={() => {
              setShowMenu(false);
              setShowAddToCollectionModal(true);
            }}
            onMute={
              !isOwner
                ? () => {
                    setShowMenu(false);
                    followsApi
                      .mute(post.user?.profile?.username || '')
                      .then(() => {
                        toast.success('User muted');
                      })
                      .catch(() => {
                        toast.error('Failed to mute user');
                      });
                  }
                : undefined
            }
          />
        )}
      </AnimatePresence>

      <PostModals
        showDeleteModal={showDeleteModal}
        setShowDeleteModal={setShowDeleteModal}
        onDelete={() => deleteMutation.mutate()}
        isDeleting={deleteMutation.isPending}
        showEditModal={showEditModal}
        setShowEditModal={setShowEditModal}
        editCaption={editCaption}
        setEditCaption={setEditCaption}
        onEdit={handleEdit}
        isEditing={updateMutation.isPending}
      />

      <ReportModal
        isOpen={showReportModal}
        onClose={() => setShowReportModal(false)}
        targetType="POST"
        targetId={post.id}
      />

      <AnimatePresence>
        {showShareModal && (
          <SharePostModal
            isOpen={showShareModal}
            onClose={() => setShowShareModal(false)}
            post={post}
          />
        )}
      </AnimatePresence>

      <TipModal
        isOpen={showTipModal}
        onClose={() => setShowTipModal(false)}
        receiverId={post.userId}
        postId={post.id}
        receiverName={post.user?.profile?.username || 'Usuario'}
      />

      {showAddToCollectionModal && (
        <AddToCollectionModal
          isOpen={showAddToCollectionModal}
          onClose={() => setShowAddToCollectionModal(false)}
          postId={post.id}
          currentCollectionId={collectionId}
        />
      )}

      {showPromoteModal && (
        <Suspense fallback={null}>
          <PromoteModal
            post={post}
            onClose={() => setShowPromoteModal(false)}
            onToast={(msg: string, type: 'success' | 'error') => {
              if (type === 'success') toast.success(msg);
              else toast.error(msg);
            }}
          />
        </Suspense>
      )}
    </>
  );
});
