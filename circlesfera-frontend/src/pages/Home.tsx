import { useInfiniteQuery } from '@tanstack/react-query';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import { motion } from 'framer-motion';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import SEO from '../components/common/SEO';
import { ErrorState } from '../components/ErrorEmptyStates';
import {
  LoadingSpinner,
  PostSkeleton,
  StorySkeleton,
} from '../components/LoadingStates';
import PostCard from '../components/PostCard';
import StoryList from '../components/StoryList';
import { SuggestionsList } from '../components/suggestions/SuggestionsList';
import { PullToRefresh } from '../components/ui';
import { useInfiniteScroll } from '../hooks/useInfiniteScroll';
import { feedApi } from '../services';
import { useAuthStore } from '../stores/authStore';
import type { PaginatedResponse, Post } from '../types';

export default function Home() {
  const { t } = useTranslation();
  const { isAuthenticated } = useAuthStore();
  const [activeTab, setActiveTab] = useState<'foryou' | 'following'>('foryou');

  const {
    data,
    isLoading,
    isError,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery<PaginatedResponse<Post>>({
    queryKey: ['feed', activeTab],
    queryFn: async ({ pageParam }) => {
      const res =
        activeTab === 'foryou'
          ? await feedApi.getForYou(pageParam as number)
          : await feedApi.getFollowing(pageParam as number);
      return res.data;
    },
    getNextPageParam: (lastPage) => {
      if (lastPage.meta.page < lastPage.meta.totalPages) {
        return lastPage.meta.page + 1;
      }
      return undefined;
    },
    initialPageParam: 1,
    enabled: activeTab === 'foryou' || isAuthenticated,
  });

  const posts = data?.pages.flatMap((page) => page.data) ?? [];
  const virtualizer = useWindowVirtualizer({
    count: posts.length,
    estimateSize: () => 600, // Estimated height of a post card
    overscan: 2,
  });

  const loadMoreRef = useInfiniteScroll(
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  );

  const handleRefresh = async () => {
    await refetch();
  };

  return (
    <PullToRefresh onRefresh={handleRefresh}>
      <div className="min-h-screen pt-4 md:pt-8 pb-32">
        <SEO title={t('feed.home_title')} />

        <div className="max-w-md lg:max-w-3xl 2xl:max-w-4xl mx-auto px-3">
          <div className="flex flex-col lg:flex-row gap-6 items-start justify-center">
            {/* Main Feed Column */}
            <div className="flex-1 w-full max-w-117.5 shrink-0">
              {/* Header Title - Hidden on mobile as TopNav replaces it */}
              <h1 className="hidden md:block w-full text-xl md:text-2xl font-black text-center mb-4 tracking-tight bg-clip-text text-transparent bg-linear-to-r from-white via-white/80 to-white/40">
                {t('feed.brand_name')}
              </h1>
              {/* Feed Tabs */}
              <div className="flex justify-center mb-4">
                <div className="flex items-center gap-1 bg-black/40 backdrop-blur-xl border border-white/10 rounded-full p-1 shadow-xl relative z-20">
                  <button
                    type="button"
                    onClick={() => setActiveTab('foryou')}
                    className={`px-6 py-1.5 rounded-full text-xs font-bold transition-all duration-300 relative focus:outline-none ${
                      activeTab === 'foryou'
                        ? 'text-white'
                        : 'text-gray-400 hover:text-gray-200'
                    }`}
                  >
                    {activeTab === 'foryou' && (
                      <motion.div
                        layoutId="activeTabIndicator"
                        className="absolute inset-0 bg-white/10 rounded-full shadow-md z-[-1]"
                        transition={{
                          type: 'spring',
                          stiffness: 380,
                          damping: 30,
                        }}
                      />
                    )}
                    <span className="relative z-10">
                      {t('feed.foryou', 'Para Ti')}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('following')}
                    className={`px-6 py-1.5 rounded-full text-xs font-bold transition-all duration-300 relative focus:outline-none ${
                      activeTab === 'following'
                        ? 'text-white'
                        : 'text-gray-400 hover:text-gray-200'
                    }`}
                  >
                    {activeTab === 'following' && (
                      <motion.div
                        layoutId="activeTabIndicator"
                        className="absolute inset-0 bg-white/10 rounded-full shadow-md z-[-1]"
                        transition={{
                          type: 'spring',
                          stiffness: 380,
                          damping: 30,
                        }}
                      />
                    )}
                    <span className="relative z-10">
                      {t('feed.following', 'Siguiendo')}
                    </span>
                  </button>
                </div>
              </div>

              {/* Stories Section */}
              {isLoading ? (
                <div className="glass-panel rounded-lg p-3 mb-4 flex gap-3 overflow-hidden">
                  {['s1', 's2', 's3', 's4', 's5', 's6'].map((id) => (
                    <StorySkeleton key={id} />
                  ))}
                </div>
              ) : (
                <StoryList />
              )}

              {/* Suggestions inline on mobile */}
              <div className="lg:hidden mb-4">
                <SuggestionsList layout="horizontal" />
              </div>

              {/* Posts List */}
              <div className="space-y-3">
                {!isAuthenticated && activeTab === 'following' ? (
                  <div className="text-center py-5 glass-panel rounded-lg px-4 mx-auto max-w-sm mb-4">
                    <p className="text-zinc-400 text-xs">
                      {t(
                        'feed.login_required',
                        'Inicia sesión para ver tu feed personalizado.',
                      )}
                    </p>
                  </div>
                ) : isLoading ? (
                  ['p1', 'p2', 'p3'].map((id) => <PostSkeleton key={id} />)
                ) : isError ? (
                  <ErrorState
                    title={t('feed.error_title', "Couldn't load feed")}
                    message={t(
                      'feed.error_message',
                      'Something went wrong while loading posts. Please try again.',
                    )}
                    onRetry={() => refetch()}
                  />
                ) : posts.length === 0 ? (
                  <div className="text-center py-5 glass-panel rounded-lg px-4 mx-auto max-w-sm mb-4">
                    <p className="text-zinc-400 text-xs">
                      {t('feed.no_posts')}
                    </p>
                  </div>
                ) : (
                  <>
                    <div
                      style={{
                        height: `${virtualizer.getTotalSize()}px`,
                        width: '100%',
                        position: 'relative',
                      }}
                    >
                      {virtualizer.getVirtualItems().map((virtualItem) => {
                        const post = posts[virtualItem.index];
                        return (
                          <motion.div
                            key={post.id}
                            ref={virtualizer.measureElement}
                            data-index={virtualItem.index}
                            initial={{ opacity: 0, y: 20, scale: 0.97 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            transition={{
                              type: 'spring',
                              stiffness: 400,
                              damping: 30,
                              delay: Math.min(
                                (virtualItem.index % 10) * 0.08,
                                0.4,
                              ),
                            }}
                            style={{
                              position: 'absolute',
                              top: `${virtualItem.start}px`,
                              left: 0,
                              width: '100%',
                            }}
                          >
                            <PostCard
                              post={post}
                              priority={virtualItem.index === 0}
                            />
                          </motion.div>
                        );
                      })}
                    </div>
                    <div ref={loadMoreRef} className="h-1" aria-hidden="true" />
                    {isFetchingNextPage && (
                      <div className="flex justify-center py-4">
                        <LoadingSpinner size="md" />
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Right Sidebar Suggestions (Desktop Only) */}
            <aside className="hidden lg:block w-70 sticky top-20 shrink-0">
              <SuggestionsList layout="vertical" />
            </aside>
          </div>
        </div>
      </div>
    </PullToRefresh>
  );
}
