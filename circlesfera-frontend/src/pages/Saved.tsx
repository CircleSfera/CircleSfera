import { useQuery } from '@tanstack/react-query';
import { Bookmark, ChevronLeft, Layers, Play } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { bookmarksApi } from '../services';

export default function Saved() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: ['bookmarks'],
    queryFn: () => bookmarksApi.getAll(1, 50),
  });

  const posts = data?.data?.data || [];

  return (
    <div className="min-h-screen pb-20 md:max-w-3xl md:mx-auto">
      {/* IG Style Header */}
      <div className="sticky top-0 z-50 bg-black/80 backdrop-blur-xl border-b border-white/10 p-4 pt-[calc(1rem+env(safe-area-inset-top))] flex items-center gap-4">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="p-1 -ml-1 hover:bg-white/10 rounded-full transition-colors active:scale-95"
        >
          <ChevronLeft size={28} className="text-white" />
        </button>
        <h1 className="text-xl font-bold text-white tracking-tight">
          {t('collections.saved_title', 'Guardados')}
        </h1>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin w-8 h-8 border-2 border-brand-primary border-t-transparent rounded-full" />
        </div>
      ) : posts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-32 opacity-50">
          <div className="w-20 h-20 border-2 border-white/20 rounded-full flex items-center justify-center mb-4">
            <Bookmark size={32} className="text-white/40" />
          </div>
          <h2 className="text-xl font-semibold text-white mb-2">
            {t('collections.no_saved')}
          </h2>
          <p className="text-sm text-gray-400 max-w-[250px] text-center">
            {t('collections.no_saved_desc')}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-px bg-black mt-px">
          {posts.map((post) => {
            const media = post.media?.[0];
            const isVideo = media?.type === 'video' || post.type === 'FRAME';
            const isCarousel = post.media?.length > 1;

            return (
              <Link
                key={post.id}
                to={`/p/${post.id}`}
                className="relative aspect-square bg-white/5 overflow-hidden group cursor-pointer block"
              >
                {media ? (
                  isVideo ? (
                    <video
                      src={media.url}
                      className="w-full h-full object-cover"
                      muted
                      playsInline
                    />
                  ) : (
                    <img
                      src={media.url}
                      alt="Saved post thumbnail"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                  )
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-xs text-white/40 p-2 text-center bg-zinc-900">
                    <span className="line-clamp-4">
                      {post.caption || 'No media'}
                    </span>
                  </div>
                )}

                {/* Overlays for Video / Carousel indicators */}
                <div className="absolute top-2 right-2 flex gap-1 z-10 pointer-events-none drop-shadow-md">
                  {isCarousel && (
                    <Layers size={16} className="text-white fill-white/20" />
                  )}
                  {isVideo && (
                    <Play size={16} className="text-white fill-white" />
                  )}
                </div>

                {/* Hover state for desktop */}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors pointer-events-none" />
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
