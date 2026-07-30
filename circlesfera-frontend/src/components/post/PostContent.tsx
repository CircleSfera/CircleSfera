import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import type { Post } from '../../types';
import RichText from '../RichText';

interface PostContentProps {
  post: Post;
  likesCount: number;
  hideCaption?: boolean;
  hideStats?: boolean;
  /** When true, hide the "view all comments" link (already on detail page) */
  isDetailMode?: boolean;
}

export default function PostContent({
  post,
  likesCount,
  hideCaption,
  hideStats,
  isDetailMode = false,
}: PostContentProps) {
  const { t } = useTranslation();

  const formattedLikes = new Intl.NumberFormat('es-ES', {
    notation: likesCount >= 10000 ? 'compact' : 'standard',
    maximumFractionDigits: 1,
  }).format(likesCount);

  return (
    <div className={isDetailMode ? 'pt-2' : 'pt-2.5'}>
      {!hideStats && likesCount > 0 && (
        <div className="flex items-baseline gap-1.5 mb-1.5">
          <span className="font-black text-sm text-white tracking-tight">
            {formattedLikes}
          </span>
          <span className="text-xs font-medium text-gray-400">
            {t('post.content.likes')}
          </span>
        </div>
      )}

      {!hideCaption && post.caption && (
        <div className="text-sm text-gray-300/90 mb-1.5 leading-relaxed">
          <Link
            to={`/${post.user.profile?.username}`}
            className="font-bold text-white mr-1.5 hover:text-white/80 transition-colors"
          >
            {post.user.profile?.username}
          </Link>
          <RichText text={post.caption} />
        </div>
      )}

      {!hideStats && !isDetailMode && (post._count?.comments ?? 0) > 0 && (
        <Link
          to={`/p/${post.id}`}
          className="block text-xs font-medium text-gray-500 hover:text-gray-300 transition-colors mb-1.5"
        >
          {t('post.content.view_all_comments', { count: post._count.comments })}
        </Link>
      )}

      {!hideStats && (
        <div
          className="text-[10px] font-semibold uppercase tracking-widest mt-0.5"
          style={{ color: 'rgba(255,255,255,0.22)' }}
        >
          {new Date(post.createdAt).toLocaleDateString('es-ES', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}
        </div>
      )}
    </div>
  );
}
