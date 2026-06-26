import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Heart,
  Image as ImageIcon,
  MessageCircle,
  Trash2,
  X,
} from 'lucide-react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { commentsApi, uploadApi } from '../services';
import { useAuthStore } from '../stores/authStore';
import type { Comment, CreateCommentDto } from '../types';
import UserAvatar from './UserAvatar';
import { Button } from './ui';
import VerificationBadge, { type VerificationLevel } from './VerificationBadge';

interface CommentListProps {
  postId: string;
  comments: Comment[];
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
          className="w-8 h-8 rounded-full object-cover shrink-0"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="text-sm">
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

            <div className="flex items-center gap-1">
              <Button
                onClick={() => onLike(comment.id, isLiked)}
                variant="ghost"
                size="icon"
                className={`w-6 h-6 p-0 transition-colors ${isLiked ? 'text-red-500' : 'text-gray-400 hover:text-red-400'}`}
                title={isLiked ? t('comments.unlike') : t('comments.like')}
              >
                <Heart size={14} fill={isLiked ? 'currentColor' : 'none'} />
              </Button>

              <Button
                onClick={() => onReply(comment)}
                variant="ghost"
                size="icon"
                className="w-6 h-6 p-0 text-gray-400 hover:text-purple-400 transition-colors"
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
                  className="w-6 h-6 p-0 text-gray-400 hover:text-red-400 transition-colors"
                  title={t('comments.delete')}
                >
                  <Trash2 size={14} />
                </Button>
              )}
            </div>
          </div>

          <div className="flex items-center gap-4 mt-1">
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

      {/* Render Replies */}
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

import { logger } from '../utils/logger';
import ConfirmModal from './modals/ConfirmModal';

export default function CommentList({ postId, comments }: CommentListProps) {
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
      // Flatten threading: If replying to a reply (which has a parentId), use THAT parentId (the root).
      // If replying to a root comment (no parentId), use the comment's own ID.
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
      alert('Failed to upload media');
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

    // If replying to a reply (child), pre-fill the username
    if (comment.parentId) {
      setNewComment(`@${comment.user.profile.username} `);
    }

    inputRef.current?.focus();
  };

  return (
    <div className="space-y-4">
      <div className="space-y-4">
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
          <div className="text-center py-8 text-gray-500 text-sm">
            {t('comments.no_comments')}
          </div>
        )}
      </div>

      <form
        onSubmit={handleSubmit}
        className="mt-6 pt-4 border-t border-white/10 sticky bottom-0 bg-black/80 backdrop-blur-md p-4 -mx-4 rounded-b-2xl"
      >
        {replyingTo && (
          <div className="flex items-center justify-between bg-white/5 px-2 py-1 rounded-lg mb-2 text-sm border border-white/10">
            <span className="text-gray-300">
              {t('comments.replying_to')}{' '}
              <span className="font-bold text-purple-400">
                @{replyingTo.user.profile.username}
              </span>
            </span>
            <Button
              onClick={() => setReplyingTo(null)}
              variant="ghost"
              size="icon"
              className="w-6 h-6 text-gray-400 hover:text-white rounded-full"
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

        <div className="flex gap-3">
          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            accept="image/*,video/*"
            onChange={handleFileUpload}
          />
          <Button
            disabled={commentMutation.isPending}
            isLoading={isUploading}
            onClick={() => fileInputRef.current?.click()}
            variant="ghost"
            size="icon"
            className="w-12 h-12 bg-white/5 border border-white/10 rounded-xl text-gray-400 hover:text-white hover:bg-white/10 shrink-0"
          >
            {!isUploading && <ImageIcon size={20} />}
          </Button>
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
            className="flex-1 px-2 py-1 bg-white/5 border border-white/10 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent text-white placeholder-gray-500 outline-none transition-all"
          />
          <Button
            type="submit"
            disabled={!newComment.trim()}
            isLoading={commentMutation.isPending}
            variant="primary"
            className="px-6 py-2 bg-linear-to-r from-purple-600 to-pink-600 font-semibold hover:from-purple-700 hover:to-pink-700 shadow-lg shadow-purple-500/20 border-transparent"
          >
            {t('comments.post')}
          </Button>
        </div>
      </form>

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
