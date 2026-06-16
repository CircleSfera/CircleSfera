import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import CommentList from '../components/CommentList';
import PostCard from '../components/PostCard';
import { commentsApi, postsApi } from '../services';

export default function PostDetail() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();

  const { data: post, isLoading } = useQuery({
    queryKey: ['post', id],
    queryFn: () => postsApi.getById(id!),
    enabled: !!id,
  });

  const { data: comments } = useQuery({
    queryKey: ['comments', id],
    queryFn: () => commentsApi.getByPost(id!),
    enabled: !!id,
  });

  if (isLoading || !post) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-24 md:pt-6">
      <div className="w-full md:max-w-lg mx-auto">
        {/* Sticky Header (Mobile Only) */}
        <div className="md:hidden sticky top-0 z-50 bg-black/80 backdrop-blur-xl border-b border-white/10 flex items-center justify-between p-4 pt-[calc(1rem+env(safe-area-inset-top))]">
          <Link
            to="/"
            className="p-1 -ml-1 text-white hover:bg-white/10 rounded-full transition-colors"
          >
            <ArrowLeft size={24} />
          </Link>
          <h1 className="text-base font-bold text-white uppercase tracking-wider">
            {t('post.detail.title', 'Publicación')}
          </h1>
          <div className="w-6" /> {/* Spacer for centering */}
        </div>

        {/* Back Button (Desktop) */}
        <Link
          to="/"
          className="hidden md:inline-flex items-center gap-2 text-gray-400 hover:text-white mb-4 transition-colors text-sm px-4"
        >
          <ArrowLeft size={18} />
          <span>{t('post.detail.back_to_feed')}</span>
        </Link>

        {/* Post Card */}
        <PostCard post={post.data} />

        {/* Comments Section */}
        <div className="md:mt-4 md:glass-panel-post md:rounded-2xl p-4 bg-black/50 border-t border-white/5 md:border-none">
          <h2 className="text-base font-bold text-white mb-4 flex items-center gap-2">
            <span>{t('post.detail.comments')}</span>
            <span className="text-sm font-normal text-gray-400">
              ({comments?.data.data.length || 0})
            </span>
          </h2>
          {id && (
            <CommentList postId={id} comments={comments?.data.data || []} />
          )}
        </div>
      </div>
    </div>
  );
}
