import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Clapperboard, Music } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { frameWithAudioRoute } from '../components/create-post/frameAudioStart';
import { ErrorState } from '../components/ErrorEmptyStates';
import { LoadingSpinner } from '../components/LoadingStates';
import PostGrid from '../components/profile/PostGrid';
import { Button } from '../components/ui';
import { audioApi } from '../services/audio.service';
import type { PaginatedResponse, Post } from '../types';

const PAGE_SIZE = 21;

// A song's page, as Instagram's: what it is, the posts and Frames that use
// it, and a way to make a Frame with it.
export default function AudioPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();

  const audio = useQuery({
    queryKey: ['audio', id],
    queryFn: () => audioApi.getById(id!).then((r) => r.data),
    enabled: Boolean(id),
  });
  const posts = useInfiniteQuery<PaginatedResponse<Post>>({
    queryKey: ['audio', id, 'posts'],
    queryFn: ({ pageParam }) =>
      audioApi
        .getPosts(id!, pageParam as number, PAGE_SIZE)
        .then((r) => r.data),
    getNextPageParam: (last) =>
      last.meta.page < last.meta.totalPages ? last.meta.page + 1 : undefined,
    initialPageParam: 1,
    enabled: Boolean(id),
  });

  if (audio.isLoading) {
    return (
      <div className="flex justify-center p-8">
        <LoadingSpinner size="lg" />
      </div>
    );
  }
  if (audio.isError || !audio.data) {
    return (
      <ErrorState
        title={t('audio_page.error_title')}
        message={t('audio_page.error_message')}
        onRetry={() => void audio.refetch()}
      />
    );
  }

  const track = audio.data;
  const items = posts.data?.pages.flatMap((p) => p.data) ?? [];
  const total = posts.data?.pages[0]?.meta.total ?? 0;

  return (
    <div className="min-h-dvh max-w-4xl mx-auto px-4 pt-6 pb-24 md:px-6">
      <header className="flex items-center gap-4 mb-6">
        <div className="w-24 h-24 md:w-32 md:h-32 shrink-0 rounded-xl overflow-hidden bg-white/10 flex items-center justify-center">
          {track.thumbnailUrl ? (
            <img
              src={track.thumbnailUrl}
              alt=""
              className="w-full h-full object-cover"
            />
          ) : (
            <Music size={36} className="text-white/60" aria-hidden />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl md:text-2xl font-bold text-white wrap-break-word">
            {track.title}
          </h1>
          <p className="text-sm text-white/70 truncate">
            {track.artist || t('frames.artist_fallback')}
          </p>
          <p className="mt-1 text-xs text-white/50">
            {t('audio_page.count', { count: total })}
          </p>
        </div>
      </header>

      <Button
        variant="primary"
        className="w-full md:w-auto min-h-12 mb-6 gap-2"
        onClick={() => {
          const route = frameWithAudioRoute(track);
          navigate(route.to, route.options);
        }}
      >
        <Clapperboard size={18} aria-hidden />
        {t('audio_page.use')}
      </Button>

      {posts.isError ? (
        <ErrorState onRetry={() => void posts.refetch()} />
      ) : posts.isLoading ? (
        <div className="flex justify-center p-8">
          <LoadingSpinner size="md" />
        </div>
      ) : (
        <PostGrid
          items={items}
          aspectRatio="3/4"
          variant="frames"
          columns="frames"
          emptyMessage={t('audio_page.empty')}
          emptySubtext={t('audio_page.empty_sub')}
          icon={<Music size={28} aria-hidden />}
          onLoadMore={() => void posts.fetchNextPage()}
          hasMore={posts.hasNextPage}
          isLoadingMore={posts.isFetchingNextPage}
        />
      )}
    </div>
  );
}
