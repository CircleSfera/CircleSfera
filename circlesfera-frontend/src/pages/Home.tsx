import { useInfiniteQuery } from '@tanstack/react-query';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import { motion } from 'framer-motion';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import logoSrc from '../assets/logo.png';
import SEO from '../components/common/SEO';
import { EmptyState, ErrorState } from '../components/ErrorEmptyStates';
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

/**
 * Home — Layout Guidelines §11 (Feed Screen)
 * Mobile: single column, full-width
 * Desktop: feed column (max 470px) + right sidebar
 * Feed tabs: Para Ti / Siguiendo
 * Stories strip above feed
 * High information density: spacing between posts 12–16px
 */
export default function Home() {
  const { t } = useTranslation();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
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
    estimateSize: () => 560,
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
      {/* Layout Guidelines §11 — Feed: full-width mobile, with desktop right sidebar */}
      <div className="min-h-dvh pt-[calc(var(--nav-top-height,60px)+4px)] md:pt-0 pb-24 md:pb-8">
        <SEO title={t('feed.home_title')} />

        <div className="flex items-start justify-center gap-6 px-0 md:px-3 max-w-5xl mx-auto">
          {/* ── Main Feed Column ── */}
          <div className="flex-1 w-full min-w-0" style={{ maxWidth: 470 }}>
            {/* Header Logo — Larger, centered, elegant vertical breathing room (desktop only to prevent duplication with mobile TopNav) */}
            <div className="pt-6 pb-3 hidden md:flex justify-center items-center">
              <Link
                to="/"
                className="flex items-center gap-2.5 group focus:outline-none"
              >
                <img
                  src={logoSrc}
                  alt="CircleSfera"
                  className="h-8 w-auto object-contain transition-transform duration-300 group-hover:scale-105 drop-shadow-[0_0_12px_rgba(140,82,255,0.4)]"
                />
                <span className="brand-wordmark text-2xl sm:text-3xl font-black tracking-tight">
                  CircleSfera
                </span>
              </Link>
            </div>

            {/* Feed Header — Centered Floating Glass Pill Switcher */}
            <div className="sticky top-[calc(var(--nav-top-height,60px))] md:top-0 z-30 py-2.5 px-4 flex justify-center backdrop-blur-md">
              <div className="inline-flex items-center p-1.5 rounded-full bg-black/75 border border-white/12 shadow-2xl backdrop-blur-md gap-1.5">
                {(['foryou', 'following'] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setActiveTab(tab)}
                    className={`relative px-6 py-2 text-xs font-bold rounded-full transition-all duration-200 focus:outline-none ${
                      activeTab === tab
                        ? 'text-white'
                        : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    {activeTab === tab && (
                      <motion.div
                        layoutId="feedTabPill"
                        className="absolute inset-0 rounded-full bg-white/15 border border-white/20 shadow-inner"
                        transition={{
                          type: 'spring',
                          stiffness: 500,
                          damping: 35,
                        }}
                      />
                    )}
                    <span className="relative z-10">
                      {tab === 'foryou'
                        ? t('feed.foryou', 'Para ti')
                        : t('feed.following', 'Siguiendo')}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Stories strip — rounded card container */}
            {isLoading ? (
              <div className="my-3 rounded-2xl p-3.5 border border-white/10 bg-white/3 flex gap-3 overflow-hidden">
                {['s1', 's2', 's3', 's4', 's5'].map((id) => (
                  <StorySkeleton key={id} />
                ))}
              </div>
            ) : (
              <StoryList />
            )}

            {/* Horizontal suggestions on mobile */}
            <div className="lg:hidden px-3 pt-3 pb-1">
              <SuggestionsList layout="horizontal" />
            </div>

            {/* Post list */}
            <div>
              {!isAuthenticated && activeTab === 'following' ? (
                <div className="px-3 pt-3">
                  <EmptyState
                    icon="followers"
                    title={t('feed.login_required_title', 'Inicia sesión')}
                    message={t(
                      'feed.login_required',
                      'Inicia sesión para ver tu feed personalizado de los creadores que sigues.',
                    )}
                  />
                </div>
              ) : isLoading ? (
                <div className="space-y-3 pt-3 px-3">
                  {['p1', 'p2', 'p3'].map((id) => (
                    <PostSkeleton key={id} />
                  ))}
                </div>
              ) : isError ? (
                <div className="px-3 pt-3">
                  <ErrorState
                    title={t('feed.error_title', "Couldn't load feed")}
                    message={t(
                      'feed.error_message',
                      'Something went wrong while loading posts. Please try again.',
                    )}
                    onRetry={() => refetch()}
                  />
                </div>
              ) : posts.length === 0 ? (
                <div className="px-3 pt-3">
                  <EmptyState
                    icon="posts"
                    title={
                      activeTab === 'following'
                        ? t(
                            'feed.no_following_posts_title',
                            'Aún no sigues a nadie o no hay publicaciones',
                          )
                        : t(
                            'feed.no_posts_title',
                            'Sin publicaciones recientes',
                          )
                    }
                    message={
                      activeTab === 'following'
                        ? t(
                            'feed.no_following_posts_desc',
                            'Explora creadores sugeridos a la derecha o pasa a "Para ti" para descubrir contenido trending.',
                          )
                        : t('feed.no_posts')
                    }
                    action={
                      activeTab === 'following'
                        ? {
                            label: t('feed.switch_to_foryou', 'Ir a Para ti'),
                            onClick: () => setActiveTab('foryou'),
                          }
                        : undefined
                    }
                  />
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
                        <div
                          key={post.id}
                          ref={virtualizer.measureElement}
                          data-index={virtualItem.index}
                          style={{
                            position: 'absolute',
                            top: `${virtualItem.start}px`,
                            left: 0,
                            width: '100%',
                            /* 12–16px gap between posts per §11 */
                            paddingBottom: 'var(--space-md, 12px)',
                          }}
                        >
                          <PostCard
                            post={post}
                            priority={virtualItem.index === 0}
                          />
                        </div>
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

          {/* ── Right Sidebar (Desktop ≥1024px) ── */}
          <aside
            className="hidden lg:block shrink-0"
            style={{ width: 280, position: 'sticky', top: 80 }}
          >
            <SuggestionsList layout="vertical" />
          </aside>
        </div>
      </div>
    </PullToRefresh>
  );
}
