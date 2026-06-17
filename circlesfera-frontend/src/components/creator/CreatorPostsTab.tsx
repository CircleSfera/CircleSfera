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
import type { CreatorPost } from '../../services/creator.service';
import { creatorApi } from '../../services/creator.service';
import type { PaginatedResponse } from '../../types';
import PostInsightsModal from '../modals/PostInsightsModal';

interface Props {
  onPromote: (post: CreatorPost) => void;
}

export default function CreatorPostsTab({ onPromote }: Props) {
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
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex gap-2">
        {['', 'POST', 'FRAME'].map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => {
              setTypeFilter(t);
              setPage(1);
            }}
            className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${
              typeFilter === t
                ? 'bg-brand-primary text-white'
                : 'bg-white/5 text-gray-400 hover:bg-white/10'
            }`}
          >
            {t === '' ? 'Todos' : t === 'POST' ? 'Posts' : 'Frames'}
          </button>
        ))}
      </div>

      {/* Posts Grid */}
      {isLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 md:gap-6">
          {['s1', 's2', 's3', 's4', 's5', 's6'].map((id) => (
            <div
              key={id}
              className="glass-panel rounded-2xl h-48 md:h-64 animate-pulse bg-white/5"
            />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
          {data?.data?.map((post) => (
            <div
              key={post.id}
              className="glass-panel rounded-3xl border border-white/5 overflow-hidden hover:border-white/10 hover:bg-white/5 transition-all group/card flex flex-col"
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
                <span className="absolute top-3 left-3 px-2 py-0.5 bg-black/60 backdrop-blur rounded text-[8px] font-black uppercase text-white tracking-widest border border-white/5">
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
                    <div className="flex items-center justify-between text-[8px] font-black uppercase tracking-widest text-zinc-500 italic">
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

                  <div className="flex items-center gap-4 text-[10px] font-black">
                    <span className="flex items-center gap-1.5 text-zinc-400">
                      <Heart size={12} className="text-pink-500/60" />{' '}
                      {post._count.likes.toLocaleString()}
                    </span>
                    <span className="flex items-center gap-1.5 text-zinc-400">
                      <MessageCircle size={12} className="text-blue-500/60" />{' '}
                      {post._count.comments.toLocaleString()}
                    </span>
                    <span className="text-zinc-500 ml-auto opacity-60">
                      {post.views.toLocaleString()} views
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setInsightsPostId(post.id)}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-brand-primary/10 text-brand-primary text-[10px] font-black rounded-xl hover:bg-brand-primary/20 transition-all uppercase tracking-widest border border-brand-primary/20 group/btn"
                  >
                    <BarChart3
                      size={12}
                      className="group-hover:scale-110 transition-transform"
                    />
                    Insights
                  </button>
                  <button
                    type="button"
                    onClick={() => onPromote(post)}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-white/5 text-white text-[10px] font-black rounded-xl hover:bg-white/10 transition-all uppercase tracking-widest border border-white/10 group/btn"
                  >
                    <Megaphone
                      size={12}
                      className="group-hover:rotate-12 transition-transform"
                    />
                    Boost
                  </button>
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
        <div className="flex justify-center gap-2">
          {Array.from({ length: data.meta.totalPages }, (_, i) => i + 1).map(
            (p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPage(p)}
                className={`w-8 h-8 rounded-lg text-sm font-bold transition-all ${
                  page === p
                    ? 'bg-brand-primary text-white'
                    : 'bg-white/5 text-gray-500 hover:bg-white/10'
                }`}
              >
                {p}
              </button>
            ),
          )}
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
