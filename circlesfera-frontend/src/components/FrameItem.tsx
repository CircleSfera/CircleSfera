import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Bookmark,
  Heart,
  MessageCircle,
  MoreHorizontal,
  Music,
  Pause,
  Play,
  Share2,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { toast } from 'react-hot-toast';
import { Link, useLocation } from 'react-router-dom';
import { api, bookmarksApi, followsApi, postsApi } from '../services';
import { creatorApi } from '../services/creator.service';
import { useAuthStore } from '../stores/authStore';
import { useFrameStore } from '../stores/frameStore';
import type { Post } from '../types';
import { logger } from '../utils/logger';
import LikeButton from './LikeButton';
import AddToCollectionModal from './modals/AddToCollectionModal';
import ConfirmModal from './modals/ConfirmModal';
import FrameCommentsModal from './modals/FrameCommentsModal';
import ReportModal from './modals/ReportModal';
import SharePostModal from './modals/SharePostModal';
import PaywallOverlay from './monetization/PaywallOverlay';
import PostMenu from './post/PostMenu';

const PromoteModal = lazy(() => import('./creator/PromoteModal'));

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
  const { isMuted, toggleMute, setMuted } = useFrameStore();
  const queryClient = useQueryClient();
  const { pathname } = useLocation();

  const [showPlayAnim, setShowPlayAnim] = useState<'play' | 'pause' | null>(
    null,
  );
  const [isCaptionExpanded, setIsCaptionExpanded] = useState(false);
  const [isCommentsOpen, setIsCommentsOpen] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showAddToCollectionModal, setShowAddToCollectionModal] =
    useState(false);
  const [showPromoteModal, setShowPromoteModal] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPosition, setMenuPosition] = useState({ top: 0, right: 0 });

  // Progress bar state
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);

  const { data: bookmarkData } = useQuery({
    queryKey: ['bookmark', post.id],
    queryFn: () => bookmarksApi.check(post.id),
  });
  const isBookmarked = bookmarkData?.data?.bookmarked ?? false;

  const unlockMutation = useMutation({
    mutationFn: () =>
      api.post('/monetization/unlock', {
        postId: post.id,
        returnUrl: window.location.href,
      }),
    onSuccess: (response: any) => {
      if (response.data?.url) {
        window.location.href = response.data.url;
      } else {
        toast.success('Post unlocked!');
        queryClient.invalidateQueries({ queryKey: ['frames'] });
        queryClient.invalidateQueries({ queryKey: ['feed'] });
      }
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Error unlocking post');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => postsApi.delete(post.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['frames'] });
    },
  });

  // Calculate menu position when showing
  useEffect(() => {
    if (showMenu && menuButtonRef.current) {
      const rect = menuButtonRef.current.getBoundingClientRect();
      setMenuPosition({
        top: rect.bottom + 8,
        right: window.innerWidth - rect.right,
      });
    }
  }, [showMenu]);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(event.target as Node) &&
        menuButtonRef.current &&
        !menuButtonRef.current.contains(event.target as Node)
      ) {
        setShowMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: Scroll on route change
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  useEffect(() => {
    if (isActive && videoRef.current) {
      // Sync global mute state
      videoRef.current.muted = isMuted;
      videoRef.current.currentTime = 0;
      videoRef.current.play().catch(() => {
        logger.log('Autoplay blocked');
        // If autoplay is blocked because of audio, we could force mute it
        setMuted(true);
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
  }, [isActive, post.id, isMuted, setMuted]);

  const viewRecorded = useRef(false);
  useEffect(() => {
    if (!post.isPromoted || !post.promotionId || viewRecorded.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry.isIntersecting && !viewRecorded.current) {
          viewRecorded.current = true;
          creatorApi
            .recordPromotionView(post.promotionId!)
            .catch(console.error);
        }
      },
      { threshold: 0.5 },
    );

    if (videoRef.current) {
      observer.observe(videoRef.current);
    }

    return () => {
      observer.disconnect();
    };
  }, [post.isPromoted, post.promotionId]);

  // Keyboard controls for active frame
  useEffect(() => {
    if (!isActive) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in an input
      if (
        document.activeElement?.tagName === 'INPUT' ||
        document.activeElement?.tagName === 'TEXTAREA'
      ) {
        return;
      }

      if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        if (videoRef.current) {
          if (videoRef.current.paused) {
            videoRef.current.play();
            setShowPlayAnim('play');
          } else {
            videoRef.current.pause();
            setShowPlayAnim('pause');
          }
          setTimeout(() => setShowPlayAnim(null), 800);
        }
      } else if (e.key.toLowerCase() === 'm') {
        e.preventDefault();
        toggleMute();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isActive, toggleMute]);

  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    const current = videoRef.current.currentTime;

    // Update progress bar
    if (videoRef.current.duration) {
      setProgress((current / videoRef.current.duration) * 100);
      setDuration(videoRef.current.duration);
    }

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

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!videoRef.current || !duration) return;
    const newTime = (Number(e.target.value) / 100) * duration;
    videoRef.current.currentTime = newTime;
    setProgress(Number(e.target.value));
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
    // Optionally trigger like API if not already liked
  };

  const isOwner = profile?.userId === post.userId;
  const videoMedia = post.media?.find((m) => m.type === 'video') ||
    post.media?.[0] || { url: '' };

  return (
    <div className="w-full h-full bg-black relative flex items-center justify-center snap-start md:rounded-[20px] overflow-hidden group">
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
          className={`w-full h-full object-cover bg-black md:rounded-[20px] transition-all duration-300 ${post.isLocked ? 'blur-2xl scale-[1.2] pointer-events-none' : ''}`}
          loop
          playsInline
          muted={isMuted}
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={() => setDuration(videoRef.current?.duration || 0)}
        >
          <track kind="captions" />
        </video>

        {post.isLocked && (
          <PaywallOverlay
            price={post.priceCents ? post.priceCents / 100 : post.price || 0}
            onUnlock={() => unlockMutation.mutate()}
            isLoading={unlockMutation.isPending}
          />
        )}

        {/* Double Tap Heart Animation */}
        {showHeartAnim && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-30">
            <Heart
              size={120}
              className="fill-red-500 text-red-500 opacity-0 animate-heart-pop drop-shadow-[0_0_25px_rgba(255,0,0,0.6)]"
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

      {/* Top Controls (Mute/Unmute) */}
      <div className="absolute top-4 right-4 z-30 pointer-events-auto">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            toggleMute();
          }}
          className="w-10 h-10 bg-black/40 backdrop-blur-md rounded-full flex items-center justify-center text-white hover:bg-black/60 transition-colors"
        >
          {isMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
        </button>
      </div>

      {/* Overlay Gradients */}
      <div className="absolute bottom-0 left-0 right-0 h-2/3 bg-linear-to-t from-black via-black/60 to-transparent pointer-events-none z-10" />

      {/* Main Info Area (Bottom) */}
      <div className="absolute bottom-[calc(6rem+env(safe-area-inset-bottom,0px))] md:bottom-6 left-0 right-16 px-4 flex flex-col justify-end z-20 pointer-events-none">
        {/* User Info Row */}
        <div className="flex items-center gap-2.5 mb-2.5 pointer-events-auto">
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
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <Link
                to={`/${post.user.profile.username}`}
                className="font-bold text-[15px] text-white drop-shadow-md hover:underline transition-all"
              >
                {post.user.profile.username}
              </Link>
              {!isOwner && (
                <button
                  type="button"
                  onClick={() => followMutation.mutate()}
                  className="px-3 py-1 bg-transparent border border-white/80 rounded-lg text-xs font-semibold text-white transition-all active:scale-95 hover:bg-white/10"
                >
                  Seguir
                </button>
              )}
            </div>
            {post.isPromoted && (
              <span className="text-[10px] font-black uppercase tracking-widest text-yellow-400 drop-shadow-md mt-0.5">
                Patrocinado
              </span>
            )}
          </div>
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
                className="text-white/80 font-bold text-xs mt-1 drop-shadow-md hover:text-white"
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
            <div className="animate-marquee inline-block text-[13px] font-medium">
              {post.user.profile.username} • Audio original
            </div>
          </div>
        </div>
      </div>

      {/* Right Sidebar Actions */}
      <div className="absolute bottom-[calc(6.5rem+env(safe-area-inset-bottom,0px))] md:bottom-6 right-2 w-[60px] py-5 flex flex-col items-center justify-end gap-6 z-20 pointer-events-auto bg-black/30 backdrop-blur-xl border border-white/10 rounded-full shadow-[0_8px_32px_rgba(0,0,0,0.4)]">
        <div className="flex flex-col items-center gap-1 group">
          <LikeButton
            postId={post.id}
            iconClassName="w-9 h-9 drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)] transition-transform hover:scale-110 active:scale-90"
            onToggle={(newLiked) => {
              setLikesCount((prev) => (newLiked ? prev + 1 : prev - 1));
            }}
          />
          <span className="text-white font-semibold text-[13px] drop-shadow-md">
            {likesCount}
          </span>
        </div>

        <button
          type="button"
          onClick={() => setIsCommentsOpen(true)}
          className="flex flex-col items-center gap-1 group transition-transform active:scale-90 hover:scale-110"
        >
          <MessageCircle
            size={32}
            className="text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)] fill-white/20"
          />
          <span className="text-white font-semibold text-[13px] drop-shadow-md">
            {post._count?.comments || 0}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setShowShareModal(true)}
          className="flex flex-col items-center gap-1 transition-transform active:scale-90 hover:scale-110"
        >
          <Share2
            size={30}
            className="text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]"
          />
        </button>

        <button
          type="button"
          onClick={() => setShowAddToCollectionModal(true)}
          className="flex flex-col items-center gap-1 transition-transform active:scale-90 hover:scale-110"
        >
          <Bookmark
            size={28}
            className={`${isBookmarked ? 'text-brand-primary fill-brand-primary' : 'text-white'} drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]`}
          />
        </button>

        <button
          type="button"
          ref={menuButtonRef}
          onClick={() => setShowMenu(!showMenu)}
          className="flex flex-col items-center gap-1 transition-transform active:scale-90 hover:scale-110 relative"
        >
          <MoreHorizontal
            size={26}
            className="text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]"
          />
        </button>

        {/* Spinning Music Record */}
        <div className="mt-2 w-11 h-11 rounded-full bg-zinc-900 border-8 border-zinc-800 overflow-hidden flex items-center justify-center shadow-[0_0_15px_rgba(0,0,0,0.5)] relative shrink-0 animate-[spin_4s_linear_infinite]">
          <img
            src={post.user.profile.avatar || '#noimage'}
            alt="Audio"
            className="w-full h-full object-cover"
          />
        </div>
      </div>

      {/* Scrubber / Progress Bar */}
      <div className="absolute bottom-0 left-0 right-0 h-1.5 z-30 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-auto">
        <input
          type="range"
          min="0"
          max="100"
          value={progress}
          onChange={handleSeek}
          className="w-full absolute inset-0 opacity-0 cursor-pointer z-40"
        />
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/20">
          <div
            className="h-full bg-white relative drop-shadow-[0_0_8px_rgba(255,255,255,0.8)]"
            style={{ width: `${progress}%` }}
          >
            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow-[0_0_10px_rgba(255,255,255,1)] scale-0 group-hover:scale-100 transition-transform" />
          </div>
        </div>
      </div>

      {/* Comments Drawer */}
      {/* Modals and Options */}
      <FrameCommentsModal
        isOpen={isCommentsOpen}
        onClose={() => setIsCommentsOpen(false)}
        postId={post.id}
      />
      <SharePostModal
        isOpen={showShareModal}
        onClose={() => setShowShareModal(false)}
        post={post}
      />
      <ReportModal
        isOpen={showReportModal}
        onClose={() => setShowReportModal(false)}
        targetType="POST"
        targetId={post.id}
      />
      {showAddToCollectionModal && (
        <AddToCollectionModal
          isOpen={showAddToCollectionModal}
          onClose={() => setShowAddToCollectionModal(false)}
          postId={post.id}
        />
      )}
      <ConfirmModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={() => deleteMutation.mutate()}
        title="Eliminar Frame"
        message="¿Estás seguro de que quieres eliminar este frame? Esta acción no se puede deshacer."
        confirmText={deleteMutation.isPending ? 'Eliminando...' : 'Eliminar'}
        cancelText="Cancelar"
        isDestructive={true}
      />
      <PostMenu
        showMenu={showMenu}
        menuRef={menuRef}
        menuPosition={menuPosition}
        isOwner={isOwner}
        onEdit={() => setShowMenu(false)} // Edit not fully supported in frames view yet
        onDelete={() => {
          setShowMenu(false);
          setShowDeleteModal(true);
        }}
        onReport={() => {
          setShowMenu(false);
          setShowReportModal(true);
        }}
        onPromote={() => {
          setShowMenu(false);
          setShowPromoteModal(true);
        }}
        onAddToCollection={() => {
          setShowMenu(false);
          setShowAddToCollectionModal(true);
        }}
      />
      {showPromoteModal && (
        <Suspense fallback={null}>
          <PromoteModal
            post={post}
            onClose={() => setShowPromoteModal(false)}
            onToast={(msg: string, type: 'success' | 'error') => {
              if (type === 'success') toast.success(msg);
              else toast.error(msg);
            }}
          />
        </Suspense>
      )}
    </div>
  );
}
