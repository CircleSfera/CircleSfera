import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  BarChart3,
  Film,
  Heart,
  Image as ImageIcon,
  Megaphone,
  MessageCircle,
} from 'lucide-react';
import { useState } from 'react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import type { CreatorPost } from '../../services/creator.service';
import { creatorApi } from '../../services/creator.service';
import { useAuthStore } from '../../stores/authStore';
import type { PaginatedResponse } from '../../types';
import PostInsightsModal from '../modals/PostInsightsModal';
import { Button } from '../ui';

interface Props {
  onPromote: (post: CreatorPost) => void;
}

export default function CreatorPostsTab({ onPromote }: Props) {
  const { t } = useTranslation();
  const { profile } = useAuthStore();
  const verificationLevel =
    profile?.user?.verificationLevel || profile?.verificationLevel;
  const canPromote = verificationLevel === 'ELITE';
  const [page, setPage] = useState(1);
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [insightsPostId, setInsightsPostId] = useState<string | null>(null);

  const { data, isLoading } = useQuery<PaginatedResponse<CreatorPost>>({
    queryKey: ['creator', 'posts', page, typeFilter],
    queryFn: () =>
      creatorApi
        .getPosts(page, 10, typeFilter || undefined)
        .then((r) => r.data),
  });

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2 w-full">
        {['', 'POST', 'FRAME'].map((filter) => (
          <Button
            key={filter || 'all'}
            variant={typeFilter === filter ? 'primary' : 'ghost'}
            size="sm"
            className="w-full sm:w-auto min-h-11"
            onClick={() => {
              setTypeFilter(filter);
              setPage(1);
            }}
          >
            {filter === '' ? 'Todos' : filter === 'POST' ? 'Posts' : 'Frames'}
          </Button>
        ))}
      </div>

      {/* Posts Grid */}
      {isLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          {['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8'].map((id) => (
            <div
              key={id}
              className="glass-panel rounded-lg aspect-4/5 animate-pulse bg-white/5"
            />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          {data?.data?.map((post) => (
            <div
              key={post.id}
              className="glass-panel rounded-xl border border-white/5 overflow-hidden hover:border-white/10 hover:bg-white/5 transition-all group/card flex flex-col"
            >
              {/* Thumbnail */}
              <div className="aspect-4/5 bg-white/5 relative overflow-hidden shrink-0">
                {post.media?.[0] ? (
                  <img
                    src={post.media[0].url}
                    alt=""
                    className="w-full h-full object-cover transition-transform duration-700 group-hover/card:scale-110"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    {post.type === 'FRAME' ? (
                      <Film size={32} className="text-zinc-700" />
                    ) : (
                      <ImageIcon size={32} className="text-zinc-700" />
                    )}
                  </div>
                )}
                {/* Type badge */}
                <span className="absolute top-3 left-3 px-2 py-0.5 bg-black/60 backdrop-blur rounded text-xs font-black uppercase text-white tracking-wide border border-white/5">
                  {post.type}
                </span>
              </div>

              {/* Info Area */}
              <div className="p-4 flex-1 flex flex-col justify-between gap-4">
                <div>
                  <p className="text-white text-xs line-clamp-1 mb-3 font-bold">
                    {post.caption || 'Publicación sin título'}
                  </p>

                  <div className="space-y-2 mb-4">
                    <div className="flex items-center justify-between text-xs font-black uppercase tracking-wide text-zinc-400 italic">
                      <span>Rendimiento</span>
                      <span
                        className={
                          post.performanceScore >= 120
                            ? 'text-emerald-400'
                            : post.performanceScore >= 80
                              ? 'text-brand-primary'
                              : 'text-rose-400'
                        }
                      >
                        {post.performanceScore >= 120
                          ? 'Excelente'
                          : post.performanceScore >= 80
                            ? 'Promedio'
                            : 'Bajo'}
                      </span>
                    </div>
                    <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{
                          width: `${Math.min(post.performanceScore, 100)}%`,
                        }}
                        className={`h-full rounded-full ${
                          post.performanceScore >= 120
                            ? 'bg-emerald-500'
                            : post.performanceScore >= 80
                              ? 'bg-brand-primary'
                              : 'bg-rose-500'
                        }`}
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-4 text-xs font-black">
                    <span className="flex items-center gap-1 text-zinc-400">
                      <Heart size={12} className="text-pink-500/60" />{' '}
                      {post._count.likes.toLocaleString()}
                    </span>
                    <span className="flex items-center gap-1 text-zinc-400">
                      <MessageCircle size={12} className="text-blue-500/60" />{' '}
                      {post._count.comments.toLocaleString()}
                    </span>
                    <span className="text-zinc-400 ml-auto opacity-60">
                      {post.views.toLocaleString()} views
                    </span>
                  </div>
                </div>

                <div className="flex flex-col xs:flex-row items-stretch gap-2">
                  <Button
                    variant="secondary"
                    onClick={() => setInsightsPostId(post.id)}
                    className="flex-1 min-h-11 bg-brand-primary/10 text-brand-primary border-brand-primary/20 hover:bg-brand-primary/20 group/btn"
                  >
                    <BarChart3
                      size={14}
                      className="group-hover:scale-110 transition-transform mr-2"
                    />
                    Insights
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      if (!canPromote) {
                        toast(
                          t(
                            'creator.promotions.elite_required',
                            'Promotions are available on the Elite plan.',
                          ),
                          { icon: '✨' },
                        );
                        return;
                      }
                      onPromote(post);
                    }}
                    className="flex-1 min-h-11 bg-white/5 text-white border-white/10 hover:bg-white/10 group/btn"
                  >
                    <Megaphone
                      size={14}
                      className="group-hover:rotate-12 transition-transform mr-2"
                    />
                    Boost
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !data?.data?.length && (
        <div className="text-center py-16 text-gray-600">
          <ImageIcon size={48} className="mx-auto mb-3 opacity-50" />
          <p>No tienes publicaciones aún</p>
        </div>
      )}

      {/* Pagination */}
      {data?.meta && data.meta.totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 flex-wrap">
          <Button
            variant="ghost"
            size="sm"
            className="min-h-11"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Anterior
          </Button>
          <span className="text-xs font-semibold text-gray-400 px-2">
            {page} / {data.meta.totalPages}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="min-h-11"
            disabled={page >= data.meta.totalPages}
            onClick={() =>
              setPage((p) => Math.min(data.meta.totalPages, p + 1))
            }
          >
            Siguiente
          </Button>
        </div>
      )}

      {insightsPostId && (
        <PostInsightsModal
          postId={insightsPostId}
          onClose={() => setInsightsPostId(null)}
        />
      )}
    </div>
  );
}
