import { PROFILE_PINS_MAX } from '@circlesfera/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { collaborationsApi, postsApi } from '../services';
import { useAuthStore } from '../stores/authStore';
import type { Post } from '../types';

// Each author pins a post or Frame to the top of their own profile, or
// unpins it, from its menu: its author through the post, its collaborator
// through the collaboration. The server keeps one limit for both; past it,
// the person is told to unpin one first.
export function useProfilePin(post: Post | undefined) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const profileId = useAuthStore((state) => state.profile?.id);
  const postId = post?.id;
  const asCollaborator =
    !!profileId && !!post && post.collaborator?.id === profileId;
  const pinned = asCollaborator
    ? Boolean(post?.collaborator?.pinnedAt)
    : Boolean(post?.pinnedToProfileAt);

  const mutation = useMutation({
    mutationFn: async (pin: boolean): Promise<unknown> => {
      const id = postId as string;
      if (asCollaborator) {
        return pin ? collaborationsApi.pin(id) : collaborationsApi.unpin(id);
      }
      return pin ? postsApi.pinToProfile(id) : postsApi.unpinFromProfile(id);
    },
    onSuccess: (_data, pin) => {
      toast.success(
        pin ? t('post.menu.pinned_to_profile') : t('post.menu.unpinned'),
      );
      for (const queryKey of [
        ['userPosts'],
        ['userFrames'],
        ['frames'],
        ['feed'],
        ['post', postId],
      ]) {
        void queryClient.invalidateQueries({ queryKey });
      }
    },
    onError: (err: unknown) => {
      const full =
        (err as { data?: { errorCode?: string } } | null)?.data?.errorCode ===
        'PROFILE_PINS_FULL';
      toast.error(
        full
          ? t('post.menu.pins_full', { max: PROFILE_PINS_MAX })
          : t('post.menu.pin_error'),
      );
    },
  });

  return {
    pinned,
    togglePin: () => {
      if (postId) mutation.mutate(!pinned);
    },
  };
}
