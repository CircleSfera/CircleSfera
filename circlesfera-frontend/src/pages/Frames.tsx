import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { EmptyState, ErrorState } from '../components/ErrorEmptyStates';
import FrameItem from '../components/FrameItem';
import FrameOptionsSheet, {
  type FrameMenuActions,
} from '../components/frames/FrameOptionsSheet';
import { LoadingSpinner } from '../components/LoadingStates';
import AddToCollectionModal from '../components/modals/AddToCollectionModal';
import FrameCommentsModal from '../components/modals/FrameCommentsModal';
import SharePostModal from '../components/modals/SharePostModal';
import { postsApi } from '../services';
import { useAuthStore } from '../stores/authStore';
import type { PaginatedResponse, Post } from '../types';

export default function Frames() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const targetPostId = searchParams.get('post');
  const handledCheckoutReturn = useRef(false);
  const scrolledToTarget = useRef(false);
  const [activeFrameIndex, setActiveFrameIndex] = useState(0);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuActions, setMenuActions] = useState<FrameMenuActions | null>(null);
  const profile = useAuthStore((state) => state.profile);
  const containerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
    refetch,
  } = useInfiniteQuery<PaginatedResponse<Post>>({
    queryKey: ['frames'],
    queryFn: async ({ pageParam }) => {
      const res = await postsApi.getFrames(pageParam as number, 10);
      return res.data;
    },
    getNextPageParam: (lastPage) => {
      if (lastPage.meta.page < lastPage.meta.totalPages) {
        return lastPage.meta.page + 1;
      }
      return undefined;
    },
    initialPageParam: 1,
  });

  const { data: targetPostResponse } = useQuery({
    queryKey: ['post', targetPostId],
    queryFn: () => postsApi.getById(targetPostId!),
    enabled: !!targetPostId,
  });

  const frames = data?.pages.flatMap((page) => page.data) || [];

  const displayFrames = useMemo(() => {
    const target = targetPostResponse?.data;
    if (target?.type !== 'FRAME') return frames;
    if (frames.some((frame) => frame.id === target.id)) return frames;
    return [target, ...frames];
  }, [frames, targetPostResponse]);

  useEffect(() => {
    if (handledCheckoutReturn.current) return;
    const success = searchParams.get('success') === 'true';
    const canceled = searchParams.get('canceled') === 'true';
    if (!success && !canceled) return;

    handledCheckoutReturn.current = true;

    if (success) {
      toast.success(t('frames.checkout_success'));
      queryClient.invalidateQueries({ queryKey: ['frames'] });
    } else {
      toast.error(t('frames.checkout_canceled'));
    }

    const next = new URLSearchParams(searchParams);
    next.delete('success');
    next.delete('canceled');
    next.delete('session_id');
    setSearchParams(next, { replace: true });
  }, [queryClient, searchParams, setSearchParams, t]);

  useEffect(() => {
    scrolledToTarget.current = false;
    void targetPostId;
  }, [targetPostId]);

  useEffect(() => {
    if (
      !targetPostId ||
      scrolledToTarget.current ||
      displayFrames.length === 0 ||
      isLoading
    ) {
      return;
    }

    const index = displayFrames.findIndex((frame) => frame.id === targetPostId);
    if (index < 0) return;

    setActiveFrameIndex(index);
    scrolledToTarget.current = true;

    const frameId = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        itemRefs.current[index]?.scrollIntoView();
      });
    });

    return () => cancelAnimationFrame(frameId);
  }, [targetPostId, displayFrames, isLoading]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const index = Number(entry.target.getAttribute('data-index'));
            setActiveFrameIndex((prev) => {
              if (prev !== index) {
                setCommentsOpen(false);
                setShareOpen(false);
                setSaveOpen(false);
                setMenuOpen(false);
              }
              return index;
            });

            if (
              index >= displayFrames.length - 3 &&
              hasNextPage &&
              !isFetchingNextPage
            ) {
              fetchNextPage();
            }
          }
        });
      },
      {
        root: containerRef.current,
        threshold: 0.5,
      },
    );

    itemRefs.current.forEach((ref) => {
      if (ref) observer.observe(ref);
    });

    return () => observer.disconnect();
  }, [displayFrames.length, hasNextPage, isFetchingNextPage, fetchNextPage]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        document.activeElement?.tagName === 'INPUT' ||
        document.activeElement?.tagName === 'TEXTAREA'
      ) {
        return;
      }

      if (['ArrowDown', 'ArrowUp'].includes(e.key)) {
        e.preventDefault();
        const newIndex =
          e.key === 'ArrowDown'
            ? Math.min(activeFrameIndex + 1, displayFrames.length - 1)
            : Math.max(activeFrameIndex - 1, 0);

        itemRefs.current[newIndex]?.scrollIntoView({ behavior: 'smooth' });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeFrameIndex, displayFrames.length]);

  useEffect(() => {
    return () => {
      containerRef.current?.querySelectorAll('video').forEach((video) => {
        video.pause();
      });
    };
  }, []);

  if (isLoading) {
    return (
      <div className="h-full min-h-0 w-full flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="h-full min-h-0 w-full flex items-center justify-center">
        <ErrorState
          title={t('frames.load_error_title')}
          message={t('frames.load_error_message')}
          onRetry={() => refetch()}
        />
      </div>
    );
  }

  if (frames.length === 0 && !targetPostId) {
    return (
      <div className="h-full min-h-0 w-full flex items-center justify-center">
        <EmptyState
          icon="posts"
          title={t('frames.no_frames')}
          message={t('frames.be_first')}
        />
      </div>
    );
  }

  if (displayFrames.length === 0) {
    return (
      <div className="h-full min-h-0 w-full flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  const activeFrame = displayFrames[activeFrameIndex];
  const verificationLevel =
    profile?.verificationLevel || profile?.verificationLevel;
  const isFrameOwner = profile?.id === activeFrame?.profileId;
  const canPromoteFrame = verificationLevel === 'ELITE' && isFrameOwner;
  const blurredBgImage =
    activeFrame?.media?.[0]?.thumbnailUrl || activeFrame?.media?.[0]?.url;

  // Desktop player height cap: 9:16 at 390px width, bounded by viewport
  const desktopStageClass =
    'md:max-h-[min(calc(100dvh-6rem),693px)] md:h-[min(calc(100dvh-6rem),693px)]';

  return (
    <div
      className="h-full min-h-0 w-full flex flex-col max-md:px-3 max-md:pt-1 max-md:pb-0 md:items-center md:justify-center relative overflow-hidden"
      data-content-shell="vertical"
    >
      <div className="hidden md:block absolute inset-0 z-0">
        {blurredBgImage && (
          <>
            <img
              src={blurredBgImage}
              alt=""
              className="w-full h-full object-cover opacity-40 blur-[80px] transition-all duration-700 ease-in-out scale-110"
            />
            <div className="absolute inset-0 bg-black/40" />
          </>
        )}
      </div>

      <div
        className={`flex flex-1 min-h-0 w-full max-md:h-full md:flex-none md:justify-center md:items-center md:py-4 ${desktopStageClass}`}
      >
        <div
          className={`flex h-full min-h-0 w-full max-md:flex-col md:flex-row md:items-stretch md:overflow-hidden md:shadow-[0_0_50px_rgba(0,0,0,0.5)] md:border md:border-white/10 md:rounded-[20px] ${
            commentsOpen ? 'md:w-auto' : 'md:w-97.5'
          }`}
        >
          <div
            className={`relative h-full min-h-0 w-full max-md:max-w-97.5 max-md:mx-auto md:w-97.5 md:shrink-0 ${
              commentsOpen ? 'md:rounded-l-[20px]' : 'md:rounded-[20px]'
            }`}
          >
            <div
              ref={containerRef}
              className={`h-full w-full overflow-y-scroll overscroll-y-none snap-y snap-mandatory scrollbar-hide bg-black max-md:rounded-[20px] max-md:border max-md:border-white/10 max-md:shadow-[0_8px_32px_rgba(0,0,0,0.45)] md:rounded-[inherit] md:bg-black/20 md:backdrop-blur-3xl relative z-10 md:border-0 md:shadow-none ${
                commentsOpen ? 'md:rounded-r-none' : ''
              }`}
            >
              {displayFrames.map((frame, index) => {
                const isNear = Math.abs(activeFrameIndex - index) <= 2;
                const isNext = index === activeFrameIndex + 1;
                const isActive = index === activeFrameIndex;

                return (
                  <div
                    key={frame.id}
                    ref={(el) => {
                      itemRefs.current[index] = el;
                    }}
                    data-index={index}
                    className="h-full w-full snap-start snap-always relative bg-black max-md:rounded-[20px] md:bg-transparent flex flex-col justify-center overflow-hidden"
                  >
                    {isNear ? (
                      <FrameItem
                        post={frame}
                        isActive={isActive}
                        isNext={isNext}
                        onCommentsOpen={() => {
                          setShareOpen(false);
                          setSaveOpen(false);
                          setMenuOpen(false);
                          setCommentsOpen(true);
                        }}
                        onShareOpen={() => {
                          setCommentsOpen(false);
                          setSaveOpen(false);
                          setMenuOpen(false);
                          setShareOpen(true);
                        }}
                        onSaveOpen={() => {
                          setCommentsOpen(false);
                          setShareOpen(false);
                          setMenuOpen(false);
                          setSaveOpen(true);
                        }}
                        onMenuOpen={() => {
                          setCommentsOpen(false);
                          setShareOpen(false);
                          setSaveOpen(false);
                          setMenuOpen(true);
                        }}
                        onRegisterMenuActions={
                          isActive ? setMenuActions : undefined
                        }
                      />
                    ) : (
                      <div className="w-full h-full bg-surface-raised/50 animate-pulse" />
                    )}
                  </div>
                );
              })}
              {isFetchingNextPage && (
                <div className="h-full w-full snap-start flex items-center justify-center bg-black md:bg-transparent">
                  <LoadingSpinner size="md" />
                </div>
              )}
            </div>

            {activeFrame && (
              <div className="absolute inset-0 z-50 pointer-events-none overflow-hidden rounded-[inherit]">
                {commentsOpen && (
                  <div className="md:hidden absolute inset-0">
                    <FrameCommentsModal
                      variant="drawer"
                      isOpen
                      postId={activeFrame.id}
                      onClose={() => setCommentsOpen(false)}
                    />
                  </div>
                )}
                {shareOpen && (
                  <SharePostModal
                    presentation="frame"
                    isOpen
                    post={activeFrame}
                    onClose={() => setShareOpen(false)}
                  />
                )}
                {saveOpen && (
                  <AddToCollectionModal
                    presentation="frame"
                    isOpen
                    postId={activeFrame.id}
                    onClose={() => setSaveOpen(false)}
                  />
                )}
                {menuOpen && menuActions && (
                  <FrameOptionsSheet
                    presentation="frame"
                    isOpen
                    isOwner={isFrameOwner}
                    onClose={() => setMenuOpen(false)}
                    onEdit={menuActions.onEdit}
                    onDelete={menuActions.onDelete}
                    onReport={menuActions.onReport}
                    onSave={menuActions.onSave}
                    onPromote={
                      canPromoteFrame ? menuActions.onPromote : undefined
                    }
                  />
                )}
              </div>
            )}
          </div>

          {commentsOpen && activeFrame && (
            <div className="hidden md:flex md:w-90 md:shrink-0 md:min-h-0 md:h-full md:border-l md:border-white/10 relative z-10">
              <FrameCommentsModal
                variant="sidebar"
                isOpen
                postId={activeFrame.id}
                onClose={() => setCommentsOpen(false)}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
