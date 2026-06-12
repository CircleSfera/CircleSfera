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
    <div className="w-full h-full p-2 flex items-center justify-center">
      <div className="glass-panel-post w-full h-full rounded-2xl overflow-hidden flex flex-col relative">
        {/* Header - PostCard Style */}
        <div className="p-3 flex items-center gap-3 border-b border-white/5 bg-black/20 backdrop-blur-sm z-20">
          <Link to={`/${post.user.profile.username}`} className="relative">
            <div className="absolute -inset-0.5 bg-linear-to-tr from-brand-primary to-brand-blue rounded-full opacity-70 blur-sm"></div>
            <img
              src={post.user.profile.avatar || '#noimage'}
              alt={post.user.profile.username}
              className="relative w-8 h-8 rounded-full object-cover border border-white/20"
            />
          </Link>
          <div className="flex-1 min-w-0">
            <Link
              to={`/${post.user.profile.username}`}
              className="hover:opacity-80 transition-opacity"
            >
              <div className="font-semibold text-sm text-white truncate">
                {post.user.profile.fullName || post.user.profile.username}
              </div>
              <div className="text-xs text-gray-400 truncate">
                @{post.user.profile.username}
              </div>
            </Link>
          </div>

          {!isOwner && (
            <button
              type="button"
              onClick={() => followMutation.mutate()}
              className="px-3 py-1 bg-white/10 hover:bg-white/20 border border-white/10 rounded-full text-xs font-bold text-white transition-all transform active:scale-95"
            >
              Follow
            </button>
          )}

          <button
            type="button"
            className="p-1.5 rounded-full hover:bg-white/10 transition-colors"
          >
            <MoreHorizontal size={20} className="text-gray-400" />
          </button>
        </div>

        {/* Video Area */}
        <button
          type="button"
          className="flex-1 relative bg-black overflow-hidden flex items-center justify-center border-none p-0 w-full"
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
                size={100}
                className={`fill-white text-white opacity-0 animate-heart-pop`}
              />
            </div>
          )}
        </button>

        {/* Footer - PostCard Style */}
        <div className="p-4 bg-black/40 backdrop-blur-md border-t border-white/5 z-20">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-5">
              <LikeButton
                postId={post.id}
                onToggle={(newLiked) => {
                  setLikesCount((prev) => (newLiked ? prev + 1 : prev - 1));
                }}
              />
              <Link
                to={`/p/${post.id}`}
                className="hover:scale-110 transition-transform"
              >
                <MessageCircle
                  size={26}
                  className="text-white/70 hover:text-white transition-colors"
                />
              </Link>
              <button
                type="button"
                className="hover:scale-110 transition-transform"
              >
                <Share2
                  size={26}
                  className="text-white/70 hover:text-white transition-colors"
                />
              </button>
            </div>
            <button
              type="button"
              className="hover:scale-110 transition-transform"
            >
              <Bookmark
                size={26}
                className="text-white/70 hover:text-white transition-colors"
              />
            </button>
          </div>

          <div className="font-bold text-sm mb-2 text-white">
            {likesCount} likes
          </div>

          {post.caption && (
            <div className="text-sm text-gray-200 mb-2 line-clamp-3">
              <Link
                to={`/${post.user.profile.username}`}
                className="font-bold text-white mr-2 hover:underline"
              >
                {post.user.profile.username}
              </Link>
              <RichText text={post.caption} />
            </div>
          )}

          <div className="text-[10px] text-gray-500 uppercase tracking-wider font-bold">
            {new Date(post.createdAt).toLocaleDateString()}
          </div>
        </div>
      </div>
    </div>
  );
}
