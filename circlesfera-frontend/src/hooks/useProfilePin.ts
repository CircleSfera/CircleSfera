import { PROFILE_PINS_MAX } from '@circlesfera/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { postsApi } from '../services';
import type { Post } from '../types';

// The author pins a post or Frame to the top of their profile, or unpins it,
// from its menu. The server keeps the limit; past it, the author is told to
// unpin one first.
export function useProfilePin(post: Post | undefined) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const postId = post?.id;
  const pinned = Boolean(post?.pinnedToProfileAt);

  const mutation = useMutation({
    mutationFn: (pin: boolean) =>
      pin
        ? postsApi.pinToProfile(postId as string)
        : postsApi.unpinFromProfile(postId as string),
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
