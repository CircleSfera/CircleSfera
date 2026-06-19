import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Bookmark,
  Heart,
  MessageCircle,
  MoreHorizontal,
  Share2,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { followsApi } from '../services';
import { useAuthStore } from '../stores/authStore';
import type { Post } from '../types';
import { logger } from '../utils/logger';
import LikeButton from './LikeButton';
import RichText from './RichText';

interface FrameItemProps {
  post: Post;
  isActive: boolean;
}

import { creatorApi } from '../services/creator.service';

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
      // Sanity check
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

  const handleDoubleTap = () => {
    setShowHeartAnim(true);
    setTimeout(() => setShowHeartAnim(false), 1000);
  };

  const isOwner = profile?.userId === post.userId;

  const videoMedia = post.media?.find((m) => m.type === 'video') ||
    post.media?.[0] || { url: '' };

  return (
    <div className="w-full h-full bg-black relative flex items-center justify-center snap-start">
      {/* Video Area */}
      <button
        type="button"
        className="absolute inset-0 w-full h-full border-none p-0 z-10 focus:outline-none"
        onDoubleClick={handleDoubleTap}
        aria-label="Video playback area"
      >
        <video
          ref={videoRef}
          src={videoMedia.url}
          className="w-full h-full object-cover"
          loop
          playsInline
          muted={false}
          onTimeUpdate={handleTimeUpdate}
          onClick={(e) => {
            if (e.currentTarget.paused) e.currentTarget.play();
            else e.currentTarget.pause();
          }}
        >
          <track kind="captions" />
        </video>

        {/* Double Tap Heart Animation */}
        {showHeartAnim && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-30">
            <Heart
              size={120}
              className="fill-white text-white opacity-0 animate-heart-pop drop-shadow-2xl"
            />
          </div>
        )}
      </button>

      {/* Overlay Gradients */}
      <div className="absolute bottom-0 left-0 right-0 h-1/2 bg-linear-to-t from-black/80 via-black/20 to-transparent pointer-events-none z-10" />
      <div className="absolute top-0 left-0 right-0 h-24 bg-linear-to-b from-black/40 to-transparent pointer-events-none z-10" />

      {/* Bottom Left Info */}
      <div className="absolute bottom-0 left-0 right-16 p-4 flex flex-col justify-end z-20 pointer-events-none">
        <div className="flex items-center gap-3 mb-3 pointer-events-auto">
          <Link
            to={`/${post.user.profile.username}`}
            className="relative shrink-0"
          >
            <img
              src={post.user.profile.avatar || '#noimage'}
              alt={post.user.profile.username}
              className="w-10 h-10 rounded-full object-cover border border-white/20 shadow-md"
            />
          </Link>
          <Link
            to={`/${post.user.profile.username}`}
            className="font-bold text-[15px] text-white drop-shadow-md hover:underline"
          >
            {post.user.profile.username}
          </Link>
          {!isOwner && (
            <button
              type="button"
              onClick={() => followMutation.mutate()}
              className="ml-2 px-3 py-1 bg-transparent border border-white rounded-full text-xs font-bold text-white transition-all transform active:scale-95"
            >
              Follow
            </button>
          )}
        </div>

        {post.caption && (
          <div className="text-sm text-white drop-shadow-md line-clamp-2 mb-2 pointer-events-auto">
            <RichText text={post.caption} />
          </div>
        )}
      </div>

      {/* Right Sidebar Actions */}
      <div className="absolute bottom-0 right-0 w-16 pb-6 flex flex-col items-center justify-end gap-4 z-20 pointer-events-auto">
        <div className="flex flex-col items-center gap-1 group">
          <LikeButton
            postId={post.id}
            onToggle={(newLiked) => {
              setLikesCount((prev) => (newLiked ? prev + 1 : prev - 1));
            }}
          />
          <span className="text-white font-semibold text-xs drop-shadow-md">
            {likesCount}
          </span>
        </div>

        <Link
          to={`/p/${post.id}`}
          className="flex flex-col items-center gap-1 group transition-transform active:scale-90"
        >
          <MessageCircle size={28} className="text-white drop-shadow-lg" />
          <span className="text-white font-semibold text-xs drop-shadow-md">
            {post._count?.comments || 0}
          </span>
        </Link>

        <button
          type="button"
          className="flex flex-col items-center gap-1 transition-transform active:scale-90"
        >
          <Share2 size={28} className="text-white drop-shadow-lg" />
          <span className="text-white font-semibold text-xs drop-shadow-md">
            Share
          </span>
        </button>

        <button
          type="button"
          className="transition-transform active:scale-90 flex flex-col items-center gap-1 group"
        >
          <Bookmark size={26} className="text-white drop-shadow-lg" />
          <span className="text-white font-semibold text-xs drop-shadow-md">
            Save
          </span>
        </button>

        <button type="button" className="transition-transform active:scale-90">
          <MoreHorizontal size={24} className="text-white drop-shadow-lg" />
        </button>

        <div className="mt-4 w-9 h-9 rounded-md bg-white/20 border border-white/40 overflow-hidden flex items-center justify-center">
          <img
            src={post.user.profile.avatar || '#noimage'}
            alt="Audio"
            className="w-full h-full object-cover animate-[spin_4s_linear_infinite]"
          />
        </div>
      </div>
    </div>
  );
}
