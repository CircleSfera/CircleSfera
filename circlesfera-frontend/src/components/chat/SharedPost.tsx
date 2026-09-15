import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import type { Post } from '../../types';
import { sanitizeUrl } from '../../utils/apiUtils';
import UserAvatar from '../UserAvatar';

interface SharedPostProps {
  post: Post;
}

function isVideoUrl(url: string): boolean {
  return /\.(mp4|mov|webm|m4v|mkv|m3u8)(\?|#|$)/i.test(url);
}

export default function SharedPost({ post }: SharedPostProps) {
  const { t } = useTranslation();
  const media = post.media?.[0];
  const isVideo =
    media?.type === 'video' || (media?.url && isVideoUrl(media.url));
  const thumb =
    media?.thumbnailUrl ||
    (media?.url && !isVideoUrl(media.url) ? media.url : undefined);
  const videoUrl = media?.url ? sanitizeUrl(media.url) : undefined;
  const imageUrl = thumb ? sanitizeUrl(thumb) : undefined;

  return (
    <Link
      to={`/p/${post.id}`}
      className="block bg-zinc-900/50 rounded-xl overflow-hidden border border-white/10 hover:border-white/20 transition-all group"
    >
      <div className="flex items-center gap-2 p-2 border-b border-white/5">
        <UserAvatar
          src={post.profile.avatar || ''}
          thumbnailUrl={post.profile.thumbnailUrl || ''}
          standardUrl={post.profile.standardUrl || ''}
          alt={post.profile.username || ''}
          size="compact"
          className="w-8 h-8 rounded-full object-cover border border-white/10"
        />
        <span className="text-xs font-semibold text-white/90">
          {post.profile.username}
        </span>
      </div>

      <div className="aspect-4/5 relative overflow-hidden bg-black">
        {isVideo && videoUrl ? (
          <video
            src={videoUrl}
            className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
            muted
            playsInline
            preload="metadata"
          >
            <track kind="captions" />
          </video>
        ) : imageUrl ? (
          <img
            src={imageUrl}
            alt={post.caption || t('common.alt.post')}
            className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
          />
        ) : null}
      </div>

      {post.caption && (
        <div className="p-2">
          <p className="text-xs text-white/70 line-clamp-2">{post.caption}</p>
        </div>
      )}
    </Link>
  );
}
