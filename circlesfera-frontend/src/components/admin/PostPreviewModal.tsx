import { X } from 'lucide-react';
import type { AdminPost } from '../../services/admin.service';
import UserAvatar from '../UserAvatar';

interface Props {
  post: AdminPost;
  onClose: () => void;
}

export default function PostPreviewModal({ post, onClose }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-300">
      <button
        type="button"
        aria-label="Cerrar vista previa"
        className="absolute inset-0 z-0 cursor-default"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="preview-modal-title"
        className="glass-panel-post w-full max-w-lg rounded-[24px] overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-4 duration-300 ease-out shadow-[0_20px_50px_rgba(0,0,0,0.5)]"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose();
          e.stopPropagation();
        }}
      >
        {/* Header */}
        <div className="relative p-4 border-b border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <UserAvatar
              src={post.user?.profile?.avatar}
              alt={post.user?.profile?.username || 'User'}
              size="sm"
            />
            <div className="flex flex-col">
              <span
                className="text-white font-bold text-sm tracking-tight"
                id="preview-modal-title"
              >
                {post.user?.profile?.username || 'unknown'}
              </span>
              <span className="text-[10px] text-white/40 uppercase tracking-widest font-medium">
                Preview
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-white/40 hover:text-white bg-white/5 p-1.5 rounded-full transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        {post.media && post.media.length > 0 && (
          <div className="max-h-[400px] overflow-hidden bg-black">
            {post.media.map((m) => (
              <div key={m.url}>
                {m.type === 'video' ? (
                  <video
                    src={m.url}
                    controls
                    className="w-full max-h-[400px] object-contain"
                  >
                    <track kind="captions" />
                  </video>
                ) : (
                  <img
                    src={m.url}
                    alt="Post media"
                    className="w-full max-h-[400px] object-contain"
                  />
                )}
              </div>
            ))}
          </div>
        )}

        {/* Caption */}
        <div className="p-4 space-y-3">
          {post.caption && (
            <p className="text-white text-sm leading-relaxed">{post.caption}</p>
          )}
          {post._count && (
            <div className="flex gap-4 text-xs text-gray-500">
              <span>
                <span className="text-white font-bold">
                  {post._count.likes}
                </span>{' '}
                likes
              </span>
              <span>
                <span className="text-white font-bold">
                  {post._count.comments}
                </span>{' '}
                comentarios
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
