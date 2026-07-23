import { useQueryClient } from '@tanstack/react-query';
import { AnimatePresence } from 'framer-motion';
import { lazy, Suspense } from 'react';
import toast from 'react-hot-toast';
import type { UsePostInteractionsReturn } from '../../hooks/usePostInteractions';
import { api } from '../../services';
import type { Post } from '../../types';
import AddToCollectionModal from '../modals/AddToCollectionModal';
import ReportModal from '../modals/ReportModal';
import SharePostModal from '../modals/SharePostModal';
import TipModal from '../monetization/TipModal';
import PostMenu from './PostMenu';
import PostModals from './PostModals';

const PromoteModal = lazy(() => import('../creator/PromoteModal'));

interface PostOverlaysProps {
  post: Post;
  interactions: UsePostInteractionsReturn;
}

export default function PostOverlays({
  post,
  interactions,
}: PostOverlaysProps) {
  const {
    menuRef,
    isOwner,
    canPromote,
    showMenu,
    setShowMenu,
    menuPosition,
    showDeleteModal,
    setShowDeleteModal,
    showEditModal,
    setShowEditModal,
    showReportModal,
    setShowReportModal,
    showAddToCollectionModal,
    setShowAddToCollectionModal,
    showPromoteModal,
    setShowPromoteModal,
    showShareModal,
    setShowShareModal,
    showTipModal,
    setShowTipModal,
    editCaption,
    setEditCaption,
    deleteMutation,
    updateMutation,
    handleEdit,
    handleMute,
    collectionId,
  } = interactions;

  const queryClient = useQueryClient();

  const hidePost = async () => {
    setShowMenu(false);
    try {
      await api.post(`/feed/preferences/hide-post/${post.id}`);
      toast.success('Post hidden from your feed');
      queryClient.invalidateQueries({ queryKey: ['feed'] });
      queryClient.invalidateQueries({ queryKey: ['forYou'] });
    } catch {
      toast.error('Could not hide post');
    }
  };

  const hideAuthor = async () => {
    setShowMenu(false);
    const authorId = post.userId || post.user?.id;
    if (!authorId) return;
    try {
      await api.post(`/feed/preferences/hide-author/${authorId}`);
      toast.success('Author hidden from your feed');
      queryClient.invalidateQueries({ queryKey: ['feed'] });
      queryClient.invalidateQueries({ queryKey: ['forYou'] });
    } catch {
      toast.error('Could not hide author');
    }
  };

  return (
    <>
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
            onMute={!isOwner ? handleMute : undefined}
            onHidePost={!isOwner ? hidePost : undefined}
            onHideAuthor={!isOwner ? hideAuthor : undefined}
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
}
