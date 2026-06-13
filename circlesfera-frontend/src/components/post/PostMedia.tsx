import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { api } from '../../services';
import type { Post } from '../../types';
import Carousel from '../Carousel';
import PaywallOverlay from '../monetization/PaywallOverlay';

interface PostMediaProps {
  post: Post;
}

export default function PostMedia({ post }: PostMediaProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const unlockMutation = useMutation({
    mutationFn: () => api.post('/wallet/unlock', { postId: post.id }),
    onSuccess: () => {
      toast.success(t('post.media.unlock_success'));
      // Invalidate relevant queries to fetch unblurred media
      queryClient.invalidateQueries({ queryKey: ['feed'] });
      queryClient.invalidateQueries({ queryKey: ['posts'] });
      queryClient.invalidateQueries({ queryKey: ['userPosts'] });
      queryClient.invalidateQueries({ queryKey: ['wallet'] });
    },
    onError: (error: any) => {
      toast.error(
        error.response?.data?.message || t('post.media.unlock_error'),
      );
    },
  });

  // Use new media array if available
  if (post.media && post.media.length > 0) {
    return (
      <div className="relative aspect-4/5 bg-black overflow-hidden group">
        <Carousel media={post.media} />
        {post.isLocked && (
          <PaywallOverlay
            price={post.price || 0}
            onUnlock={() => unlockMutation.mutate()}
            isLoading={unlockMutation.isPending}
          />
        )}
      </div>
    );
  }

  return null;
}
