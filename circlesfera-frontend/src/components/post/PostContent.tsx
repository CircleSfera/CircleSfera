import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import type { Post } from '../../types';
import RichText from '../RichText';

interface PostContentProps {
  post: Post;
  likesCount: number;
  hideCaption?: boolean;
  hideStats?: boolean;
}

export default function PostContent({
  post,
  likesCount,
  hideCaption,
  hideStats,
}: PostContentProps) {
  const { t } = useTranslation();
  return (
    <div className="pt-3">
      {!hideStats && (
        <div className="font-semibold text-sm mb-1">
          {likesCount} {t('post.content.likes')}
        </div>
      )}

      {!hideCaption && post.caption && (
        <div className="text-sm text-gray-300 mb-1">
          <Link
            to={`/${post.user.profile.username}`}
            className="font-semibold text-white mr-1.5 hover:underline"
          >
            {post.user.profile.username}
          </Link>
          <RichText text={post.caption} />
        </div>
      )}

      {!hideStats && post._count?.comments > 0 && (
        <Link
          to={`/p/${post.id}`}
          className="text-sm text-gray-500 hover:text-gray-400 transition-colors block mb-1"
        >
          {t('post.content.view_all_comments', { count: post._count.comments })}
        </Link>
      )}

      {!hideStats && (
        <div className="text-xs text-gray-600 mt-1 uppercase">
          {new Date(post.createdAt).toLocaleDateString()}
        </div>
      )}
    </div>
  );
}
