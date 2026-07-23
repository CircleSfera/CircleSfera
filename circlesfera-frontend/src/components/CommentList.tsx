import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Heart,
  Image as ImageIcon,
  MessageCircle,
  Send,
  Trash2,
  X,
} from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { commentsApi, uploadApi } from '../services';
import { useAuthStore } from '../stores/authStore';
import type { Comment, CreateCommentDto } from '../types';
import { logger } from '../utils/logger';
import { VoicePlayer } from './audio/VoicePlayer';
import { VoiceRecorder } from './audio/VoiceRecorder';
import ConfirmModal from './modals/ConfirmModal';
import UserAvatar from './UserAvatar';
import { Button } from './ui';
import VerificationBadge, { type VerificationLevel } from './VerificationBadge';

interface CommentListProps {
  postId: string;
  comments: Comment[];
  isDetailMode?: boolean;
  captionComponent?: React.ReactNode;
  actionsComponent?: React.ReactNode;
}

interface CommentItemProps {
  comment: Comment;
  postId: string;
  currentUserId?: string;
  onReply: (comment: Comment) => void;
  onDelete: (commentId: string) => void;
  deletingId: string | null;
  onLike: (commentId: string, isLiked: boolean) => void;
  depth?: number;
}

const CommentItem = ({
  comment,
  postId,
  currentUserId,
  onReply,
  onDelete,
  deletingId,
  onLike,
  depth = 0,
}: CommentItemProps) => {
  const { t } = useTranslation();
  const isOwner =
    currentUserId === comment.userId || currentUserId === comment.user?.id;
  const isDeleting = deletingId === comment.id;
  const hasReplies = comment.replies && comment.replies.length > 0;

  const isLiked =
    comment.likes?.some(
      (l: { userId: string }) => l.userId === currentUserId,
    ) ?? false;
  const likesCount = comment.likes?.length || 0;

  return (
    <div className={`space-y-3 ${depth > 0 ? 'ml-8 mt-3 relative' : ''}`}>
      {depth > 0 && (
        <div className="absolute -left-4 top-0 bottom-0 w-px bg-white/10" />
      )}

      <div className={`flex gap-3 group ${isDeleting ? 'opacity-50' : ''}`}>
        <UserAvatar
          src={comment.user.profile.avatar || undefined}
          thumbnailUrl={comment.thumbnailUrl}
          standardUrl={comment.standardUrl}
          alt={comment.user.profile.username}
          size="sm"
          className="w-9 h-9 rounded-full object-cover shrink-0"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="text-sm leading-relaxed">
              <span className="font-semibold text-white mr-1 inline-flex items-center gap-1">
                {comment.user.profile.username}
                <VerificationBadge
                  level={comment.user.verificationLevel as VerificationLevel}
                  size={12}
                />
              </span>
              <span className="text-gray-300 wrap-break-word">
                {comment.content}
              </span>
              {comment.voiceUrl && (
                <div className="mt-1">
                  <VoicePlayer
                    voiceUrl={comment.voiceUrl}
                    durationSeconds={comment.voiceDuration ?? undefined}
                    waveform={comment.voiceWaveform as number[] | undefined}
                  />
                </div>
              )}
              {comment.url && (
                <div className="mt-2 rounded-lg overflow-hidden border border-white/10 max-w-xs bg-black">
                  {comment.mediaType === 'video' ? (
                    <video src={comment.url} className="w-full h-auto" controls>
                      <track kind="captions" />
                    </video>
                  ) : (
                    <img
                      src={comment.url}
                      alt="Comment media"
                      className="w-full h-auto"
                    />
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center gap-0.5 shrink-0">
              <Button
                onClick={() => onLike(comment.id, isLiked)}
                variant="ghost"
                size="icon"
                className={`w-8 h-8 p-0 transition-colors ${isLiked ? 'text-red-500' : 'text-gray-300 hover:text-red-400'}`}
                title={isLiked ? t('comments.unlike') : t('comments.like')}
              >
                <Heart size={14} fill={isLiked ? 'currentColor' : 'none'} />
              </Button>

              <Button
                onClick={() => onReply(comment)}
                variant="ghost"
                size="icon"
                className="w-8 h-8 p-0 text-gray-300 hover:text-purple-400 transition-colors"
                title={t('comments.reply')}
              >
                <MessageCircle size={14} />
              </Button>

              {isOwner && (
                <Button
                  onClick={() => onDelete(comment.id)}
                  disabled={isDeleting}
                  variant="ghost"
                  size="icon"
                  className="w-8 h-8 p-0 text-gray-300 hover:text-red-400 transition-colors"
                  title={t('comments.delete')}
                >
                  <Trash2 size={14} />
                </Button>
              )}
            </div>
          </div>

          <div className="flex items-center gap-4 mt-1.5">
            <span className="text-xs text-gray-500">
              {new Date(comment.createdAt).toLocaleDateString()}
            </span>
            {likesCount > 0 && (
              <span className="text-xs font-semibold text-gray-500">
                {t(
                  likesCount === 1
                    ? 'comments.likes_count'
                    : 'comments.likes_count_plural',
                  { count: likesCount },
                )}
              </span>
            )}
            <Button
              onClick={() => onReply(comment)}
              variant="ghost"
              className="h-auto p-0 text-xs font-semibold text-gray-500 hover:text-white hover:bg-transparent transition-colors"
            >
              {t('comments.reply')}
            </Button>
          </div>
        </div>
      </div>

      {hasReplies && (
        <div className="space-y-3">
          {comment.replies!.map((reply: Comment) => (
            <CommentItem
              key={reply.id}
              comment={reply}
              postId={postId}
              currentUserId={currentUserId}
              onReply={onReply}
              onDelete={onDelete}
              deletingId={deletingId}
              onLike={onLike}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default function CommentList({
  postId,
  comments,
  isDetailMode,
  captionComponent,
  actionsComponent,
}: CommentListProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { profile } = useAuthStore();
  const [newComment, setNewComment] = useState('');
  const [replyingTo, setReplyingTo] = useState<Comment | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [media, setMedia] = useState<{ url: string; type: string } | null>(
    null,
  );
  const [isUploading, setIsUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const commentMutation = useMutation({
    mutationFn: (data: CreateCommentDto) => commentsApi.create(postId, data),
    onSuccess: () => {
      setNewComment('');
      setReplyingTo(null);
      setMedia(null);
      queryClient.invalidateQueries({ queryKey: ['comments', postId] });
      queryClient.invalidateQueries({ queryKey: ['post', postId] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (commentId: string) => commentsApi.delete(postId, commentId),
    onSuccess: () => {
      setDeletingId(null);
      setShowDeleteConfirm(false);
      queryClient.invalidateQueries({ queryKey: ['comments', postId] });
      queryClient.invalidateQueries({ queryKey: ['post', postId] });
    },
    onError: () => {
      setDeletingId(null);
      setShowDeleteConfirm(false);
    },
  });

  const likeMutation = useMutation({
    mutationFn: ({
      commentId,
      isLiked,
    }: {
      commentId: string;
      isLiked: boolean;
    }) =>
      isLiked
        ? commentsApi.unlike(postId, commentId)
        : commentsApi.like(postId, commentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comments', postId] });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newComment.trim() || media) {
      const actualParentId = replyingTo?.parentId || replyingTo?.id;

      commentMutation.mutate({
        content: newComment,
        parentId: actualParentId,
        url: media?.url,
        mediaType: media?.type,
      });
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await uploadApi.upload(formData);
      setMedia(res.data);
    } catch (err) {
      logger.error('Failed to upload media:', err);
      toast.error(t('comments.upload_error'));
    } finally {
      setIsUploading(false);
    }
  };

  const handleDelete = (commentId: string) => {
    setDeletingId(commentId);
    setShowDeleteConfirm(true);
  };

  const handleConfirmDelete = () => {
    if (deletingId) {
      deleteMutation.mutate(deletingId);
    }
  };

  const handleLike = (commentId: string, isLiked: boolean) => {
    likeMutation.mutate({ commentId, isLiked });
  };

  const handleReply = (comment: Comment) => {
    setReplyingTo(comment);

    if (comment.parentId) {
      setNewComment(`@${comment.user.profile.username} `);
    }

    inputRef.current?.focus();
  };

  const composerForm = (
    <form onSubmit={handleSubmit} className={isDetailMode ? 'p-3 pt-2' : ''}>
      {replyingTo && (
        <div className="flex items-center justify-between bg-white/5 px-2.5 py-1.5 rounded-lg mb-2 text-sm border border-white/10">
          <span className="text-gray-300 truncate">
            {t('comments.replying_to')}{' '}
            <span className="font-bold text-purple-400">
              @{replyingTo.user.profile.username}
            </span>
          </span>
          <Button
            onClick={() => setReplyingTo(null)}
            variant="ghost"
            size="icon"
            className="w-7 h-7 text-gray-300 hover:text-white rounded-full shrink-0"
          >
            <X size={14} />
          </Button>
        </div>
      )}

      {media && (
        <div className="relative inline-block mb-3 group">
          <img
            src={media.url}
            alt="Preview"
            className="w-20 h-20 object-cover rounded-lg border border-white/20"
          />
          <Button
            onClick={() => setMedia(null)}
            variant="danger"
            size="icon"
            className="absolute -top-2 -right-2 w-6 h-6 rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <X size={12} />
          </Button>
        </div>
      )}

      <div className="flex items-center gap-2">
        <input
          type="file"
          ref={fileInputRef}
          className="hidden"
          accept="image/*,video/*"
          onChange={handleFileUpload}
        />
        <Button
          type="button"
          disabled={commentMutation.isPending}
          isLoading={isUploading}
          onClick={() => fileInputRef.current?.click()}
          variant="ghost"
          size="icon"
          className="w-10 h-10 bg-white/5 border border-white/10 rounded-full text-gray-300 hover:text-white hover:bg-white/10 shrink-0"
          aria-label={t('comments.add_media', 'Add media')}
        >
          {!isUploading && <ImageIcon size={18} />}
        </Button>
        <VoiceRecorder
          compact
          onSendVoice={(voiceData) => {
            const commentDto: CreateCommentDto = {
              content: '🎤 Nota de voz',
              parentId: replyingTo?.id,
              voiceUrl: voiceData.voiceUrl,
              voiceDuration: voiceData.voiceDuration,
              voiceWaveform: voiceData.voiceWaveform,
            };
            commentMutation.mutate(commentDto);
          }}
        />
        <input
          ref={inputRef}
          type="text"
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          placeholder={
            replyingTo
              ? t('comments.reply_to_user', {
                  username: replyingTo.user.profile.username,
                })
              : t('comments.add_comment')
          }
          className="flex-1 min-w-0 px-4 py-2.5 bg-white/5 border border-white/10 rounded-full focus:ring-2 focus:ring-purple-500/50 focus:border-transparent text-sm text-white placeholder-gray-500 outline-none transition-all"
        />
        <Button
          type="submit"
          disabled={!newComment.trim() && !media}
          isLoading={commentMutation.isPending}
          variant="primary"
          className="w-10 h-10 shrink-0 !p-0 rounded-full bg-linear-to-r from-purple-600 to-pink-600 border-transparent shadow-lg shadow-purple-500/20 sm:w-auto sm:!px-5 sm:h-10"
          aria-label={t('comments.post')}
        >
          <Send size={16} className="sm:hidden" />
          <span className="hidden sm:inline text-sm font-semibold">
            {t('comments.post')}
          </span>
        </Button>
      </div>
    </form>
  );

  return (
    <div
      className={isDetailMode ? 'flex flex-col h-full min-h-0' : 'space-y-4'}
    >
      <div
        className={
          isDetailMode
            ? 'flex-1 overflow-y-auto px-4 py-3 pb-28 md:pb-3 custom-scrollbar space-y-5 border-t border-white/5 md:border-t-0'
            : 'space-y-4'
        }
      >
        {isDetailMode && captionComponent}

        {comments.map((comment) => (
          <CommentItem
            key={comment.id}
            comment={comment}
            postId={postId}
            currentUserId={profile?.userId}
            onReply={handleReply}
            onDelete={handleDelete}
            deletingId={deletingId}
            onLike={handleLike}
          />
        ))}

        {comments.length === 0 && (
          <div className="text-center py-10 text-gray-500 text-sm">
            {t('comments.no_comments')}
          </div>
        )}
      </div>

      <div
        className={
          isDetailMode
            ? 'shrink-0 border-t border-white/10 bg-black/90 backdrop-blur-xl md:bg-transparent md:backdrop-blur-none sticky bottom-14 md:static z-20 pb-[env(safe-area-inset-bottom)] md:pb-0'
            : 'mt-6 pt-4 border-t border-white/10 sticky bottom-14 lg:bottom-0 bg-black/95 backdrop-blur-md p-4 lg:-mx-4 rounded-t-xl lg:rounded-b-2xl z-20 shadow-2xl'
        }
      >
        {isDetailMode && actionsComponent && (
          <div className="px-3 pt-3 pb-0">{actionsComponent}</div>
        )}
        {composerForm}
      </div>

      <ConfirmModal
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={handleConfirmDelete}
        title={t('comments.delete_title')}
        message={t('comments.delete_warning')}
        confirmText={t('comments.delete')}
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
}
