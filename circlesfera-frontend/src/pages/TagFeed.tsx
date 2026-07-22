import { useInfiniteQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import Masonry from 'react-masonry-css';
import { useParams } from 'react-router-dom';
import { ErrorState } from '../components/ErrorEmptyStates';
import { LoadingSpinner } from '../components/LoadingStates';
import PostCard from '../components/PostCard';
import { useInfiniteScroll } from '../hooks/useInfiniteScroll';
import LayoutWrapper from '../layouts/LayoutWrapper';
import { postsApi } from '../services';
import type { PaginatedResponse, Post } from '../types';

export default function TagFeed() {
  const { t } = useTranslation();
  const { tag } = useParams<{ tag: string }>();

  const {
    data,
    isLoading,
    isError,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery<PaginatedResponse<Post>>({
    queryKey: ['posts', 'tag', tag],
    queryFn: async ({ pageParam }) => {
      const res = await postsApi.getByTag(tag!, pageParam as number);
      return res.data;
    },
    getNextPageParam: (lastPage) => {
      if (lastPage.meta.page < lastPage.meta.totalPages) {
        return lastPage.meta.page + 1;
      }
      return undefined;
    },
    initialPageParam: 1,
    enabled: !!tag,
  });

  const posts = data?.pages.flatMap((page) => page.data) ?? [];
  const loadMoreRef = useInfiniteScroll(
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  );

  const breakpointColumnsObj = {
    default: 3,
    1100: 2,
    700: 1,
  };

  return (
    <LayoutWrapper>
      <div className="pt-24 pb-20 px-4 min-h-screen max-w-6xl mx-auto">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-black mb-2 text-transparent bg-clip-text bg-linear-to-r from-blue-400 to-purple-400">
            #{tag}
          </h1>
          <p className="text-gray-300">{t('post.tag_feed.discover')}</p>
        </div>

        {isLoading ? (
          <div className="flex justify-center p-8">
            <LoadingSpinner size="lg" />
          </div>
        ) : isError ? (
          <ErrorState
            title={t('post.tag_feed.error_title', "Couldn't load tag feed")}
            message={t(
              'post.tag_feed.error_message',
              'Something went wrong while loading posts. Please try again.',
            )}
            onRetry={() => refetch()}
          />
        ) : posts.length === 0 ? (
          <div className="text-center py-20 opacity-50">
            <p className="text-xl font-medium">
              {t('post.tag_feed.no_posts')} #{tag}
            </p>
          </div>
        ) : (
          <>
            <Masonry
              breakpointCols={breakpointColumnsObj}
              className="flex w-auto -ml-6"
              columnClassName="pl-6 bg-clip-padding"
            >
              {posts.map((post) => (
                <PostCard key={post.id} post={post} />
              ))}
            </Masonry>
            <div ref={loadMoreRef} className="h-1" aria-hidden="true" />
            {isFetchingNextPage && (
              <div className="flex justify-center py-8">
                <LoadingSpinner size="md" />
              </div>
            )}
          </>
        )}
      </div>
    </LayoutWrapper>
  );
}
