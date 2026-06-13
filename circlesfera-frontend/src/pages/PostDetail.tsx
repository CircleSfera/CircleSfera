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
    <div className="min-h-screen pt-6 pb-24">
      <div className="max-w-lg mx-auto px-4">
        {/* Back Button */}
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-gray-400 hover:text-white mb-4 transition-colors text-sm"
        >
          <ArrowLeft size={18} />
          <span>{t('post.detail.back_to_feed')}</span>
        </Link>

        {/* Post Card */}
        <PostCard post={post.data} />

        {/* Comments Section */}
        <div className="mt-4 glass-panel-post rounded-2xl p-4">
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
