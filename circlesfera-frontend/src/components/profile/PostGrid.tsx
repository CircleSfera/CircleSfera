import { Clapperboard, Heart, MessageCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Post } from '../../types';

interface PostGridProps {
  items: Post[];
  emptyMessage: string;
  emptySubtext: string;
  icon: React.ReactNode;
}

export default function PostGrid({
  items,
  emptyMessage,
  emptySubtext,
  icon,
}: PostGridProps) {
  if (!items || items.length === 0) {
    return (
      <div className="text-center py-14">
        <div className="w-14 h-14 border-2 border-white/20 rounded-full flex items-center justify-center mx-auto mb-4">
          {icon}
        </div>
        <h3 className="text-lg font-bold text-white mb-2">{emptyMessage}</h3>
        <p className="text-gray-300 text-sm">{emptySubtext}</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-1">
      {items.map((post) => (
        <Link
          key={post.id}
          to={`/p/${post.id}`}
          className="aspect-4/5 relative group overflow-hidden bg-white/5"
        >
          {post.type === 'FRAME' && (
            <div className="absolute top-2 right-2 z-10">
              <Clapperboard size={16} className="text-white drop-shadow-md" />
            </div>
          )}
          {post.media?.[0]?.type === 'video' || post.type === 'FRAME' ? (
            <video
              src={post.media?.[0]?.url}
              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
              muted
              playsInline
              loop
              preload="metadata"
              onMouseOver={(e) => {
                e.currentTarget.play().catch(() => {});
              }}
              onMouseOut={(e) => {
                e.currentTarget.pause();
                e.currentTarget.currentTime = 0;
              }}
              onFocus={(e) => {
                e.currentTarget.play().catch(() => {});
              }}
              onBlur={(e) => {
                e.currentTarget.pause();
                e.currentTarget.currentTime = 0;
              }}
              onError={(e) => {
                console.error(
                  'Video load error for post:',
                  post.id,
                  post.media?.[0]?.url,
                );
                e.currentTarget.style.display = 'none';
              }}
            >
              <track kind="captions" />
            </video>
          ) : (
            <img
              src={
                post.media?.[0]?.thumbnailUrl ||
                post.media?.[0]?.standardUrl ||
                post.media?.[0]?.url
              }
              srcSet={
                post.media?.[0]?.thumbnailUrl && post.media?.[0]?.standardUrl
                  ? `${post.media?.[0]?.thumbnailUrl} 300w, ${post.media?.[0]?.standardUrl} 600w`
                  : undefined
              }
              sizes="(max-width: 768px) 33vw, 250px"
              alt={post.caption || ''}
              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
              loading="lazy"
              onError={(e) => {
                e.currentTarget.src = '#noimagex400?text=No+Image';
                e.currentTarget.srcset = '';
              }}
            />
          )}

          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4 pointer-events-none">
            <div className="flex items-center gap-2 text-white font-bold">
              <Heart size={20} fill="white" />
              <span>{post._count?.likes || 0}</span>
            </div>
            <div className="flex items-center gap-2 text-white font-bold">
              <MessageCircle size={20} fill="white" />
              <span>{post._count?.comments || 0}</span>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}
