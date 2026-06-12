import { useQuery } from '@tanstack/react-query';
import SEO from '../components/common/SEO';
import { PostSkeleton, StorySkeleton } from '../components/LoadingStates';
import PostCard from '../components/PostCard';
import StoryList from '../components/StoryList';
import { SuggestionsList } from '../components/suggestions/SuggestionsList';
import { postsApi } from '../services';

export default function Home() {
  const { data, isLoading } = useQuery({
    queryKey: ['feed'],
    queryFn: () => postsApi.getFeed(),
  });

  return (
    <div className="min-h-screen pt-4 md:pt-8 pb-32">
      <SEO title="Inicio" />
      {/* Header Title - Hidden on mobile as TopNav replaces it */}
      <h1 className="hidden md:block text-4xl md:text-5xl font-black text-center mb-8 tracking-tighter bg-clip-text text-transparent bg-linear-to-r from-brand-secondary via-brand-primary to-brand-blue animate-gradient-x bg-size-[200%_auto]">
        CircleSfera
      </h1>

      <div className="max-w-lg mx-auto px-4">
        {/* Stories Section */}
        {isLoading ? (
          <div className="glass-panel rounded-2xl p-4 mb-6 flex gap-4 overflow-hidden">
            {['s1', 's2', 's3', 's4', 's5', 's6'].map((id) => (
              <StorySkeleton key={id} />
            ))}
          </div>
        ) : (
          <StoryList />
        )}

        <SuggestionsList />

        {/* Posts Feed - Instagram style single column */}
        <div className="space-y-6">
          {isLoading ? (
            ['p1', 'p2', 'p3'].map((id) => <PostSkeleton key={id} />)
          ) : data?.data.data.length === 0 ? (
            <div className="text-center py-12 glass-panel rounded-2xl p-8">
              <p className="text-gray-400">
                No posts yet. Explore to find creators!
              </p>
            </div>
          ) : (
            data?.data.data.map((post) => (
              <PostCard key={post.id} post={post} />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
