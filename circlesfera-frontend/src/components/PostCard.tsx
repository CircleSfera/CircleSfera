import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence } from 'framer-motion';
import { memo, useEffect, useRef, useState } from 'react';
import { bookmarksApi, postsApi } from '../services';
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

interface PostCardProps {
  post: Post;
}

export default memo(function PostCard({ post }: PostCardProps) {
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
  const [showShareModal, setShowShareModal] = useState(false);
  const [showTipModal, setShowTipModal] = useState(false);
  const [editCaption, setEditCaption] = useState(post.caption || '');
  const [likesCount, setLikesCount] = useState(post._count?.likes || 0);

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
      queryClient.invalidateQueries({ queryKey: ['feed'] });
      queryClient.invalidateQueries({ queryKey: ['posts'] });
      queryClient.invalidateQueries({ queryKey: ['userPosts'] });
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

  return (
    <>
      <div className="bg-black border-b border-white/10 md:glass-panel-post md:rounded-2xl overflow-hidden mb-2">
        <PostHeader
          post={post}
          menuButtonRef={menuButtonRef}
          onMenuToggle={() => setShowMenu(!showMenu)}
        />

        <PostMedia post={post} />

        <div className="px-3 pb-3">
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

          <PostContent post={post} likesCount={likesCount} />
        </div>
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
    </>
  );
});
