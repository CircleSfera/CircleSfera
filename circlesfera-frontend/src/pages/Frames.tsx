import { useInfiniteQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import FrameItem from '../components/FrameItem';
import { LoadingSpinner } from '../components/LoadingStates';
import { postsApi } from '../services';
import type { PaginatedResponse, Post } from '../types';

export default function Frames() {
  const [activeFrameIndex, setActiveFrameIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

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

  // Handle scroll snap detection to set active frame
  const handleScroll = useCallback(() => {
    if (!containerRef.current) return;
    const { scrollTop, clientHeight } = containerRef.current;
    const index = Math.round(scrollTop / clientHeight);

    if (index !== activeFrameIndex) {
      setActiveFrameIndex(index);
    }

    // Load more when reaching near end
    if (index >= frames.length - 3 && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [
    activeFrameIndex,
    frames.length,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  ]);

  useEffect(() => {
    const container = containerRef.current;
    if (container) {
      container.addEventListener('scroll', handleScroll);
      return () => container.removeEventListener('scroll', handleScroll);
    }
  }, [handleScroll]);

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
          <h2 className="text-xl font-bold mb-2">No Frames Yet</h2>
          <p className="text-gray-400">Be the first to post a Frame!</p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="h-screen w-full max-w-[450px] mx-auto overflow-y-scroll snap-y snap-mandatory scrollbar-hide border-x border-white/10"
      style={{ scrollBehavior: 'smooth' }}
    >
      {frames.map((frame, index) => (
        <div key={frame.id} className="h-full w-full snap-start relative">
          <FrameItem post={frame} isActive={index === activeFrameIndex} />
        </div>
      ))}
      {isFetchingNextPage && (
        <div className="h-full w-full snap-start flex items-center justify-center">
          <LoadingSpinner size="md" />
        </div>
      )}
    </div>
  );
}
