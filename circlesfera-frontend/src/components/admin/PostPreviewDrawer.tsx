import { useTranslation } from 'react-i18next';
import type { AdminPost } from '../../services/admin.service';
import UserAvatar from '../UserAvatar';
import AdminDrawer from './AdminDrawer';

interface Props {
  post: AdminPost;
  onClose: () => void;
}

export default function PostPreviewDrawer({ post, onClose }: Props) {
  const { t } = useTranslation();

  return (
    <AdminDrawer
      isOpen={true}
      onClose={onClose}
      title={t('admin.posts.preview_drawer_title')}
    >
      <div className="space-y-4">
        <div className="flex items-center gap-3 p-4 bg-white/5 rounded-lg border border-white/10">
          <UserAvatar
            src={post.user?.profile?.avatar}
            alt={post.user?.profile?.username || 'User'}
          />
          <div className="flex flex-col">
            <span className="text-white font-bold text-sm tracking-tight">
              @{post.user?.profile?.username || t('admin.shared.unknown')}
            </span>
            <span className="text-xs text-gray-300 uppercase tracking-wide font-medium">
              {new Date(post.createdAt).toLocaleString()}
            </span>
          </div>
        </div>

        {post.media && post.media.length > 0 && (
          <div className="bg-black rounded-lg overflow-hidden border border-white/10 relative">
            <div className="aspect-4/5 w-full flex items-center justify-center">
              {post.media[0].type === 'video' ? (
                <video
                  src={post.media[0].url}
                  controls
                  className="w-full h-full object-contain"
                >
                  <track kind="captions" />
                </video>
              ) : (
                <img
                  src={post.media[0].url}
                  alt="Post media"
                  className="w-full h-full object-contain"
                />
              )}
            </div>
            {post.media.length > 1 && (
              <div className="absolute top-3 right-3 bg-black/60 text-white text-xs px-2 py-1 rounded-full backdrop-blur-md">
                1/{post.media.length}
              </div>
            )}
          </div>
        )}

        {post.caption && (
          <div className="p-4 bg-white/5 rounded-lg border border-white/10">
            <p className="text-white text-sm whitespace-pre-wrap leading-relaxed">
              {post.caption}
            </p>
          </div>
        )}

        {post._count && (
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 bg-white/5 border border-white/10 rounded-lg flex flex-col items-center justify-center">
              <span className="text-2xl font-bold text-white">
                {post._count.likes}
              </span>
              <span className="text-xs uppercase tracking-wide text-gray-500 font-semibold mt-1">
                {t('admin.posts.stat_likes')}
              </span>
            </div>
            <div className="p-4 bg-white/5 border border-white/10 rounded-lg flex flex-col items-center justify-center">
              <span className="text-2xl font-bold text-white">
                {post._count.comments}
              </span>
              <span className="text-xs uppercase tracking-wide text-gray-500 font-semibold mt-1">
                {t('admin.posts.stat_comments')}
              </span>
            </div>
          </div>
        )}
      </div>
    </AdminDrawer>
  );
}
