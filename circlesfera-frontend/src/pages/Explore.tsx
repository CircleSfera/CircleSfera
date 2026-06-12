import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Clock, X as CloseIcon, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import SEO from '../components/common/SEO';
import { PostSkeleton } from '../components/LoadingStates';
import PostCard from '../components/PostCard';
import UserAvatar from '../components/UserAvatar';
import VerificationBadge, {
  type VerificationLevel,
} from '../components/VerificationBadge';
import { postsApi, searchApi } from '../services';

interface SearchUserResult {
  id: string;
  verificationLevel?: string;
  mutualCount?: number;
  followedByFriends?: string[];
  profile: {
    username: string;
    fullName: string | null;
    avatar: string | null;
    thumbnailUrl?: string | null;
    standardUrl?: string | null;
  };
}

import type {
  PaginatedResponse,
  Post,
  SearchHistoryItem,
  SearchResult,
} from '../types';

export default function Explore() {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

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

  // Explore Posts Query (Personalized AI Discovery)
  const { data: explorePosts, isLoading: isLoadingExplore } = useQuery<
    PaginatedResponse<Post>
  >({
    queryKey: ['posts', 'explore'],
    queryFn: async () => {
      const res = await postsApi.getExplore(1, 20);
      return res.data;
    },
    enabled: debouncedQuery.length < 2,
  });

  return (
    <div className="pt-24 pb-20 px-4 min-h-screen max-w-6xl mx-auto">
      <SEO
        title="Explore the Universe"
        description="Discover trending posts, local creators, and use our AI-powered search to find exactly what you're looking for on CircleSfera."
      />
      <h1 className="text-3xl font-black mb-6">Explore</h1>

      {/* Search Input */}
      <div className="relative mb-12 max-w-2xl mx-auto group">
        {/* Brand Accent Line for Search */}
        <div className="absolute -top-px left-8 right-8 h-px bg-linear-to-r from-transparent via-brand-primary to-transparent opacity-0 group-focus-within:opacity-100 transition-opacity duration-500" />

        <input
          type="text"
          placeholder="Search users, #tags, or described content..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full px-8 py-5 bg-white/5 border border-white/10 rounded-[24px] text-white placeholder-gray-500 focus:outline-none focus:border-white/20 focus:bg-white/10 backdrop-blur-2xl shadow-2xl transition-all text-lg font-medium"
        />
        <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2">
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="p-1 text-gray-500 hover:text-white transition-colors"
            >
              <CloseIcon size={20} />
            </button>
          )}
          <div className="text-gray-500">
            <svg
              aria-hidden="true"
              className="w-6 h-6"
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
            <div className="text-center text-gray-500 py-10">Searching...</div>
          ) : (
            <div className="space-y-10 max-w-5xl mx-auto">
              {/* AI Semantic Search Results */}
              {debouncedQuery.length >= 3 && (
                <div className="mb-12">
                  <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
                    <Sparkles
                      className="text-brand-primary animate-pulse"
                      size={24}
                    />
                    Búsqueda Inteligente
                    <span className="text-[10px] bg-brand-primary/20 text-brand-primary px-2 py-0.5 rounded-full uppercase tracking-widest font-black ml-2">
                      Beta AI
                    </span>
                  </h2>
                  {isSearching ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {[1, 2, 3].map((id) => (
                        <PostSkeleton key={id} />
                      ))}
                    </div>
                  ) : searchResults?.semanticPosts &&
                    searchResults.semanticPosts.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-4">
                      {searchResults.semanticPosts.map((post: Post) => (
                        <div key={post.id} className="relative group">
                          <PostCard post={post} />
                          <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                            <div className="bg-brand-primary/90 text-white text-[10px] font-bold px-2 py-1 rounded-lg backdrop-blur-sm shadow-xl flex items-center gap-1">
                              <Sparkles size={10} />
                              CONCEPTUAL MATCH
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    !isSearching && (
                      <div className="text-sm text-gray-500 italic px-2">
                        No conceptual matches found for this query...
                      </div>
                    )
                  )}
                </div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
                {/* Users (Left Column) */}
                <div className="lg:col-span-1">
                  <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                    <span className="text-purple-400">@</span> People
                  </h2>
                  {searchResults?.users && searchResults.users.length > 0 ? (
                    <div className="space-y-3">
                      {searchResults.users.map((user: SearchUserResult) => (
                        <Link
                          key={user.id}
                          to={`/${user.profile.username}`}
                          className="glass-panel p-3 rounded-xl flex items-center gap-3 hover:bg-white/10 transition-colors"
                        >
                          <UserAvatar
                            src={user.profile.avatar || undefined}
                            thumbnailUrl={user.profile.thumbnailUrl}
                            standardUrl={user.profile.standardUrl}
                            alt={user.profile.username}
                            size="md"
                            isVerified={user.verificationLevel !== 'BASIC'}
                          />
                          <div className="min-w-0">
                            <div className="font-bold truncate flex items-center gap-1">
                              {user.profile.username}
                              <VerificationBadge
                                level={
                                  user.verificationLevel as VerificationLevel
                                }
                                size={12}
                              />
                            </div>
                            <div className="text-xs text-gray-400 truncate">
                              {user.profile.fullName}
                            </div>
                            {user.followedByFriends &&
                              user.followedByFriends.length > 0 && (
                                <div className="text-[9px] font-bold text-brand-primary uppercase tracking-tighter mt-0.5 truncate opacity-80">
                                  Seguido por {user.followedByFriends[0]}
                                  {user.mutualCount && user.mutualCount > 1
                                    ? ` +${user.mutualCount - 1}`
                                    : ''}
                                </div>
                              )}
                          </div>
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <div className="text-sm text-gray-500">No people found</div>
                  )}
                </div>

                {/* Hashtags (Right Column) */}
                <div className="lg:col-span-2">
                  <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                    <span className="text-blue-400">#</span> Trending Topics
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
                            className="glass-panel px-5 py-2.5 rounded-full flex items-center gap-2 hover:bg-blue-500/20 hover:border-blue-500/50 transition-all group"
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
                    <div className="text-sm text-gray-500">No tags found</div>
                  )}
                </div>
              </div>

              {(!searchResults?.users || searchResults.users.length === 0) &&
                (!searchResults?.hashtags ||
                  searchResults.hashtags.length === 0) &&
                (!searchResults?.semanticPosts ||
                  searchResults.semanticPosts.length === 0) && (
                  <div className="text-center text-gray-500 py-10">
                    No results found for "{debouncedQuery}"
                  </div>
                )}
            </div>
          )}
        </div>
      ) : query.length > 0 ? (
        /* History Prompt or Idle Search state */
        <div className="max-w-2xl mx-auto mb-12 animate-in fade-in slide-in-from-top-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-gray-400 text-sm uppercase px-2">
              Recent Searches
            </h3>
            {searchHistory && searchHistory.length > 0 && (
              <button
                type="button"
                onClick={() => clearHistoryMutation.mutate()}
                className="text-blue-400 hover:text-blue-300 text-sm font-semibold px-2"
              >
                Clear All
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
              <div className="text-center py-8 text-gray-600 bg-white/5 rounded-2xl border border-dashed border-white/10">
                No recent searches
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Explore Grid Mode (Personalized Discovery) */
        <div>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <Sparkles className="text-brand-primary" size={24} />
              Para ti
            </h2>
          </div>

          {isLoadingExplore ? (
            <div className="columns-1 md:columns-2 lg:columns-3 gap-6 space-y-6">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((id) => (
                <div key={id} className="break-inside-avoid mb-6">
                  <PostSkeleton />
                </div>
              ))}
            </div>
          ) : explorePosts?.data && explorePosts.data.length > 0 ? (
            /* Masonry Grid using CSS columns */
            <div className="columns-1 md:columns-2 lg:columns-3 gap-6 space-y-6">
              {explorePosts.data.map((post: Post) => (
                <div key={post.id} className="break-inside-avoid mb-6">
                  <PostCard post={post} />
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center text-gray-500 py-20">
              <p>Descubre contenido nuevo aquí basado en tus gustos.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
