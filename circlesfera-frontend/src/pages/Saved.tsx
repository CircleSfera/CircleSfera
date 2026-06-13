import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Bookmark } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import PostCard from '../components/PostCard';
import { bookmarksApi } from '../services';

export default function Saved() {
  const { t } = useTranslation();
  const { data, isLoading } = useQuery({
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
            <ArrowLeft size={24} className="text-gray-400" />
          </Link>
          <h1 className="text-xl font-bold text-white">
            {t('collections.saved_title')}
          </h1>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full" />
          </div>
        ) : posts.length === 0 ? (
          <div className="text-center py-16">
            <Bookmark size={64} className="mx-auto mb-4 text-gray-600" />
            <h2 className="text-xl font-semibold text-white mb-2">
              {t('collections.no_saved')}
            </h2>
            <p className="text-gray-400">{t('collections.no_saved_desc')}</p>
          </div>
        ) : (
          <div className="space-y-6">
            {posts.map((post) => (
              <PostCard key={post.id} post={post} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
