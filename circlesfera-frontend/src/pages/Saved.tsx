import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { EmptyState, ErrorState } from '../components/ErrorEmptyStates';
import { LoadingSpinner } from '../components/LoadingStates';
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
    <div className="min-h-dvh pt-2 md:pt-6 pb-20">
      <div className="max-w-117.5 mx-auto px-4">
        {/* Header — Design System §6.4 */}
        <div className="flex items-center gap-3 mb-4 py-1">
          <Link
            to="/"
            className="w-11 h-11 flex items-center justify-center hover:bg-white/8 rounded-xl text-white/60 hover:text-white transition-colors"
            aria-label="Volver al inicio"
          >
            <ArrowLeft size={20} />
          </Link>
          <h1 className="text-lg font-bold text-white tracking-tight">
            {t('collections.saved_title')}
          </h1>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-10">
            <LoadingSpinner size="lg" />
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
          /* 12px spacing between posts */
          <div className="space-y-3">
            {posts.map((post) => (
              <PostCard key={post.id} post={post} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
