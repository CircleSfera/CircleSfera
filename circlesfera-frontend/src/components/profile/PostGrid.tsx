import { Clapperboard, Heart, MessageCircle } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import type { Post } from '../../types';
import { getPostPath } from '../../utils/postRoutes';
import { EmptyState } from '../ErrorEmptyStates';
import { LoadingSpinner } from '../LoadingStates';

interface PostGridProps {
  items: Post[];
  emptyMessage: string;
  emptySubtext: string;
  icon: React.ReactNode;
  /** Posts: 4/5. Profile frame thumbnails: 3/4 (not full 9:16 — that is for the viewer). */
  aspectRatio?: '4/5' | '3/4';
  variant?: 'default' | 'frames';
  onLoadMore?: () => void;
  hasMore?: boolean;
  isLoadingMore?: boolean;
}

const ASPECT_CLASS = {
  '4/5': 'aspect-4/5',
  '3/4': 'aspect-3/4',
} as const;

export default function PostGrid({
  items,
  emptyMessage,
  emptySubtext,
  aspectRatio = '4/5',
  variant = 'default',
  onLoadMore,
  hasMore = false,
  isLoadingMore = false,
}: PostGridProps) {
  const loadMoreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void items.length;
    if (!onLoadMore || !hasMore || isLoadingMore) return;

    const node = loadMoreRef.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          onLoadMore();
        }
      },
      { rootMargin: '200px' },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [onLoadMore, hasMore, isLoadingMore, items.length]);

  if (!items || items.length === 0) {
    return (
      <EmptyState icon="posts" title={emptyMessage} message={emptySubtext} />
    );
  }

  const isFramesGrid = variant === 'frames';
  const statIconSize = isFramesGrid ? 14 : 20;

  return (
    <div>
      <div
        className={
          isFramesGrid
            ? 'grid grid-cols-3 md:grid-cols-4 gap-0.5 md:gap-1'
            : 'grid grid-cols-3 gap-1'
        }
      >
        {items.map((post) => (
          <Link
            key={post.id}
            to={getPostPath(post)}
            className={`${ASPECT_CLASS[aspectRatio]} relative group overflow-hidden bg-white/5`}
          >
            {post.type === 'FRAME' && (
              <div className="absolute top-1.5 right-1.5 z-10">
                <Clapperboard
                  size={isFramesGrid ? 12 : 16}
                  className="text-white drop-shadow-md"
                />
              </div>
            )}
            {post.media?.[0]?.type === 'video' || post.type === 'FRAME' ? (
              <video
                src={post.media?.[0]?.url}
                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                muted
                playsInline
                loop
                preload="metadata"
                onMouseOver={(e) => {
                  e.currentTarget.play().catch(() => {});
                }}
                onMouseOut={(e) => {
                  e.currentTarget.pause();
                  e.currentTarget.currentTime = 0;
                }}
                onFocus={(e) => {
                  e.currentTarget.play().catch(() => {});
                }}
                onBlur={(e) => {
                  e.currentTarget.pause();
                  e.currentTarget.currentTime = 0;
                }}
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              >
                <track kind="captions" />
              </video>
            ) : (
              <img
                src={
                  post.media?.[0]?.thumbnailUrl ||
                  post.media?.[0]?.standardUrl ||
                  post.media?.[0]?.url
                }
                srcSet={
                  post.media?.[0]?.thumbnailUrl && post.media?.[0]?.standardUrl
                    ? `${post.media?.[0]?.thumbnailUrl} 300w, ${post.media?.[0]?.standardUrl} 600w`
                    : undefined
                }
                sizes="(max-width: 768px) 33vw, 250px"
                alt={post.caption || ''}
                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                loading="lazy"
                onError={(e) => {
                  e.currentTarget.src = '#noimagex400?text=No+Image';
                  e.currentTarget.srcset = '';
                }}
              />
            )}

            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3 pointer-events-none">
              <div className="flex items-center gap-1.5 text-white font-bold text-xs md:text-sm">
                <Heart size={statIconSize} fill="white" />
                <span>{post._count?.likes || 0}</span>
              </div>
              <div className="flex items-center gap-1.5 text-white font-bold text-xs md:text-sm">
                <MessageCircle size={statIconSize} fill="white" />
                <span>{post._count?.comments || 0}</span>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {(hasMore || isLoadingMore) && (
        <div
          ref={loadMoreRef}
          className="flex justify-center py-6 min-h-[48px]"
          aria-hidden={!isLoadingMore}
        >
          {isLoadingMore && <LoadingSpinner size="md" />}
        </div>
      )}
    </div>
  );
}
