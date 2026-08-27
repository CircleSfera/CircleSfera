import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { useParams, useSearchParams } from 'react-router-dom';
import SEO from '../components/common/SEO';
import PostDetailView from '../components/post/PostDetailView';
import { commentsApi, postsApi } from '../services';

export default function PostDetail() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const handledCheckoutReturn = useRef(false);

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

  useEffect(() => {
    if (handledCheckoutReturn.current) return;
    const success = searchParams.get('success') === 'true';
    const canceled = searchParams.get('canceled') === 'true';
    if (!success && !canceled) return;

    handledCheckoutReturn.current = true;

    if (success) {
      toast.success(
        t(
          'post.checkout_success',
          'Payment successful. Content will unlock shortly.',
        ),
      );
      queryClient.invalidateQueries({ queryKey: ['post', id] });
      queryClient.invalidateQueries({ queryKey: ['feed'] });
      queryClient.invalidateQueries({ queryKey: ['posts'] });
    } else {
      toast.error(t('post.checkout_canceled', 'Checkout was canceled.'));
    }

    const next = new URLSearchParams(searchParams);
    next.delete('success');
    next.delete('canceled');
    next.delete('session_id');
    setSearchParams(next, { replace: true });
  }, [id, queryClient, searchParams, setSearchParams, t]);

  if (isLoading || !post) {
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500" />
      </div>
    );
  }

  return (
    <div className="min-h-dvh py-3 md:py-6 relative">
      <SEO
        title={`Post de @${post.data.profile?.username || 'Usuario'}`}
        description={
          post.data.caption || 'Mira esta publicación en CircleSfera'
        }
        ogImage={post.data.media?.[0]?.url || undefined}
        ogType="article"
      />
      <div className="w-full mx-auto px-2 md:px-4 relative z-10">
        <PostDetailView
          post={post.data}
          comments={comments?.data.data || []}
          priority
        />
      </div>
    </div>
  );
}
