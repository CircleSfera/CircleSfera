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

function getSmartAspectRatio(
  mediaList: any[],
  fallbackRatio = 'aspect-4/5',
): string {
  if (!mediaList || mediaList.length === 0) return fallbackRatio;
  const first = mediaList[0];
  if (first.width && first.height) {
    const ratio = first.width / first.height;
    if (ratio >= 1.25) return 'aspect-video'; // Landscape (16:9)
    if (ratio >= 0.92 && ratio < 1.25) return 'aspect-square'; // Square (1:1)
    if (ratio < 0.92) return 'aspect-4/5'; // Portrait standard (4:5)
  }
  return fallbackRatio;
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
    const displayPrice = post.priceCents ? post.priceCents / 100 : 0;
    const isFullHeight = className.includes('h-full');
    const computedAspectRatio = getSmartAspectRatio(post.media, aspectRatio);

    const hasTransparentBg = className.includes('bg-transparent');
    const bgClass = hasTransparentBg ? '' : 'bg-black';
    // Use aspect-auto if we want full height, so aspect ratio doesn't conflict with parent container dimensions
    const finalAspectRatio = isFullHeight
      ? `${computedAspectRatio} aspect-auto`
      : computedAspectRatio;

    return (
      <div
        className={`relative w-full ${bgClass} overflow-hidden group flex items-center justify-center ${className}`}
      >
        <div
          className={`w-full ${isFullHeight ? 'h-full' : ''} ${
            post.shouldBlurSensitive ? 'blur-xl brightness-75 select-none' : ''
          }`}
        >
          <Carousel
            media={post.media.map((m) => ({
              ...m,
              standardUrl: m.standardUrl || undefined,
              thumbnailUrl: m.thumbnailUrl || undefined,
              filter: m.filter || undefined,
            }))}
            aspectRatio={finalAspectRatio}
            className={`${isFullHeight ? 'h-full' : ''} ${hasTransparentBg ? 'bg-transparent!' : ''}`.trim()}
            objectFit={objectFit}
            isLocked={post.isLocked}
            priority={priority}
          />
        </div>
        {post.shouldBlurSensitive && !post.isLocked && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 z-10">
            <span className="text-xs font-bold uppercase tracking-wide text-white/90 px-3 py-2 rounded-lg bg-black/50 border border-white/10">
              {t('post.media.sensitive', 'Sensitive content blurred')}
            </span>
          </div>
        )}
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
