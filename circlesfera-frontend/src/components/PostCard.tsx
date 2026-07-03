import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence } from 'framer-motion';
import { lazy, memo, Suspense, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { bookmarksApi, creatorApi, postsApi } from '../services';
import { useAuthStore } from '../stores/authStore';
import type { Post } from '../types';

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
}

export default memo(function PostCard({
  post,
  isDetailMode,
  renderComments,
}: PostCardProps) {
  const queryClient = useQueryClient();
  const { profile } = useAuthStore();

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
    if (!post.isPromoted || !post.promotionId || viewRecorded.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry.isIntersecting && !viewRecorded.current) {
          viewRecorded.current = true;
          creatorApi
            .recordPromotionView(post.promotionId!)
            .catch(console.error);
        }
      },
      { threshold: 0.5 },
    );

    if (postRef.current) {
      observer.observe(postRef.current);
    }

    return () => {
      observer.disconnect();
    };
  }, [post.isPromoted, post.promotionId]);

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
    mutationFn: () => bookmarksApi.toggle(post.id),
    onSuccess: () => {
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
      onToggleBookmark={() => toggleBookmarkMutation.mutate()}
      isBookmarkPending={toggleBookmarkMutation.isPending}
      onLikeToggle={(newLiked) => {
        setLikesCount((prev) => (newLiked ? prev + 1 : prev - 1));
      }}
      onShare={() => setShowShareModal(true)}
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
      >
        <div className="flex flex-col flex-1 bg-black/20 justify-center items-center border-r border-white/10 relative">
          <PostMedia
            post={post}
            aspectRatio="aspect-auto"
            className="w-full h-full"
            objectFit="contain"
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
            : 'glass-panel-post rounded-lg overflow-hidden mb-2'
        }
      >
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
          />
        </div>

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
        onPromote={() => {
          setShowMenu(false);
          setShowPromoteModal(true);
        }}
        onAddToCollection={() => {
          setShowMenu(false);
          setShowAddToCollectionModal(true);
        }}
      />

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
