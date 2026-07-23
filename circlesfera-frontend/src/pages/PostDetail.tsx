import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import CommentList from '../components/CommentList';
import SEO from '../components/common/SEO';
import PostCard from '../components/PostCard';
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
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-24 md:pt-6 md:flex md:items-center relative">
      {/* Brand Background */}
      <div className="fixed inset-0 z-[-1] pointer-events-none overflow-hidden bg-black">
        <div className="absolute inset-0 bg-linear-to-br from-brand-primary/30 via-black to-brand-primary/10" />
        <div className="absolute top-[-20%] left-[-10%] w-[50vw] h-[50vw] bg-brand-primary/20 blur-[120px] rounded-full mix-blend-screen" />
      </div>

      <SEO
        title={`Post de @${post.data.user?.profile?.username || 'Usuario'}`}
        description={
          post.data.caption || 'Mira esta publicación en CircleSfera'
        }
        ogImage={post.data.media?.[0]?.url || undefined}
        ogType="article"
      />
      <div className="w-full mx-auto md:px-4 relative z-10">
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
        <div className="max-w-5xl mx-auto mb-4 hidden md:block">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-gray-300 hover:text-white transition-colors text-sm px-4 md:px-0"
          >
            <ArrowLeft size={18} />
            <span>{t('post.detail.back_to_feed')}</span>
          </Link>
        </div>

        {/* Post Card in Detail Mode */}
        <PostCard
          post={post.data}
          isDetailMode={true}
          renderComments={(props) => (
            <div
              className={
                props?.isDetailMode
                  ? 'h-full flex flex-col min-h-0'
                  : 'flex flex-col h-full'
              }
            >
              {!props?.isDetailMode && (
                <h2 className="text-base font-bold text-white mb-4 flex items-center gap-2 shrink-0 px-2">
                  <span>{t('post.detail.comments')}</span>
                  <span className="text-sm font-normal text-gray-300">
                    ({comments?.data.data.length || 0})
                  </span>
                </h2>
              )}
              {id && (
                <div className="flex-1 pb-4 min-h-0">
                  <CommentList
                    postId={id}
                    comments={comments?.data.data || []}
                    {...props}
                  />
                </div>
              )}
            </div>
          )}
        />
      </div>
    </div>
  );
}
