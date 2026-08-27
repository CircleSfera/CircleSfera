import type { ProfileWithUser } from '@circlesfera/shared';
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Clock, X as CloseIcon, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import SEO from '../components/common/SEO';
import { ErrorState } from '../components/ErrorEmptyStates';
import ExploreColdStart from '../components/explore/ExploreColdStart';
import { LoadingSpinner, PostSkeleton } from '../components/LoadingStates';
import PostCard from '../components/PostCard';
import UserAvatar from '../components/UserAvatar';
import { PullToRefresh } from '../components/ui';
import VerificationBadge, {
  type VerificationLevel,
} from '../components/VerificationBadge';
import { useInfiniteScroll } from '../hooks/useInfiniteScroll';
import { feedApi, postsApi, searchApi } from '../services';
import type {
  PaginatedResponse,
  Post,
  SearchHistoryItem,
  SearchResult,
} from '../types';

export default function Explore() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'foryou' | 'trending'>('foryou');

  // Debounce query
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(timer);
  }, [query]);

  // Search History query
  const { data: searchHistory } = useQuery<SearchHistoryItem[]>({
    queryKey: ['searchHistory'],
    queryFn: async () => {
      const res = await searchApi.getHistory();
      return res.data;
    },
    enabled: query.length === 0,
  });

  // Clear History mutation
  const clearHistoryMutation = useMutation({
    mutationFn: () => searchApi.clearHistory(),
    onSuccess: () => {
      queryClient.setQueryData(['searchHistory'], []);
    },
  });

  // Standard Search Query (Combined Users, Tags, and AI Semantic Posts)
  const { data: searchResults, isLoading: isSearching } =
    useQuery<SearchResult | null>({
      queryKey: ['search', debouncedQuery],
      queryFn: async () => {
        if (debouncedQuery.length < 2) return null;
        const res = await searchApi.search(debouncedQuery);
        // Invalidate history after a successful search is recorded (backend does this)
        queryClient.invalidateQueries({ queryKey: ['searchHistory'] });
        return res.data;
      },
      enabled: debouncedQuery.length >= 2,
    });

  // Explore Posts Query (Personalized AI Discovery or Trending)
  const {
    data: explorePosts,
    isLoading: isLoadingExplore,
    isError: isExploreError,
    refetch: refetchExplore,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery<PaginatedResponse<Post>>({
    queryKey: ['posts', 'explore', activeTab],
    queryFn: async ({ pageParam }) => {
      const page = pageParam as number;
      const res =
        activeTab === 'foryou'
          ? await feedApi.getForYou(page, 20)
          : await postsApi.getAll(page, 20, 'trending');
      return res.data;
    },
    getNextPageParam: (lastPage) => {
      if (lastPage.meta.page < lastPage.meta.totalPages) {
        return lastPage.meta.page + 1;
      }
      return undefined;
    },
    initialPageParam: 1,
    enabled: debouncedQuery.length < 2,
  });

  const explorePostList =
    explorePosts?.pages.flatMap((page) => page.data) ?? [];
  const loadMoreRef = useInfiniteScroll(
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  );

  const handleRefresh = async () => {
    if (debouncedQuery.length >= 2) {
      // Ignore refresh in search mode, or you can refetch searchResults
    } else {
      await refetchExplore();
    }
  };

  return (
    <PullToRefresh onRefresh={handleRefresh}>
      <div className="pt-2 md:pt-6 pb-20 px-4 md:px-5 lg:px-6 min-h-dvh max-w-6xl 2xl:max-w-7xl mx-auto">
        <SEO
          title={t('explore.page_title')}
          description={t('explore.page_desc')}
        />

        {/* Search Input — Design System §9.3: Search input 44–48px */}
        <div className="relative mb-3 md:mb-6 max-w-2xl mx-auto group">
          <div className="absolute -top-px left-8 right-8 h-px bg-linear-to-r from-transparent via-brand-primary to-transparent opacity-0 group-focus-within:opacity-100 transition-opacity duration-500" />

          <input
            type="text"
            placeholder={t(
              'explore.search_placeholder',
              'Buscar personas, etiquetas o describir lo que buscas…',
            )}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="input-glass w-full pl-5 pr-12 rounded-xl text-white placeholder-gray-500 text-sm font-medium transition-all"
            style={{ height: 'var(--input-height-search, 48px)' }}
          />
          <div className="absolute right-3.5 top-1/2 -translate-y-1/2 flex items-center gap-2">
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="p-1 text-gray-400 hover:text-white transition-colors"
                aria-label="Limpiar búsqueda"
              >
                <CloseIcon size={18} />
              </button>
            )}
            <div className="text-gray-500">
              <svg
                aria-hidden="true"
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            </div>
          </div>
        </div>

        {/* Content Area */}
        {debouncedQuery.length >= 2 ? (
          /* Search Results Mode */
          <div>
            {isSearching && !searchResults ? (
              <div className="text-center text-gray-500 py-10">
                {t('explore.searching')}
              </div>
            ) : (
              <div className="space-y-10 max-w-5xl 2xl:max-w-7xl mx-auto">
                {/* AI Semantic Search Results */}
                {debouncedQuery.length >= 3 && (
                  <div className="mb-12">
                    <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
                      <Sparkles
                        className="text-brand-primary animate-pulse"
                        size={24}
                      />
                      {t('explore.smart_search')}
                      <span className="text-xs bg-brand-primary/20 text-brand-primary px-2 py-0.5 rounded-full uppercase tracking-wide font-black ml-2">
                        {t('explore.beta_ai')}
                      </span>
                    </h2>
                    {isSearching ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-1">
                        {[1, 2, 3].map((id) => (
                          <PostSkeleton key={id} />
                        ))}
                      </div>
                    ) : searchResults?.semanticPosts &&
                      searchResults.semanticPosts.length > 0 ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-1 animate-in fade-in slide-in-from-bottom-4">
                        {searchResults.semanticPosts.map((post: Post) => (
                          <div key={post.id} className="relative group">
                            <PostCard post={post} />
                            <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                              <div className="bg-brand-primary/90 text-white text-xs font-bold px-2 py-1 rounded-lg backdrop-blur-sm shadow-xl flex items-center gap-1">
                                <Sparkles size={10} />
                                {t('explore.conceptual_match')}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      !isSearching && (
                        <div className="text-sm text-gray-500 italic px-2">
                          {t('explore.no_conceptual_matches')}
                        </div>
                      )
                    )}
                  </div>
                )}

                {/* AI Semantic Profiles */}
                {debouncedQuery.length >= 3 &&
                  searchResults?.semanticProfiles &&
                  searchResults.semanticProfiles.length > 0 && (
                    <div className="mb-10">
                      <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                        <Sparkles className="text-sky-400" size={22} />
                        {t('explore.smart_people', 'People matching your idea')}
                        <span className="text-xs bg-sky-500/20 text-sky-300 px-2 py-0.5 rounded-full uppercase tracking-wide font-black ml-2">
                          {t('explore.beta_ai')}
                        </span>
                      </h2>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1">
                        {searchResults.semanticProfiles.map((profile: any) => (
                          <Link
                            key={profile.id}
                            to={`/${profile.username}`}
                            className="glass-panel p-3 rounded-xl flex items-center gap-3 hover:bg-white/10 transition-colors"
                          >
                            <UserAvatar
                              src={profile.avatar || undefined}
                              thumbnailUrl={profile.thumbnailUrl}
                              standardUrl={profile.standardUrl}
                              alt={profile.username}
                              size="md"
                              verificationLevel={
                                profile.user
                                  ?.verificationLevel as VerificationLevel
                              }
                            />
                            <div className="min-w-0">
                              <div className="font-bold truncate flex items-center gap-1">
                                {profile.username}
                                <VerificationBadge
                                  level={
                                    profile.user
                                      ?.verificationLevel as VerificationLevel
                                  }
                                  size={12}
                                />
                              </div>
                              <div className="text-xs text-gray-300 truncate">
                                {profile.fullName}
                              </div>
                              {typeof profile.similarityScore === 'number' && (
                                <div className="text-[10px] font-bold text-sky-400 uppercase tracking-wide mt-0.5">
                                  {t('explore.match', 'Match')}{' '}
                                  {Math.round(profile.similarityScore * 100)}%
                                </div>
                              )}
                            </div>
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
                  {/* Users (Left Column) */}
                  <div className="lg:col-span-1">
                    <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                      <span className="text-purple-400">@</span>{' '}
                      {t('explore.people')}
                    </h2>
                    {searchResults?.users && searchResults.users.length > 0 ? (
                      <div className="space-y-3">
                        {searchResults.users.map((user: ProfileWithUser) => (
                          <Link
                            key={user.id}
                            to={`/${user.username}`}
                            className="glass-panel p-3 rounded-xl flex items-center gap-3 hover:bg-white/10 transition-colors"
                          >
                            <UserAvatar
                              src={user.avatar || undefined}
                              thumbnailUrl={user.thumbnailUrl}
                              standardUrl={user.standardUrl}
                              alt={user.username}
                              size="md"
                              verificationLevel={
                                user.user
                                  ?.verificationLevel as VerificationLevel
                              }
                            />
                            <div className="min-w-0">
                              <div className="font-bold truncate flex items-center gap-1">
                                {user.username}
                                <VerificationBadge
                                  level={
                                    user.user
                                      ?.verificationLevel as VerificationLevel
                                  }
                                  size={12}
                                />
                              </div>
                              <div className="text-xs text-gray-300 truncate">
                                {user.fullName}
                              </div>
                              {(user as any).followedByFriends &&
                                (user as any).followedByFriends.length > 0 && (
                                  <div className="text-xs font-bold text-brand-primary uppercase tracking-tighter mt-0.5 truncate opacity-80">
                                    {t('explore.followed_by')}{' '}
                                    {(user as any).followedByFriends[0]}
                                    {(user as any).mutualCount &&
                                    (user as any).mutualCount > 1
                                      ? ` +${(user as any).mutualCount - 1}`
                                      : ''}
                                  </div>
                                )}
                            </div>
                          </Link>
                        ))}
                      </div>
                    ) : (
                      <div className="text-sm text-gray-500">
                        {t('explore.no_people_found')}
                      </div>
                    )}
                  </div>

                  {/* Hashtags (Right Column) */}
                  <div className="lg:col-span-2">
                    <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                      <span className="text-blue-400">#</span>{' '}
                      {t('explore.trending_topics')}
                    </h2>
                    {searchResults?.hashtags &&
                    searchResults.hashtags.length > 0 ? (
                      <div className="flex flex-wrap gap-3">
                        {searchResults.hashtags.map(
                          (tag: {
                            id: string;
                            tag: string;
                            postCount: number;
                          }) => (
                            <Link
                              key={tag.id}
                              to={`/explore/tags/${tag.tag}`}
                              className="glass-panel px-4 py-2 rounded-full flex items-center gap-2 hover:bg-blue-500/20 hover:border-blue-500/50 transition-all group"
                            >
                              <span className="text-blue-400 group-hover:text-blue-300 font-bold">
                                #{tag.tag}
                              </span>
                              <span className="text-xs text-gray-500 group-hover:text-gray-300">
                                {tag.postCount}
                              </span>
                            </Link>
                          ),
                        )}
                      </div>
                    ) : (
                      <div className="text-sm text-gray-500">
                        {t('explore.no_tags_found')}
                      </div>
                    )}
                  </div>
                </div>

                {(!searchResults?.users || searchResults.users.length === 0) &&
                  (!searchResults?.hashtags ||
                    searchResults.hashtags.length === 0) &&
                  (!searchResults?.semanticPosts ||
                    searchResults.semanticPosts.length === 0) &&
                  (!searchResults?.semanticProfiles ||
                    searchResults.semanticProfiles.length === 0) && (
                    <div className="text-center text-gray-500 py-10">
                      {t('explore.no_results')} "{debouncedQuery}"
                    </div>
                  )}
              </div>
            )}
          </div>
        ) : query.length > 0 ? (
          /* History Prompt or Idle Search state */
          <div className="max-w-2xl mx-auto mb-12 animate-in fade-in slide-in-from-top-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-gray-300 text-sm uppercase px-2">
                {t('explore.recent_searches')}
              </h3>
              {searchHistory && searchHistory.length > 0 && (
                <button
                  type="button"
                  onClick={() => clearHistoryMutation.mutate()}
                  className="text-blue-400 hover:text-blue-300 text-sm font-semibold px-2"
                >
                  {t('explore.clear_all')}
                </button>
              )}
            </div>
            <div className="space-y-1">
              {searchHistory?.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  onClick={() => setQuery(item.query)}
                  className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 transition-colors text-left group"
                >
                  <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center group-hover:bg-purple-500/20 transition-colors">
                    <Clock
                      size={18}
                      className="text-gray-500 group-hover:text-purple-400"
                    />
                  </div>
                  <span className="text-white flex-1 font-medium">
                    {item.query}
                  </span>
                </button>
              ))}
              {(!searchHistory || searchHistory.length === 0) && (
                <div className="text-center py-8 text-gray-600 bg-white/5 rounded-lg border border-dashed border-white/10">
                  {t('explore.no_recent_searches')}
                </div>
              )}
            </div>
          </div>
        ) : (
          /* Explore Grid Mode (Personalized Discovery) */
          <div>
            <div className="flex justify-center mb-4 md:mb-8">
              <div className="inline-flex items-center p-1 md:p-1.5 rounded-full bg-black/75 border border-white/12 shadow-2xl backdrop-blur-md gap-1">
                {(['foryou', 'trending'] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setActiveTab(tab)}
                    className={`relative px-4 py-1.5 md:px-6 md:py-2 text-xs font-bold rounded-full transition-all duration-200 focus:outline-none ${
                      activeTab === tab
                        ? 'text-white'
                        : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    {activeTab === tab && (
                      <motion.div
                        layoutId="exploreTabPill"
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
                        ? t('explore.for_you', 'Para ti')
                        : t('explore.trending', 'Tendencias')}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {isLoadingExplore ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-1 max-w-5xl 2xl:max-w-7xl mx-auto">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((id) => (
                  <div key={id} className="break-inside-avoid mb-2.5 md:mb-6">
                    <PostSkeleton />
                  </div>
                ))}
              </div>
            ) : isExploreError ? (
              <ErrorState
                title={t('explore.error_title', "Couldn't load explore")}
                message={t(
                  'explore.error_message',
                  'Something went wrong while loading posts. Please try again.',
                )}
                onRetry={() => refetchExplore()}
              />
            ) : explorePostList.length > 0 ? (
              /* Masonry Grid using CSS columns */
              <>
                <div className="columns-1 md:columns-2 lg:columns-3 2xl:columns-4 gap-1 space-y-1">
                  {explorePostList.map((post: Post) => (
                    <div
                      key={post.id}
                      className="break-inside-avoid mb-2.5 md:mb-6"
                    >
                      <PostCard post={post} />
                    </div>
                  ))}
                </div>
                <div ref={loadMoreRef} className="h-1" aria-hidden="true" />
                {isFetchingNextPage && (
                  <div className="flex justify-center py-8">
                    <LoadingSpinner size="md" />
                  </div>
                )}
              </>
            ) : (
              <ExploreColdStart
                activeTab={activeTab}
                setActiveTab={setActiveTab}
              />
            )}
          </div>
        )}
      </div>
    </PullToRefresh>
  );
}
