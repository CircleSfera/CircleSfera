import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { api } from '../../services';
import type { Post } from '../../types';
import Carousel from '../Carousel';
import PaywallOverlay from '../monetization/PaywallOverlay';

interface PostMediaProps {
  post: Post;
  className?: string;
  aspectRatio?: string;
  objectFit?: 'cover' | 'contain';
}

export default function PostMedia({
  post,
  className = '',
  aspectRatio = 'aspect-4/5',
  objectFit = 'cover',
}: PostMediaProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const unlockMutation = useMutation({
    mutationFn: () =>
      api.post('/monetization/unlock', {
        postId: post.id,
        returnUrl: window.location.href,
      }),
    onSuccess: (response: any) => {
      if (response.data?.url) {
        window.location.href = response.data.url;
      } else {
        toast.success(t('post.media.unlock_success'));
        queryClient.invalidateQueries({ queryKey: ['feed'] });
        queryClient.invalidateQueries({ queryKey: ['posts'] });
        queryClient.invalidateQueries({ queryKey: ['userPosts'] });
        queryClient.invalidateQueries({ queryKey: ['wallet'] });
      }
    },
    onError: (error: any) => {
      toast.error(
        error.response?.data?.message || t('post.media.unlock_error'),
      );
    },
  });

  // Use new media array if available
  if (post.media && post.media.length > 0) {
    const displayPrice = post.priceCents
      ? post.priceCents / 100
      : post.price || 0;
    return (
      <div
        className={`relative bg-black overflow-hidden group ${aspectRatio} ${className}`}
      >
        <Carousel
          media={post.media}
          aspectRatio={aspectRatio}
          objectFit={objectFit}
          isLocked={post.isLocked}
        />
        {post.isLocked && (
          <PaywallOverlay
            price={displayPrice}
            onUnlock={() => unlockMutation.mutate()}
            isLoading={unlockMutation.isPending}
          />
        )}
      </div>
    );
  }

  return null;
}
