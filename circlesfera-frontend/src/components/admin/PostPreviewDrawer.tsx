import type { AdminPost } from '../../services/admin.service';
import UserAvatar from '../UserAvatar';
import AdminDrawer from './AdminDrawer';

interface Props {
  post: AdminPost;
  onClose: () => void;
}

export default function PostPreviewDrawer({ post, onClose }: Props) {
  return (
    <AdminDrawer
      isOpen={true}
      onClose={onClose}
      title="Vista previa de publicación"
    >
      <div className="space-y-6">
        {/* User Info */}
        <div className="flex items-center gap-3 p-4 bg-white/5 rounded-2xl border border-white/10">
          <UserAvatar
            src={post.user?.profile?.avatar}
            alt={post.user?.profile?.username || 'User'}
          />
          <div className="flex flex-col">
            <span className="text-white font-bold text-sm tracking-tight">
              @{post.user?.profile?.username || 'unknown'}
            </span>
            <span className="text-[10px] text-gray-400 uppercase tracking-widest font-medium">
              {new Date(post.createdAt).toLocaleString()}
            </span>
          </div>
        </div>

        {/* Content Media */}
        {post.media && post.media.length > 0 && (
          <div className="bg-black rounded-2xl overflow-hidden border border-white/10 relative">
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

        {/* Caption */}
        {post.caption && (
          <div className="p-4 bg-white/5 rounded-2xl border border-white/10">
            <p className="text-white text-sm whitespace-pre-wrap leading-relaxed">
              {post.caption}
            </p>
          </div>
        )}

        {/* Stats */}
        {post._count && (
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 bg-white/5 border border-white/10 rounded-2xl flex flex-col items-center justify-center">
              <span className="text-2xl font-black text-white">
                {post._count.likes}
              </span>
              <span className="text-[10px] uppercase tracking-widest text-gray-500 font-bold mt-1">
                Likes
              </span>
            </div>
            <div className="p-4 bg-white/5 border border-white/10 rounded-2xl flex flex-col items-center justify-center">
              <span className="text-2xl font-black text-white">
                {post._count.comments}
              </span>
              <span className="text-[10px] uppercase tracking-widest text-gray-500 font-bold mt-1">
                Comentarios
              </span>
            </div>
          </div>
        )}
      </div>
    </AdminDrawer>
  );
}
