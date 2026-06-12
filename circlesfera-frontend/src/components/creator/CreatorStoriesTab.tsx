import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Clock, Eye, Heart, PlayCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { CreatorStory } from '../../services/creator.service';
import { creatorApi } from '../../services/creator.service';
import type { PaginatedResponse } from '../../types';

export default function CreatorStoriesTab() {
  const [page, setPage] = useState(1);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);

  const { data, isLoading } = useQuery<PaginatedResponse<CreatorStory>>({
    queryKey: ['creator', 'stories', page],
    queryFn: () => creatorApi.getStories(page, 12).then((r) => r.data),
  });

  const isExpired = (expiresAt: string) => new Date(expiresAt) < new Date();

  return (
    <div className="space-y-8 pb-10">
      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 md:gap-6">
          {['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8', 's9', 's10'].map(
            (id) => (
              <div
                key={id}
                className="aspect-9/16 rounded-3xl animate-pulse bg-zinc-900 border border-white/5"
              />
            ),
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 md:gap-6">
          {data?.data?.map((story) => (
            <motion.div
              layout
              key={story.id}
              className="relative aspect-9/16 rounded-3xl overflow-hidden border border-white/5 hover:border-brand-primary/30 transition-all group cursor-pointer"
            >
              {/* Media */}
              {story.mediaType === 'video' ? (
                <div className="relative w-full h-full">
                  <video
                    src={story.url}
                    className="w-full h-full object-cover grayscale-[0.2] group-hover:grayscale-0 transition-all duration-700"
                    muted
                  />
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <PlayCircle
                      size={40}
                      className="text-white drop-shadow-2xl"
                    />
                  </div>
                </div>
              ) : (
                <img
                  src={story.url}
                  alt=""
                  className="w-full h-full object-cover grayscale-[0.2] group-hover:grayscale-0 transition-all duration-700 group-hover:scale-105"
                />
              )}

              {/* Immersive Overlay Gradient */}
              <div className="absolute inset-0 bg-linear-to-t from-black via-black/20 to-black/40 opacity-80" />

              {/* Top Bar: Status */}
              <div className="absolute top-4 left-4 right-4 flex justify-between items-start">
                {isExpired(story.expiresAt) ? (
                  <span className="px-2.5 py-1 bg-zinc-900/80 backdrop-blur-xl border border-white/5 rounded-lg text-[9px] font-black uppercase tracking-widest text-zinc-500">
                    Expirada
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 px-2.5 py-1 bg-brand-primary text-white backdrop-blur-xl rounded-lg text-[9px] font-black uppercase tracking-widest shadow-lg shadow-brand-primary/20">
                    <span className="w-1 h-1 rounded-full bg-white animate-pulse" />
                    Activa
                  </span>
                )}

                <div className="p-1.5 bg-black/40 backdrop-blur-md rounded-lg border border-white/5">
                  <Clock size={12} className="text-white/60" />
                </div>
              </div>

              {/* Bottom Metrics Bar */}
              <div className="absolute bottom-4 left-4 right-4 space-y-3">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-1.5">
                    <div className="p-1.5 bg-white/10 backdrop-blur-md rounded-lg border border-white/5">
                      <Eye size={12} className="text-white" />
                    </div>
                    <span className="text-white font-black text-xs tracking-tight">
                      {story._count.views.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="p-1.5 bg-pink-500/20 backdrop-blur-md rounded-lg border border-pink-500/20">
                      <Heart size={12} className="text-pink-400" />
                    </div>
                    <span className="text-white font-black text-xs tracking-tight">
                      {story._count.reactions.toLocaleString()}
                    </span>
                  </div>
                </div>

                <div className="h-0.5 w-full bg-white/10 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-linear-to-r from-brand-primary to-purple-500"
                    style={{
                      width: isExpired(story.expiresAt)
                        ? '100%'
                        : `${Math.min(
                            Math.max(
                              ((now - new Date(story.createdAt).getTime()) /
                                (new Date(story.expiresAt).getTime() -
                                  new Date(story.createdAt).getTime())) *
                                100,
                              0,
                            ),
                            100,
                          )}%`,
                    }}
                  />
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Empty state & Pagination cleanup... */}
      {!isLoading && !data?.data?.length && (
        <div className="text-center py-24 glass-panel rounded-4xl border border-dashed border-white/5">
          <div className="p-6 bg-white/5 rounded-full w-fit mx-auto mb-6">
            <Clock size={48} className="text-zinc-700" />
          </div>
          <h4 className="text-white font-black uppercase text-xl mb-2">
            No hay historias
          </h4>
          <p className="text-zinc-500 text-sm max-w-xs mx-auto">
            Comparte momentos efímeros con tus seguidores para aumentar tu
            alcance.
          </p>
        </div>
      )}

      {data?.meta && data.meta.totalPages > 1 && (
        <div className="flex justify-center gap-2 mt-12">
          {Array.from({ length: data.meta.totalPages }, (_, i) => i + 1).map(
            (p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPage(p)}
                className={`w-10 h-10 rounded-xl text-xs font-black uppercase transition-all ${
                  page === p
                    ? 'bg-white text-black shadow-xl shadow-white/5'
                    : 'bg-white/5 text-zinc-500 hover:text-white border border-white/5'
                }`}
              >
                {p}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}
