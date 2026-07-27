import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { EmptyState, ErrorState } from '../components/ErrorEmptyStates';
import PostCard from '../components/PostCard';
import { bookmarksApi } from '../services';

export default function Saved() {
  const { t } = useTranslation();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['bookmarks'],
    queryFn: () => bookmarksApi.getAll(1, 50),
  });

  const posts = data?.data?.data || [];

  return (
    <div className="min-h-screen pt-6 pb-24">
      <div className="max-w-lg mx-auto px-4">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Link
            to="/"
            className="p-2 hover:bg-white/10 rounded-full transition-colors"
          >
            <ArrowLeft size={24} className="text-gray-300" />
          </Link>
          <h1 className="text-xl font-bold text-white">
            {t('collections.saved_title')}
          </h1>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full" />
          </div>
        ) : isError ? (
          <ErrorState
            title={t(
              'collections.load_error_title',
              'Could not load saved posts',
            )}
            message={t(
              'collections.load_error_message',
              'Something went wrong. Please try again.',
            )}
            onRetry={() => refetch()}
          />
        ) : posts.length === 0 ? (
          <EmptyState
            icon="posts"
            title={t('collections.no_saved')}
            message={t('collections.no_saved_desc')}
          />
        ) : (
          <div className="space-y-4">
            {posts.map((post) => (
              <PostCard key={post.id} post={post} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
