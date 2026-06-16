import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import type { Post } from '../../types';
import RichText from '../RichText';

interface PostContentProps {
  post: Post;
  likesCount: number;
}

export default function PostContent({ post, likesCount }: PostContentProps) {
  const { t } = useTranslation();
  return (
    <div className="pt-1">
      <div className="font-semibold text-sm mb-1">
        {likesCount} {t('post.content.likes')}
      </div>

      {post.caption && (
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

      {post._count?.comments > 0 && (
        <Link
          to={`/p/${post.id}`}
          className="text-sm text-gray-500 hover:text-gray-400 transition-colors"
        >
          {t('post.content.view_all_comments', { count: post._count.comments })}
        </Link>
      )}

      <div className="text-xs text-gray-600 mt-1 uppercase">
        {new Date(post.createdAt).toLocaleDateString()}
      </div>
    </div>
  );
}
