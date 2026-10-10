import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Heart, Pause, Play, Volume2, VolumeX } from 'lucide-react';
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { toast } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { useSyncedLibraryAudio } from '../hooks/useSyncedLibraryAudio';
import { bookmarksApi, followsApi, likesApi, postsApi } from '../services';
import { creatorApi } from '../services/creator.service';
import { monetizationApi } from '../services/monetization.service';
import { useAuthStore } from '../stores/authStore';
import { useFrameStore } from '../stores/frameStore';
import type { Post } from '../types';
import { hasCreatorTools } from '../utils/creatorTools';
import { reportPaymentError } from '../utils/identityVerification';
import { logger } from '../utils/logger';
import HlsVideoPlayer from './common/HlsVideoPlayer';
import FrameActionRail from './frames/FrameActionRail';
import type { FrameMenuActions } from './frames/FrameOptionsSheet';
import FrameOverlayInfo from './frames/FrameOverlayInfo';
import ConfirmModal from './modals/ConfirmModal';
import ReportModal from './modals/ReportModal';
import PaywallOverlay from './monetization/PaywallOverlay';
import EditCaptionDialog from './post/EditCaptionDialog';

const PromoteModal = lazy(() => import('./creator/PromoteModal'));

interface FrameItemProps {
  post: Post;
  isActive: boolean;
  isNext?: boolean;
  onCommentsOpen?: () => void;
  onShareOpen?: () => void;
  onSaveOpen?: () => void;
  onMenuOpen?: () => void;
  onRegisterMenuActions?: (actions: FrameMenuActions | null) => void;
}

