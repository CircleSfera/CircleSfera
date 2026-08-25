import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Clock, Eye, Heart, PlayCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { CreatorStory } from '../../services/creator.service';
import { creatorApi } from '../../services/creator.service';
import type { PaginatedResponse } from '../../types';
import { Button } from '../ui';
import CreatorEmpty from './CreatorEmpty';

export default function CreatorStoriesTab() {
  const { t } = useTranslation();
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
    <div className="space-y-4 pb-10">
      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
          {['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8', 's9', 's10'].map(
            (id) => (
              <div
                key={id}
                className="aspect-9/16 rounded-xl animate-pulse bg-zinc-900 border border-white/5"
              />
            ),
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
          {data?.data?.map((story) => (
            <motion.div
              layout
              key={story.id}
              className="relative aspect-9/16 rounded-xl overflow-hidden border border-white/5 hover:border-brand-primary/30 transition-all group cursor-pointer"
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
                  <span className="px-2 py-1 bg-black/50 rounded-lg text-[11px] text-white/70">
                    {t('creator.stories.expired', 'Expired')}
                  </span>
                ) : (
                  <span className="px-2 py-1 bg-brand-primary/90 text-white rounded-lg text-[11px]">
                    {t('creator.stories.active', 'Active')}
                  </span>
                )}

                <div className="p-1 bg-black/40 backdrop-blur-md rounded-lg border border-white/5">
                  <Clock size={12} className="text-white/60" />
                </div>
              </div>

              {/* Bottom Metrics Bar */}
              <div className="absolute bottom-4 left-4 right-4 space-y-3">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-1">
                    <div className="p-1 bg-white/10 backdrop-blur-md rounded-lg border border-white/5">
                      <Eye size={12} className="text-white" />
                    </div>
                    <span className="text-white font-semibold text-xs tracking-tight">
                      {story._count.views.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="p-1 bg-white/10 rounded-lg">
                      <Heart size={12} className="text-brand-secondary" />
                    </div>
                    <span className="text-white font-semibold text-xs tracking-tight">
                      {story._count.reactions.toLocaleString()}
                    </span>
                  </div>
                </div>

                <div className="h-0.5 w-full bg-white/10 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-brand-primary"
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

      {!isLoading && !data?.data?.length && (
        <CreatorEmpty
          icon={Clock}
          title={t('creator.stories.empty_title', 'No stories yet')}
          message={t(
            'creator.stories.empty_desc',
            'Share ephemeral moments with your followers to grow your reach.',
          )}
        />
      )}

      {data?.meta && data.meta.totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-8 flex-wrap">
          <Button
            variant="ghost"
            size="compact"
            className="min-h-11"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            {t('creator.posts.prev', 'Previous')}
          </Button>
          <span className="text-xs text-white/40 px-2">
            {page} / {data.meta.totalPages}
          </span>
          <Button
            variant="ghost"
            size="compact"
            className="min-h-11"
            disabled={page >= data.meta.totalPages}
            onClick={() =>
              setPage((p) => Math.min(data.meta.totalPages, p + 1))
            }
          >
            {t('creator.posts.next', 'Next')}
          </Button>
        </div>
      )}
    </div>
  );
}
