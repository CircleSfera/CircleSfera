import { Link } from 'react-router-dom';
import type { Post } from '../../types';
import UserAvatar from '../UserAvatar';

interface SharedPostProps {
  post: Post;
}

export default function SharedPost({ post }: SharedPostProps) {
  const isVideo = post.media?.[0]?.type === 'video';
  const mediaUrl = post.media?.[0]?.url;

  return (
    <Link
      to={`/p/${post.id}`}
      className="block bg-zinc-900/50 rounded-xl overflow-hidden border border-white/10 hover:border-white/20 transition-all group"
    >
      <div className="flex items-center gap-2 p-2 border-b border-white/5">
        <UserAvatar
          src={post.user.profile.avatar || undefined}
          thumbnailUrl={post.user.profile.thumbnailUrl}
          standardUrl={post.user.profile.standardUrl}
          alt={post.user.profile.username}
          size="sm"
          className="w-8 h-8 rounded-full object-cover border border-white/10"
        />
        <span className="text-xs font-semibold text-white/90">
          {post.user.profile.username}
        </span>
      </div>

      <div className="aspect-4/5 relative overflow-hidden bg-black">
        {isVideo ? (
          <video
            src={mediaUrl}
            className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
            muted
            playsInline
          >
            <track kind="captions" />
          </video>
        ) : (
          <img
            src={mediaUrl}
            alt="Post preview"
            className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
          />
        )}
      </div>

      {post.caption && (
        <div className="p-2">
          <p className="text-xs text-white/70 line-clamp-2">{post.caption}</p>
        </div>
      )}
    </Link>
  );
}
