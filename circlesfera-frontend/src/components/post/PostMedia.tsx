import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { monetizationApi } from '../../services/monetization.service';
import type { Post } from '../../types';
import { reportPaymentError } from '../../utils/identityVerification';
import Carousel from '../Carousel';
import PaywallOverlay from '../monetization/PaywallOverlay';

interface PostMediaProps {
  post: Post;
  className?: string;
  /** Feed Post shell — Instagram preferred portrait slot is 4:5 (vertical). */
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
  // The setting promises a blur "until you click": the person lifts it, for
  // this post, by pressing on it.
  const [revealed, setRevealed] = useState(false);
  const isBlurred = !!post.shouldBlurSensitive && !revealed;

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
    onError: (error: unknown) => {
      reportPaymentError(error, t, 'post.media.unlock_error');
    },
  });

  if (!post.media || post.media.length === 0) {
    return null;
  }

  const displayPrice = post.priceCents ? post.priceCents / 100 : 0;
  const isFullHeight = className.includes('h-full');
  const hasTransparentBg = className.includes('bg-transparent');
  const bgClass = hasTransparentBg ? '' : 'bg-black';
  const finalAspectRatio = isFullHeight
    ? `${aspectRatio} aspect-auto`
    : aspectRatio;

  return (
    <div
      className={`relative w-full ${bgClass} overflow-hidden group flex items-center justify-center ${className}`}
    >
      <div
        className={`w-full ${isFullHeight ? 'h-full' : ''} ${
          isBlurred ? 'blur-xl brightness-75 select-none' : ''
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
          libraryAudioUrl={post.audio?.url}
          libraryAudioStartMs={post.audioStartMs ?? 0}
        />
      </div>
      {isBlurred && !post.isLocked && (
        <button
          type="button"
          onClick={() => setRevealed(true)}
          className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/40 z-10"
        >
          <span className="text-xs font-bold uppercase tracking-wide text-white/90 px-3 py-2 rounded-lg bg-black/50 border border-white/10">
            {t('post.media.sensitive')}
          </span>
          <span className="text-xs font-semibold text-white/80">
            {t('post.media.sensitive_reveal')}
          </span>
        </button>
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
