import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { commentsApi } from '../../services';
import CommentList from '../CommentList';
import FrameBottomSheet from '../frames/FrameBottomSheet';
import { LoadingSpinner } from '../LoadingStates';

interface FrameCommentsModalProps {
  isOpen: boolean;
  onClose: () => void;
  postId: string;
  // The Profile that made the frame: it can pin comments.
  authorId?: string;
  // Mobile: bottom drawer overlay. Desktop sidebar: embedded panel beside player.
  variant?: 'drawer' | 'sidebar';
}

function FrameCommentsContent({
  postId,
  authorId,
  variant,
}: {
  postId: string;
  authorId?: string;
  variant: 'drawer' | 'sidebar';
}) {
  const { data: comments, isLoading } = useQuery({
    queryKey: ['comments', postId],
    queryFn: () => commentsApi.getByPost(postId),
    enabled: !!postId,
  });

  const isSidebar = variant === 'sidebar';

  if (isLoading) {
    return (
      <div className="flex items-center justify-center flex-1 min-h-[120px]">
        <LoadingSpinner size="md" />
      </div>
    );
  }

  return (
    <CommentList
      postId={postId}
      postAuthorId={authorId}
      comments={comments?.data?.data || []}
      isDetailMode
      compactComposer={isSidebar}
      frameContext={variant === 'drawer'}
    />
  );
}

export default function FrameCommentsModal({
  isOpen,
  onClose,
  postId,
  authorId,
  variant = 'drawer',
}: FrameCommentsModalProps) {
  const { t } = useTranslation();

  const { data: comments } = useQuery({
    queryKey: ['comments', postId],
    queryFn: () => commentsApi.getByPost(postId),
    enabled: !!postId && isOpen,
  });

  const commentCount = comments?.data?.data?.length || 0;
  const titleId = `frame-comments-title-${postId}`;

  if (!isOpen) return null;

  if (variant === 'sidebar') {
    return (
      <div
        role="dialog"
        aria-labelledby={titleId}
        className="h-full min-h-0 w-full bg-surface-elevated flex flex-col md:rounded-r-[20px] overflow-hidden"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0">
          <h2
            id={titleId}
            className="text-base font-bold text-white flex items-center gap-2 min-w-0"
          >
            {t('post.detail.comments')}
            <span className="text-sm font-normal text-white/60 shrink-0">
              ({commentCount})
            </span>
          </h2>
        </div>
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          <FrameCommentsContent
            postId={postId}
            authorId={authorId}
            variant="sidebar"
          />
        </div>
      </div>
    );
  }

  return (
    <FrameBottomSheet
      isOpen
      onClose={onClose}
      title={
        <>
          {t('post.detail.comments')}
          <span className="text-sm font-normal text-white/60 ml-1.5">
            ({commentCount})
          </span>
        </>
      }
      titleId={titleId}
      maxHeightClass="max-h-[58%]"
    >
      <FrameCommentsContent
        postId={postId}
        authorId={authorId}
        variant="drawer"
      />
    </FrameBottomSheet>
  );
}
