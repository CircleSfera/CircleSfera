import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { placesApi } from '../../services';
import type { PaginatedResponse, PlaceMapPin, Post } from '../../types';
import { LoadingSpinner } from '../LoadingStates';
import PostGrid from '../profile/PostGrid';
import UserAvatar from '../UserAvatar';
import MapBottomSheet from './MapBottomSheet';
import { buildPlaceDetailSubtitle } from './placeDetailFormat';

type PlaceDetailSheetProps = {
  placeId: string | null;
  fallbackPin?: PlaceMapPin | null;
  onClose: () => void;
};

const VISIBLE_CREATORS = 3;

/**
 * Place detail: dense Instagram-style thumbnail grid.
 * Scales to many posts via 3-col square tiles + infinite scroll;
 * creators stay a compact avatar stack (never a long username list).
 */
export default function PlaceDetailSheet({
  placeId,
  fallbackPin,
  onClose,
}: PlaceDetailSheetProps) {
  const { t } = useTranslation();
  const open = Boolean(placeId);

  const { data: place } = useQuery({
    queryKey: ['places', placeId],
    queryFn: async () => {
      const res = await placesApi.getById(placeId!);
      return res.data;
    },
    enabled: open,
  });

  const {
    data: postsPages,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading: postsLoading,
  } = useInfiniteQuery({
    queryKey: ['places', placeId, 'posts'],
    queryFn: async ({ pageParam }) => {
      const res = await placesApi.getPosts(placeId!, pageParam as number, 21);
      return res.data;
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage: PaginatedResponse<Post>) => {
      if (lastPage.meta.page < lastPage.meta.totalPages) {
        return lastPage.meta.page + 1;
      }
      return undefined;
    },
    enabled: open,
  });

  const posts = postsPages?.pages.flatMap((p) => p.data) ?? [];
  const creators =
    fallbackPin?.creators ??
    Array.from(
      new Map(
        posts
          .map((p) => p.profile)
          .filter(Boolean)
          .map((profile) => [
            profile!.id,
            {
              id: profile!.id,
              username: profile!.username,
              avatar: profile!.avatar ?? null,
            },
          ]),
      ).values(),
    );

  const title = place?.name ?? fallbackPin?.name ?? t('explore.map.place');
  const postCount = place?.postCount ?? fallbackPin?.postCount ?? posts.length;
  const subtitle = buildPlaceDetailSubtitle({
    name: title,
    locality: place?.locality ?? fallbackPin?.locality,
    region: place?.region ?? fallbackPin?.region,
    country: place?.country ?? fallbackPin?.country,
    fullName: place?.fullName ?? fallbackPin?.fullName,
    postCount,
    postsLabel: t('explore.map.posts_count', { count: postCount }),
  });

  const visibleCreators = creators.slice(0, VISIBLE_CREATORS);
  const extraCreators = Math.max(0, creators.length - visibleCreators.length);

  return (
    <MapBottomSheet
      isOpen={open}
      onClose={onClose}
      title={title}
      subtitle={subtitle}
      maxHeightClass="max-h-[min(72%,580px)] md:max-h-[min(70vh,560px)]"
      desktopWidthClass="md:w-[min(100%-2rem,440px)]"
      titleId="place-detail-title"
      scrimClass="bg-black/35"
    >
      <div className="flex flex-col min-h-0 h-full">
        {creators.length > 0 ? (
          <div className="px-4 pb-2.5 shrink-0 flex items-center gap-2.5">
            <div className="flex items-center -space-x-2 shrink-0">
              {visibleCreators.map((c) => (
                <Link
                  key={c.id}
                  to={`/${c.username}`}
                  className="relative rounded-full ring-2 ring-black/80 hover:z-10 focus-visible:z-10"
                  aria-label={c.username}
                  title={c.username}
                >
                  <UserAvatar
                    src={c.avatar}
                    alt={c.username}
                    size="sm"
                    className="ring-0"
                  />
                </Link>
              ))}
            </div>
            <p className="text-[11px] text-white/50 truncate min-w-0">
              {extraCreators > 0
                ? t('explore.map.creators_more', { count: creators.length })
                : t('explore.map.posted_by')}
            </p>
          </div>
        ) : null}

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-1 pb-2">
          {postsLoading ? (
            <div className="flex justify-center py-10">
              <LoadingSpinner />
            </div>
          ) : (
            <PostGrid
              items={posts}
              emptyMessage={t('explore.map.no_posts')}
              emptySubtext={t('explore.map.no_posts_hint')}
              icon={null}
              aspectRatio="1/1"
              columns="default"
              onLoadMore={() => {
                if (hasNextPage && !isFetchingNextPage) {
                  void fetchNextPage();
                }
              }}
              hasMore={Boolean(hasNextPage)}
              isLoadingMore={isFetchingNextPage}
            />
          )}
        </div>
      </div>
    </MapBottomSheet>
  );
}
