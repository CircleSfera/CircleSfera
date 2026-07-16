import { useQuery } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { commentsApi } from '../../services';
import CommentList from '../CommentList';
import { Button } from '../ui';

interface FrameCommentsModalProps {
  isOpen: boolean;
  onClose: () => void;
  postId: string;
}

export default function FrameCommentsModal({
  isOpen,
  onClose,
  postId,
}: FrameCommentsModalProps) {
  const { t } = useTranslation();
  const drawerRef = useRef<HTMLDivElement>(null);

  const { data: comments, isLoading } = useQuery({
    queryKey: ['comments', postId],
    queryFn: () => commentsApi.getByPost(postId),
    enabled: isOpen && !!postId,
  });

  // Handle escape key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm z-40 transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer */}
      <div
        ref={drawerRef}
        className="absolute bottom-0 left-0 right-0 h-[70vh] md:h-full md:w-[400px] md:left-auto md:right-0 bg-[#121212] rounded-t-3xl md:rounded-none md:rounded-l-3xl z-50 flex flex-col shadow-2xl transition-transform transform translate-y-0 animate-in slide-in-from-bottom md:slide-in-from-right duration-300 border-t md:border-t-0 md:border-l border-white/10"
      >
        {/* Handle for mobile */}
        <div className="w-full flex justify-center pt-3 pb-1 md:hidden">
          <div className="w-12 h-1.5 bg-white/20 rounded-full" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            {t('post.detail.comments')}
            <span className="text-sm font-normal text-gray-300">
              ({comments?.data?.data?.length || 0})
            </span>
          </h2>
          <Button
            onClick={onClose}
            variant="ghost"
            size="icon"
            className="w-8 h-8 rounded-full bg-white/10 text-white hover:bg-white/20"
          >
            <X size={18} />
          </Button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
          {isLoading ? (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500" />
            </div>
          ) : (
            <CommentList
              postId={postId}
              comments={comments?.data?.data || []}
            />
          )}
        </div>
      </div>
    </>
  );
}
