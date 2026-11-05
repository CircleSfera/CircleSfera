import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { postsApi } from '../services';
import type { Post } from '../types';

type InteractionChanges = { turnOffComments?: boolean; hideLikes?: boolean };

// The author turns comments, or the like count, off or on at any time, from
// a post's menu or a Frame's. The change reaches everyone at once, the author
// included.
export function usePostInteractionSettings(post: Post | undefined) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const postId = post?.id;

  const mutation = useMutation({
    mutationFn: (changes: InteractionChanges) =>
      postsApi.setInteractions(postId as string, changes),
    onSuccess: (_data, changes) => {
      toast.success(
        changes.turnOffComments !== undefined
          ? changes.turnOffComments
            ? t('post.menu.comments_turned_off')
            : t('post.menu.comments_turned_on')
          : changes.hideLikes
            ? t('post.menu.like_count_hidden')
            : t('post.menu.like_count_shown'),
      );
      for (const queryKey of [
        ['feed'],
        ['posts'],
        ['userPosts'],
        ['frames'],
        ['post', postId],
        ['comments', postId],
      ]) {
        void queryClient.invalidateQueries({ queryKey });
      }
    },
    onError: () => toast.error(t('post.menu.interactions_error')),
  });

  const commentsOff = Boolean(post?.turnOffComments);
  const likesHidden = Boolean(post?.hideLikes);

  return {
    commentsOff,
    likesHidden,
    toggleComments: () => {
      if (postId) mutation.mutate({ turnOffComments: !commentsOff });
    },
    toggleLikes: () => {
      if (postId) mutation.mutate({ hideLikes: !likesHidden });
    },
  };
}
