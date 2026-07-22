import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { monetizationApi } from '../../services/monetization.service';
import type { Post } from '../../types';
import Carousel from '../Carousel';
import PaywallOverlay from '../monetization/PaywallOverlay';

interface PostMediaProps {
  post: Post;
  className?: string;
  aspectRatio?: string;
  objectFit?: 'cover' | 'contain';
  priority?: boolean;
}

export default function PostMedia({
  post,
  className = '',
  aspectRatio = 'aspect-4/5',
  objectFit = 'cover',
  priority = false,
}: PostMediaProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const unlockMutation = useMutation({
    mutationFn: () => monetizationApi.unlockPost(post.id, window.location.href),
    onSuccess: (response: { url?: string }) => {
      if (response?.url) {
        window.location.href = response.url;
      } else {
        toast.success(t('post.media.unlock_success'));
        queryClient.invalidateQueries({ queryKey: ['feed'] });
        queryClient.invalidateQueries({ queryKey: ['posts'] });
        queryClient.invalidateQueries({ queryKey: ['userPosts'] });
        queryClient.invalidateQueries({ queryKey: ['wallet'] });
      }
    },
    onError: (error: { response?: { data?: { message?: string } } }) => {
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
          priority={priority}
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
