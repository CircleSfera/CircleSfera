import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { Link, useParams, useSearchParams } from 'react-router-dom';
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
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen py-3 md:py-6 relative">
      <SEO
        title={`Post de @${post.data.user?.profile?.username || 'Usuario'}`}
        description={
          post.data.caption || 'Mira esta publicación en CircleSfera'
        }
        ogImage={post.data.media?.[0]?.url || undefined}
        ogType="article"
      />
      <div className="w-full mx-auto px-2 md:px-4 relative z-10">
        {/* Sticky Header (Mobile Only) */}
        <div className="md:hidden sticky top-0 z-50 glass-panel border-b border-white/8 flex items-center justify-between p-3.5 pt-[calc(0.75rem+env(safe-area-inset-top))]">
          <Link
            to="/"
            className="p-1 -ml-1 text-white hover:bg-white/10 rounded-full transition-colors"
          >
            <ArrowLeft size={20} />
          </Link>
          <h1 className="text-xs font-bold text-white uppercase tracking-wider">
            {t('post.detail.title', 'Publicación')}
          </h1>
          <div className="w-5" />
        </div>

        {/* Back Button (Desktop) */}
        <div className="max-w-4xl mx-auto mb-3 hidden md:block">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-white/70 hover:text-white transition-colors text-xs font-bold px-3 py-1.5 rounded-full glass-panel border border-white/8 hover:bg-white/10"
          >
            <ArrowLeft size={15} />
            <span>{t('post.detail.back_to_feed', 'Volver al inicio')}</span>
          </Link>
        </div>

        <PostDetailView
          post={post.data}
          comments={comments?.data.data || []}
          priority
        />
      </div>
    </div>
  );
}
