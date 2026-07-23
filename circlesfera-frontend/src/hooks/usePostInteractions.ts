import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { bookmarksApi, creatorApi, followsApi, postsApi } from '../services';
import { useAuthStore } from '../stores/authStore';
import type { Post } from '../types';
import { telemetry } from '../utils/telemetry';

export function usePostInteractions(post: Post) {
  const queryClient = useQueryClient();
  const { profile } = useAuthStore();
  const verificationLevel =
    profile?.user?.verificationLevel || profile?.verificationLevel;
  const canPromote = verificationLevel === 'ELITE';
  const isOwner = profile?.userId === post.userId;

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
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let visibleStartTime = 0;
    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry.isIntersecting) {
          visibleStartTime = Date.now();
          telemetry.track({
            eventType: 'IMPRESSION',
            targetId: post.id,
            targetType: 'POST',
          });

          if (post.isPromoted && post.promotionId && !viewRecorded.current) {
            viewRecorded.current = true;
            creatorApi
              .recordPromotionView(post.promotionId!)
              .catch(console.error);
          }
        } else if (visibleStartTime > 0) {
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

  useEffect(() => {
    if (showMenu && menuButtonRef.current) {
      const rect = menuButtonRef.current.getBoundingClientRect();
      setMenuPosition({
        top: rect.bottom + 8,
        right: window.innerWidth - rect.right,
      });
    }
  }, [showMenu]);

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

  const handleToggleBookmark = () => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(50);
    }
    toggleBookmarkMutation.mutate(post.id);
  };

  const handleLikeToggle = (newLiked: boolean) => {
    setLikesCount((prev) => (newLiked ? prev + 1 : prev - 1));
    if (newLiked) {
      telemetry.track({
        eventType: 'LIKE',
        targetId: post.id,
        targetType: 'POST',
      });
    }
  };

  const handleShare = () => {
    setShowShareModal(true);
    telemetry.track({
      eventType: 'SHARE',
      targetId: post.id,
      targetType: 'POST',
    });
  };

  const handleMute = () => {
    setShowMenu(false);
    followsApi
      .mute(post.user?.profile?.username || '')
      .then(() => {
        toast.success('User muted');
      })
      .catch(() => {
        toast.error('Failed to mute user');
      });
  };

  return {
    postRef,
    menuButtonRef,
    menuRef,
    isOwner,
    canPromote,
    isDeleted,
    likesCount,
    isBookmarked,
    collectionId,
    isBookmarkPending: toggleBookmarkMutation.isPending,
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
    handleToggleBookmark,
    handleLikeToggle,
    handleShare,
    handleMute,
    handleTip: () => setShowTipModal(true),
  };
}

export type UsePostInteractionsReturn = ReturnType<typeof usePostInteractions>;
