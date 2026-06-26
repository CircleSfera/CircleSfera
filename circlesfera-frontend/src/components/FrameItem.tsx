import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Bookmark,
  Heart,
  MessageCircle,
  MoreHorizontal,
  Music,
  Pause,
  Play,
  Share2,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { followsApi } from '../services';
import { creatorApi } from '../services/creator.service';
import { useAuthStore } from '../stores/authStore';
import type { Post } from '../types';
import { logger } from '../utils/logger';
import LikeButton from './LikeButton';
import RichText from './RichText';

interface FrameItemProps {
  post: Post;
  isActive: boolean;
}

export default function FrameItem({ post, isActive }: FrameItemProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const watchTimeRef = useRef(0);
  const lastUpdateRef = useRef(Date.now());
  const lastTimeRef = useRef(0);
  const [showHeartAnim, setShowHeartAnim] = useState(false);
  const [likesCount, setLikesCount] = useState(post._count?.likes || 0);
  const { profile } = useAuthStore();
  const queryClient = useQueryClient();
  const { pathname } = useLocation();

  const [showPlayAnim, setShowPlayAnim] = useState<'play' | 'pause' | null>(
    null,
  );
  const [isCaptionExpanded, setIsCaptionExpanded] = useState(false);

  // biome-ignore lint/correctness/useExhaustiveDependencies: Scroll on route change
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  useEffect(() => {
    if (isActive && videoRef.current) {
      videoRef.current.currentTime = 0;
      videoRef.current.play().catch(() => {
        logger.log('Autoplay blocked');
      });
      lastUpdateRef.current = Date.now();
      lastTimeRef.current = 0;
    } else if (videoRef.current) {
      videoRef.current.pause();
      // Send accumulated watch time when deactivating
      if (watchTimeRef.current > 1) {
        creatorApi.trackFrameWatch(post.id, watchTimeRef.current);
        watchTimeRef.current = 0;
      }
    }
  }, [isActive, post.id]);

  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    const current = videoRef.current.currentTime;

    // Detect loop
    if (current < lastTimeRef.current - 1) {
      creatorApi.trackFrameLoop(post.id);
    }

    // Accumulate watch time
    const now = Date.now();
    const diff = (now - lastUpdateRef.current) / 1000;
    if (diff > 0 && diff < 2) {
      watchTimeRef.current += diff;
    }

    lastUpdateRef.current = now;
    lastTimeRef.current = current;

    // Batch send watch time every 10 seconds
    if (watchTimeRef.current >= 10) {
      creatorApi.trackFrameWatch(post.id, watchTimeRef.current);
      watchTimeRef.current = 0;
    }
  };

  const followMutation = useMutation({
    mutationFn: () => followsApi.toggle(post.user.profile.username),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['frames'] });
    },
  });

  let clickTimeout: ReturnType<typeof setTimeout> | null = null;

  const handleVideoClick = () => {
    if (clickTimeout !== null) {
      // Double click
      clearTimeout(clickTimeout);
      clickTimeout = null;
      handleDoubleTap();
    } else {
      // Single click
      clickTimeout = setTimeout(() => {
        clickTimeout = null;
        if (!videoRef.current) return;
        if (videoRef.current.paused) {
          videoRef.current.play();
          setShowPlayAnim('play');
        } else {
          videoRef.current.pause();
          setShowPlayAnim('pause');
        }
        setTimeout(() => setShowPlayAnim(null), 800);
      }, 250);
    }
  };

  const handleDoubleTap = () => {
    setShowHeartAnim(true);
    setTimeout(() => setShowHeartAnim(false), 1000);
  };

  const isOwner = profile?.userId === post.userId;

  const videoMedia = post.media?.find((m) => m.type === 'video') ||
    post.media?.[0] || { url: '' };

  return (
    <div className="w-full h-full bg-black relative flex items-center justify-center snap-start md:rounded-[16px] overflow-hidden">
      {/* Video Area */}
      <button
        type="button"
        className="absolute inset-0 w-full h-full border-none p-0 z-10 focus:outline-none bg-transparent"
        onClick={handleVideoClick}
        aria-label="Video playback area"
      >
        <video
          ref={videoRef}
          src={videoMedia.url}
          className="w-full h-full object-cover md:rounded-[16px]"
          loop
          playsInline
          muted={false}
          onTimeUpdate={handleTimeUpdate}
        >
          <track kind="captions" />
        </video>

        {/* Double Tap Heart Animation */}
        {showHeartAnim && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-30">
            <Heart
              size={100}
              className="fill-red-500 text-red-500 opacity-0 animate-heart-pop drop-shadow-[0_0_20px_rgba(255,0,0,0.5)]"
            />
          </div>
        )}

        {/* Play/Pause Animation Overlay */}
        {showPlayAnim && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-30">
            <div className="bg-black/40 backdrop-blur-md rounded-full p-6 animate-out fade-out zoom-out duration-500">
              {showPlayAnim === 'play' ? (
                <Play size={48} className="text-white fill-white" />
              ) : (
                <Pause size={48} className="text-white fill-white" />
              )}
            </div>
          </div>
        )}
      </button>

      {/* Overlay Gradients */}
      <div className="absolute bottom-0 left-0 right-0 h-2/3 bg-linear-to-t from-black/90 via-black/40 to-transparent pointer-events-none z-10" />
      <div className="absolute top-0 left-0 right-0 h-32 bg-linear-to-b from-black/50 to-transparent pointer-events-none z-10" />

      {/* Main Info Area (Bottom) */}
      <div className="absolute bottom-0 left-0 right-14 pb-4 px-4 flex flex-col justify-end z-20 pointer-events-none">
        {/* User Info Row */}
        <div className="flex items-center gap-2.5 mb-2.5 pointer-events-auto">
          <Link
            to={`/${post.user.profile.username}`}
            className="relative shrink-0"
          >
            <img
              src={post.user.profile.avatar || '#noimage'}
              alt={post.user.profile.username}
              className="w-9 h-9 rounded-full object-cover border border-white/20 shadow-md"
            />
          </Link>
          <Link
            to={`/${post.user.profile.username}`}
            className="font-semibold text-[15px] text-white drop-shadow-md hover:opacity-80 transition-opacity"
          >
            {post.user.profile.username}
          </Link>
          {!isOwner && (
            <button
              type="button"
              onClick={() => followMutation.mutate()}
              className="ml-1 px-3 py-1 bg-transparent border border-white/80 rounded-lg text-xs font-semibold text-white transition-all active:scale-95 hover:bg-white/10"
            >
              Seguir
            </button>
          )}
        </div>

        {/* Caption Area */}
        {post.caption && (
          <div className="pointer-events-auto mb-3 pr-2">
            <div
              className={`text-sm text-white drop-shadow-md transition-all ${
                isCaptionExpanded ? '' : 'line-clamp-2'
              }`}
            >
              <RichText text={post.caption} />
            </div>
            {post.caption.length > 80 && (
              <button
                type="button"
                onClick={() => setIsCaptionExpanded(!isCaptionExpanded)}
                className="text-white/70 text-xs font-semibold mt-1 drop-shadow-md"
              >
                {isCaptionExpanded ? 'menos' : 'más'}
              </button>
            )}
          </div>
        )}

        {/* Audio Track Marquee */}
        <div className="flex items-center gap-2 pointer-events-auto text-white drop-shadow-md">
          <Music size={14} className="shrink-0" />
          <div className="overflow-hidden whitespace-nowrap w-48 relative mask-[linear-gradient(to_right,white_80%,transparent)]">
            <div className="animate-marquee inline-block text-[13px]">
              {post.user.profile.username} • Audio original
            </div>
          </div>
        </div>
      </div>

      {/* Right Sidebar Actions */}
      <div className="absolute bottom-4 right-2 w-14 flex flex-col items-center justify-end gap-5 z-20 pointer-events-auto">
        <div className="flex flex-col items-center gap-1 group">
          <LikeButton
            postId={post.id}
            iconClassName="w-7 h-7 drop-shadow-lg"
            onToggle={(newLiked) => {
              setLikesCount((prev) => (newLiked ? prev + 1 : prev - 1));
            }}
          />
          <span className="text-white font-semibold text-[13px] drop-shadow-md">
            {likesCount}
          </span>
        </div>

        <Link
          to={`/p/${post.id}`}
          className="flex flex-col items-center gap-1 group transition-transform active:scale-90"
        >
          <MessageCircle size={28} className="text-white drop-shadow-lg" />
          <span className="text-white font-semibold text-[13px] drop-shadow-md">
            {post._count?.comments || 0}
          </span>
        </Link>

        <button
          type="button"
          className="flex flex-col items-center gap-1 transition-transform active:scale-90"
        >
          <Share2 size={28} className="text-white drop-shadow-lg" />
        </button>

        <button
          type="button"
          className="flex flex-col items-center gap-1 transition-transform active:scale-90"
        >
          <Bookmark size={26} className="text-white drop-shadow-lg" />
        </button>

        <button
          type="button"
          className="flex flex-col items-center gap-1 transition-transform active:scale-90"
        >
          <MoreHorizontal size={24} className="text-white drop-shadow-lg" />
        </button>

        {/* Spinning Music Record */}
        <div className="mt-2 w-10 h-10 rounded-[8px] bg-surface-raised border-2 border-white/20 overflow-hidden flex items-center justify-center shadow-lg relative shrink-0">
          <img
            src={post.user.profile.avatar || '#noimage'}
            alt="Audio"
            className="w-6 h-6 rounded-full object-cover animate-[spin_4s_linear_infinite]"
          />
        </div>
      </div>
    </div>
  );
}