export default function FrameItem({
  post,
  isActive,
  isNext,
  onCommentsOpen,
  onShareOpen,
  onSaveOpen,
  onMenuOpen,
  onRegisterMenuActions,
}: FrameItemProps) {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const watchTimeRef = useRef(0);
  const lastUpdateRef = useRef(Date.now());
  const lastTimeRef = useRef(0);
  const [showHeartAnim, setShowHeartAnim] = useState(false);
  const [likesCount, setLikesCount] = useState(post._count?.likes || 0);
  const profile = useAuthStore((state) => state.profile);
  // Promoting follows the kind of account, not a paid plan.
  const canPromote = hasCreatorTools(profile?.accountType);
  const { isMuted, toggleMute, setMuted } = useFrameStore();
  const queryClient = useQueryClient();

  const [showPlayAnim, setShowPlayAnim] = useState<'play' | 'pause' | null>(
    null,
  );
  const [isCaptionExpanded, setIsCaptionExpanded] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showPromoteModal, setShowPromoteModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editCaption, setEditCaption] = useState(post.caption || '');
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);

  const { data: bookmarkData } = useQuery({
    queryKey: ['bookmark', post.id],
    queryFn: () => bookmarksApi.check(post.id),
  });
  const isBookmarked = bookmarkData?.data?.bookmarked ?? false;

  const unlockMutation = useMutation({
    mutationFn: () => monetizationApi.unlockPost(post.id, window.location.href),
    onSuccess: (response: { url?: string }) => {
      if (response?.url) {
        window.location.href = response.url;
      } else {
        toast.success(t('post.media.unlock_success'));
        queryClient.invalidateQueries({ queryKey: ['frames'] });
        queryClient.invalidateQueries({ queryKey: ['feed'] });
      }
    },
    onError: (error: unknown) => {
      reportPaymentError(error, t, 'post.media.unlock_error');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => postsApi.delete(post.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['frames'] });
    },
  });

  // Only the caption of a published frame can be changed here; its video
  // cannot.
  const captionMutation = useMutation({
    mutationFn: (caption: string) => postsApi.update(post.id, caption),
    onSuccess: () => {
      setShowEditModal(false);
      queryClient.invalidateQueries({ queryKey: ['frames'] });
      queryClient.invalidateQueries({ queryKey: ['userFrames'] });
      queryClient.invalidateQueries({ queryKey: ['feed'] });
      queryClient.invalidateQueries({ queryKey: ['posts'] });
      queryClient.invalidateQueries({ queryKey: ['post', post.id] });
    },
    onError: () => {
      toast.error(t('frames.caption_error'));
    },
  });

  // The menu opens the caption with the text the frame has at that moment.
  const captionRef = useRef(post.caption);
  useEffect(() => {
    captionRef.current = post.caption;
  }, [post.caption]);

  // The page passes a new save handler on every render. The menu reaches the
  // latest one through this ref, so that a new handler alone does not hand
  // the menu over again: handing it over makes the page render.
  const onSaveOpenRef = useRef(onSaveOpen);
  useEffect(() => {
    onSaveOpenRef.current = onSaveOpen;
  }, [onSaveOpen]);

  useEffect(() => {
    if (!isActive || !onRegisterMenuActions) return;

    onRegisterMenuActions({
      onEdit: () => {
        setEditCaption(captionRef.current || '');
        setShowEditModal(true);
      },
      onDelete: () => setShowDeleteModal(true),
      onReport: () => setShowReportModal(true),
      onSave: () => onSaveOpenRef.current?.(),
      onPromote: canPromote ? () => setShowPromoteModal(true) : undefined,
    });

    return () => onRegisterMenuActions(null);
  }, [isActive, onRegisterMenuActions, canPromote]);

  useEffect(() => {
    if (isActive && videoRef.current) {
      // When a library track is attached, mute the original video bed and play the clip.
      const hasLibraryAudio = Boolean(post.audio?.url);
      videoRef.current.muted = hasLibraryAudio ? true : isMuted;
      videoRef.current.currentTime = 0;
      videoRef.current.play().catch(() => {
        logger.log('Autoplay blocked, falling back to muted');
        setMuted(true);
        if (videoRef.current) {
          videoRef.current.muted = true;
          videoRef.current.play().catch(console.error);
        }
      });
      lastUpdateRef.current = Date.now();
      lastTimeRef.current = 0;
    } else if (videoRef.current) {
      videoRef.current.pause();
      if (watchTimeRef.current > 1) {
        creatorApi.trackFrameWatch(post.id, watchTimeRef.current);
        watchTimeRef.current = 0;
      }
    }
  }, [isActive, post.id, post.audio?.url, isMuted, setMuted]);

  useSyncedLibraryAudio({
    enabled: isActive,
    trackUrl: post.audio?.url,
    audioStartMs: post.audioStartMs,
    isMuted,
    videoRef,
  });

  useEffect(() => {
    return () => {
      videoRef.current?.pause();
    };
  }, []);

  // The short timers that end a tap animation. They are cancelled when the
  // frame leaves the screen, so none of them runs on a frame that is gone.
  const animationTimers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const later = useCallback((run: () => void, ms: number) => {
    const id = setTimeout(() => {
      animationTimers.current.delete(id);
      run();
    }, ms);
    animationTimers.current.add(id);
  }, []);
  useEffect(() => {
    const timers = animationTimers.current;
    return () => {
      for (const id of timers) clearTimeout(id);
      timers.clear();
    };
  }, []);

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

  useEffect(() => {
    if (!isActive) return;

    const handleKeyDown = (e: KeyboardEvent) => {
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
          later(() => setShowPlayAnim(null), 800);
        }
      } else if (e.key.toLowerCase() === 'm') {
        e.preventDefault();
        toggleMute();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isActive, toggleMute, later]);

  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    const current = videoRef.current.currentTime;

    if (videoRef.current.duration) {
      setProgress((current / videoRef.current.duration) * 100);
      setDuration(videoRef.current.duration);
    }

    if (current < lastTimeRef.current - 1) {
      creatorApi.trackFrameLoop(post.id);
    }

    const now = Date.now();
    const diff = (now - lastUpdateRef.current) / 1000;
    if (diff > 0 && diff < 2) {
      watchTimeRef.current += diff;
    }

    lastUpdateRef.current = now;
    lastTimeRef.current = current;

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
    mutationFn: () => followsApi.toggle(post.profile.username || ''),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['frames'] });
    },
  });

  // Kept across renders: the player reports its position several times a
  // second, and each report redraws the frame between one tap and the next.
  const clickTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (clickTimeout.current !== null) clearTimeout(clickTimeout.current);
    };
  }, []);

  const handleVideoClick = () => {
    if (clickTimeout.current !== null) {
      clearTimeout(clickTimeout.current);
      clickTimeout.current = null;
      handleDoubleTap();
    } else {
      clickTimeout.current = setTimeout(() => {
        clickTimeout.current = null;
        if (!videoRef.current) return;
        if (videoRef.current.paused) {
          videoRef.current.play().catch(console.error);
          setShowPlayAnim('play');
        } else {
          videoRef.current.pause();
          setShowPlayAnim('pause');
        }
        later(() => setShowPlayAnim(null), 800);
      }, 180);
    }
  };

  // Two taps give a like and never take one away: on a frame already
  // liked they only show the heart.
  const likeFromTaps = async () => {
    const likeKey = ['like', post.id];
    type LikeCheck = Awaited<ReturnType<typeof likesApi.check>>;
    try {
      const known = await queryClient.ensureQueryData<LikeCheck>({
        queryKey: likeKey,
        queryFn: () => likesApi.check(post.id),
      });
      if (known?.data?.liked) return;

      await queryClient.cancelQueries({ queryKey: likeKey });
      queryClient.setQueryData<LikeCheck>(
        likeKey,
        (old) => ({ ...old, data: { liked: true } }) as LikeCheck,
      );
      setLikesCount((prev) => prev + 1);
      try {
        const result = await likesApi.toggle(post.id);
        // The like was already there and the screen did not know: put it back.
        if (result?.data?.liked === false) await likesApi.toggle(post.id);
      } catch (error) {
        queryClient.setQueryData(likeKey, known);
        setLikesCount((prev) => prev - 1);
        throw error;
      }
    } catch (error) {
      logger.error('Failed to like the frame', error);
    } finally {
      queryClient.invalidateQueries({ queryKey: likeKey });
    }
  };

  const handleDoubleTap = async () => {
    setShowHeartAnim(true);
    later(() => setShowHeartAnim(false), 1000);
    if (!post.isLocked) void likeFromTaps();
    if (Capacitor.isNativePlatform()) {
      await Haptics.impact({ style: ImpactStyle.Medium }).catch(() => {});
    }
  };

  const isOwner = profile?.id === post.profileId;
  const videoMedia = post.media?.find((m) => m.type === 'video') ||
    post.media?.[0] || { url: '' };

  return (
    <div className="w-full h-full bg-black relative flex items-center justify-center snap-start rounded-[20px] overflow-hidden group">
      <button
        type="button"
        className="absolute inset-0 w-full h-full border-none p-0 z-10 focus:outline-none bg-transparent"
        onClick={handleVideoClick}
        aria-label={t('frames.playback_area')}
      >
        <HlsVideoPlayer
          ref={videoRef}
          src={videoMedia.url}
          hlsUrl={
            videoMedia.standardUrl?.endsWith('.m3u8')
              ? videoMedia.standardUrl
              : undefined
          }
          className={`w-full h-full object-cover bg-black rounded-[20px] transition-all duration-300 ${post.isLocked ? 'blur-2xl scale-[1.2] pointer-events-none' : ''}`}
          loop
          playsInline
          muted={isMuted}
          isNext={isNext}
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={() => setDuration(videoRef.current?.duration || 0)}
        >
          <track kind="captions" />
        </HlsVideoPlayer>

        {showHeartAnim && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-30">
            <Heart
              size={120}
              className="fill-brand-secondary text-brand-secondary opacity-0 animate-heart-pop drop-shadow-[0_0_25px_rgba(var(--brand-primary-rgb),0.6)]"
            />
          </div>
        )}

        {showPlayAnim && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-30">
            <div className="bg-black/40 backdrop-blur-md rounded-full p-5 animate-out fade-out zoom-out duration-500">
              {showPlayAnim === 'play' ? (
                <Play size={40} className="text-white fill-white" />
              ) : (
                <Pause size={40} className="text-white fill-white" />
              )}
            </div>
          </div>
        )}
      </button>

      {/* Beside the playback button, not inside it: pressing Unlock is not a
          tap on the video. */}
      {post.isLocked && (
        <PaywallOverlay
          price={post.priceCents ? post.priceCents / 100 : 0}
          onUnlock={() => unlockMutation.mutate()}
          isLoading={unlockMutation.isPending}
        />
      )}

      <div className="absolute top-4 right-4 z-30 pointer-events-auto">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            toggleMute();
          }}
          aria-label={isMuted ? t('frames.unmute') : t('frames.mute')}
          className="w-11 h-11 bg-black/40 backdrop-blur-md rounded-full flex items-center justify-center text-white hover:bg-black/60 transition-colors"
        >
          {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
        </button>
      </div>

      <div className="absolute bottom-0 left-0 right-0 h-2/5 bg-linear-to-t from-black/80 via-black/40 to-transparent pointer-events-none z-10" />

      <FrameOverlayInfo
        post={post}
        isOwner={isOwner}
        isCaptionExpanded={isCaptionExpanded}
        onCaptionExpandedChange={setIsCaptionExpanded}
        onFollow={() => followMutation.mutate()}
      />

      <FrameActionRail
        post={post}
        likesCount={likesCount}
        isBookmarked={isBookmarked}
        onLikeToggle={(newLiked) => {
          setLikesCount((prev) => (newLiked ? prev + 1 : prev - 1));
        }}
        onCommentsOpen={() => onCommentsOpen?.()}
        onShareOpen={() => onShareOpen?.()}
        onBookmarkOpen={() => onSaveOpen?.()}
        onMenuToggle={() => onMenuOpen?.()}
        menuButtonRef={menuButtonRef}
      />

      <div className="absolute bottom-0 left-0 right-0 h-1.5 z-30 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-auto">
        <input
          type="range"
          min="0"
          max="100"
          value={progress}
          onChange={handleSeek}
          className="w-full absolute inset-0 opacity-0 cursor-pointer z-40"
          aria-label={t('frames.progress')}
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

      <ReportModal
        isOpen={showReportModal}
        onClose={() => setShowReportModal(false)}
        targetType="POST"
        targetId={post.id}
      />
      <EditCaptionDialog
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        caption={editCaption}
        onCaptionChange={setEditCaption}
        onSubmit={(e) => {
          e.preventDefault();
          captionMutation.mutate(editCaption);
        }}
        isSaving={captionMutation.isPending}
      />
      <ConfirmModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={() => deleteMutation.mutate()}
        title={t('frames.delete_title')}
        message={t('frames.delete_message')}
        confirmText={
          deleteMutation.isPending
            ? t('frames.delete_pending')
            : t('frames.delete_confirm')
        }
        cancelText={t('common.cancel')}
        isDestructive
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
