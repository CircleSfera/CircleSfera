import { useInfiniteQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import FrameItem from '../components/FrameItem';
import { LoadingSpinner } from '../components/LoadingStates';
import { postsApi } from '../services';
import type { PaginatedResponse, Post } from '../types';

export default function Frames() {
  const { t } = useTranslation();
  const [activeFrameIndex, setActiveFrameIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } =
    useInfiniteQuery<PaginatedResponse<Post>>({
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

  const frames = data?.pages.flatMap((page) => page.data) || [];

  // Use IntersectionObserver to track the active frame
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const index = Number(entry.target.getAttribute('data-index'));
            setActiveFrameIndex(index);

            // Fetch next page if near the end
            if (
              index >= frames.length - 3 &&
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
        threshold: 0.6, // Trigger when 60% of the frame is visible
      },
    );

    itemRefs.current.forEach((ref) => {
      if (ref) observer.observe(ref);
    });

    return () => observer.disconnect();
  }, [frames.length, hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Keyboard navigation for desktop
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't interfere if user is typing in an input (e.g. comments)
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
            ? Math.min(activeFrameIndex + 1, frames.length - 1)
            : Math.max(activeFrameIndex - 1, 0);

        itemRefs.current[newIndex]?.scrollIntoView({ behavior: 'smooth' });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeFrameIndex, frames.length]);

  if (isLoading) {
    return (
      <div className="h-screen w-full flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (frames.length === 0) {
    return (
      <div className="h-screen w-full flex items-center justify-center text-white">
        <div className="text-center">
          <h2 className="text-xl font-bold mb-2">{t('frames.no_frames')}</h2>
          <p className="text-gray-300">{t('frames.be_first')}</p>
        </div>
      </div>
    );
  }

  const activeFrame = frames[activeFrameIndex];
  const blurredBgImage =
    activeFrame?.media?.[0]?.thumbnailUrl || activeFrame?.media?.[0]?.url;

  return (
    <div className="h-dvh md:h-screen w-full flex flex-col items-start md:justify-center md:items-center relative overflow-hidden">
      {/* Dynamic blurred background for desktop */}
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

      {/* Mobile: Edge-to-edge, Desktop: Center-aligned player */}
      <div
        ref={containerRef}
        className="h-[calc(100dvh-4.25rem-env(safe-area-inset-bottom,0px))] w-full md:h-[calc(100vh-40px)] md:w-[450px] md:max-w-full md:rounded-[30px] mx-auto overflow-y-scroll snap-y snap-mandatory scrollbar-hide bg-black md:bg-black/20 md:backdrop-blur-3xl relative z-10 md:shadow-[0_0_50px_rgba(0,0,0,0.5)] md:border md:border-white/10"
        style={{ scrollBehavior: 'smooth' }}
      >
        {frames.map((frame, index) => {
          // Virtualization: Only render the active frame and its immediate neighbors
          const isNear = Math.abs(activeFrameIndex - index) <= 1;
          const isNext = index === activeFrameIndex + 1;

          return (
            <div
              key={frame.id}
              ref={(el) => {
                itemRefs.current[index] = el;
              }}
              data-index={index}
              className="h-[calc(100dvh-4.25rem-env(safe-area-inset-bottom,0px))] md:h-full w-full snap-start relative bg-black md:bg-transparent flex flex-col justify-center"
            >
              {isNear ? (
                <FrameItem
                  post={frame}
                  isActive={index === activeFrameIndex}
                  isNext={isNext}
                />
              ) : (
                <div className="w-full h-full bg-zinc-900/50 animate-pulse" />
              )}
            </div>
          );
        })}
        {isFetchingNextPage && (
          <div className="h-[calc(100dvh-4.25rem-env(safe-area-inset-bottom,0px))] md:h-full w-full snap-start flex items-center justify-center bg-black md:bg-transparent">
            <LoadingSpinner size="md" />
          </div>
        )}
      </div>
    </div>
  );
}
