import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { collaborationsApi } from '../services';
import { useAuthStore } from '../stores/authStore';
import type { Post } from '../types';
import { apiErrorMessage } from '../utils/apiErrorMessage';

// What changes when a collaborator comes or goes: the lists and profiles
// the post shows on.
export const COLLABORATION_QUERY_KEYS = [
  ['feed'],
  ['userPosts'],
  ['userFrames'],
  ['frames'],
] as const;

// Only a public post that is not paid, and is shown, can have a
// collaborator. The server checks it again.
export function canHaveCollaborator(post: Post): boolean {
  return (
    (post.visibility ?? 'PUBLIC') === 'PUBLIC' &&
    !post.isPremium &&
    !post.priceCents &&
    !post.archivedAt
  );
}

/**
 * What the viewer can do about a post's collaboration: its author manages
 * the collaborator, and the collaborator can stop co-authoring it.
 */
export function useCollaboration(post: Post | undefined) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const profileId = useAuthStore((state) => state.profile?.id);

  const isCollaborator =
    !!post && !!profileId && post.collaborator?.id === profileId;

  const leave = useMutation({
    mutationFn: (postId: string) => collaborationsApi.leave(postId),
    onSuccess: (_data, postId) => {
      toast.success(t('post.collab.left'));
      void queryClient.invalidateQueries({ queryKey: ['post', postId] });
      for (const key of COLLABORATION_QUERY_KEYS) {
        void queryClient.invalidateQueries({ queryKey: [...key] });
      }
    },
    onError: (error) =>
      toast.error(apiErrorMessage(error, t, 'post.collab.leave_error')),
  });

  return {
    isCollaborator,
    leave: () => {
      if (post) leave.mutate(post.id);
    },
  };
}
