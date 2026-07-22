import { Pin, X } from 'lucide-react';
import type React from 'react';
import UserAvatar from '../UserAvatar';

export interface PinnedCommentData {
  commentId: string;
  message: string;
  username: string;
  avatar?: string;
  pinnedAt?: string;
}

interface LivePinnedCommentProps {
  pinnedComment: PinnedCommentData | null;
  onUnpin?: () => void;
  canUnpin?: boolean;
}

export const LivePinnedComment: React.FC<LivePinnedCommentProps> = ({
  pinnedComment,
  onUnpin,
  canUnpin = false,
}) => {
  if (!pinnedComment) return null;

  return (
    <div className="flex items-center justify-between p-2.5 bg-black/70 border border-blue-500/30 rounded-2xl backdrop-blur-xl mb-2 text-xs text-white shadow-xl animate-fade-in">
      <div className="flex items-start space-x-2 overflow-hidden">
        <Pin className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
        <div className="overflow-hidden">
          <div className="flex items-center space-x-1.5">
            <UserAvatar
              src={pinnedComment.avatar}
              alt={pinnedComment.username}
              className="w-4 h-4 rounded-full"
            />
            <span className="font-bold text-blue-300 truncate">
              {pinnedComment.username}
            </span>
            <span className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider">
              • Fijado
            </span>
          </div>
          <p className="text-gray-100 font-medium wrap-break-word mt-0.5">
            {pinnedComment.message}
          </p>
        </div>
      </div>

      {canUnpin && onUnpin && (
        <button
          type="button"
          onClick={onUnpin}
          className="p-1 hover:bg-white/10 rounded-full text-gray-400 hover:text-white transition-colors shrink-0 ml-2"
          title="Des-fijar comentario"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
};

export default LivePinnedComment;
