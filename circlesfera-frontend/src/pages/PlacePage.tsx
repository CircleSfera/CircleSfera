import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { MapPin } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { ErrorState } from '../components/ErrorEmptyStates';
import { LoadingSpinner } from '../components/LoadingStates';
import PostGrid from '../components/profile/PostGrid';
import { placesApi } from '../services/places.service';
import type { PaginatedResponse, Post } from '../types';

const PAGE_SIZE = 21;

// A place's page, as Instagram's: its name and the posts made there that
// the viewer may see, newest first.
export default function PlacePage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();

  const place = useQuery({
    queryKey: ['places', id],
    queryFn: () => placesApi.getById(id!).then((r) => r.data),
    enabled: Boolean(id),
  });
  const posts = useInfiniteQuery<PaginatedResponse<Post>>({
    queryKey: ['places', id, 'page-posts'],
    queryFn: ({ pageParam }) =>
      placesApi
        .getPosts(id!, pageParam as number, PAGE_SIZE)
        .then((r) => r.data),
    getNextPageParam: (last) =>
      last.meta.page < last.meta.totalPages ? last.meta.page + 1 : undefined,
    initialPageParam: 1,
    enabled: Boolean(id),
  });

  if (place.isLoading) {
    return (
      <div className="flex justify-center p-8">
        <LoadingSpinner size="lg" />
      </div>
    );
  }
  if (place.isError || !place.data) {
    return (
      <ErrorState
        title={t('place_page.error_title')}
        message={t('place_page.error_message')}
        onRetry={() => void place.refetch()}
      />
    );
  }

  const info = place.data;
  const items = posts.data?.pages.flatMap((p) => p.data) ?? [];
  const total = posts.data?.pages[0]?.meta.total ?? info.postCount;

  return (
    <div className="min-h-dvh max-w-4xl mx-auto px-4 pt-6 pb-24 md:px-6">
      <header className="flex items-start gap-3 mb-6">
        <div className="w-14 h-14 shrink-0 rounded-full bg-white/10 flex items-center justify-center">
          <MapPin size={24} className="text-white/80" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl md:text-2xl font-bold text-white wrap-break-word">
            {info.name}
          </h1>
          {info.fullName && info.fullName !== info.name && (
            <p className="text-sm text-white/60 wrap-break-word">
              {info.fullName}
            </p>
          )}
          <p className="mt-1 text-xs text-white/50">
            {t('place_page.count', { count: total })}
          </p>
        </div>
      </header>

      {posts.isError ? (
        <ErrorState onRetry={() => void posts.refetch()} />
      ) : posts.isLoading ? (
        <div className="flex justify-center p-8">
          <LoadingSpinner size="md" />
        </div>
      ) : (
        <PostGrid
          items={items}
          emptyMessage={t('place_page.empty')}
          emptySubtext={t('place_page.empty_sub')}
          icon={<MapPin size={28} aria-hidden />}
          onLoadMore={() => void posts.fetchNextPage()}
          hasMore={posts.hasNextPage}
          isLoadingMore={posts.isFetchingNextPage}
        />
      )}
    </div>
  );
}
