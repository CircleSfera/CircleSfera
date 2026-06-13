import { useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Check,
  Eye,
  Heart,
  MoreHorizontal,
  Send,
  Trash2,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { chatApi, storiesApi } from '../services';
import { useAuthStore } from '../stores/authStore';
import type { Story, UserWithProfile } from '../types';
import { logger } from '../utils/logger';
import { parseFilter } from '../utils/styleUtils';
import UserAvatar from './UserAvatar';
import VerificationBadge, { type VerificationLevel } from './VerificationBadge';

interface StoryViewerProps {
  stories: Story[];
  initialIndex: number;
  onClose: () => void;
}

export default function StoryViewer({
  stories,
  initialIndex,
  onClose,
}: StoryViewerProps) {
  const { t } = useTranslation();
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [progress, setProgress] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [viewers, setViewers] = useState<UserWithProfile[]>([]);
  const [showViewers, setShowViewers] = useState(false);
  const [isLoadingViewers, setIsLoadingViewers] = useState(false);
  const [reactions, setReactions] = useState<
    { reaction: string; userId: string; user: UserWithProfile }[]
  >([]);
  const [isMuted, setIsMuted] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [isSendingReply, setIsSendingReply] = useState(false);
  const [messageSent, setMessageSent] = useState(false);

  // Floating reactions system
  const [particles, setParticles] = useState<
    { id: number; x: number; y: number; emoji: string }[]
  >([]);
  const particleIdCounter = useRef(0);

  const triggerReactionAnimation = (emoji: string) => {
    const newParticles = Array.from({ length: 12 }).map(() => ({
      id: particleIdCounter.current++,
      x: Math.random() * 100 - 50, // -50 to 50
      y: Math.random() * 40,
      emoji,
    }));
    setParticles((prev) => [...prev, ...newParticles]);
    setTimeout(() => {
      setParticles((prev) =>
        prev.filter((p) => !newParticles.find((np) => np.id === p.id)),
      );
    }, 2000);
  };

  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressRef = useRef(false);
  const startX = useRef(0);
  const handleCloseViewers = useCallback((e?: React.MouseEvent) => {
    e?.stopPropagation();
    setShowViewers(false);
    setIsPaused(false);
  }, []);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  const { profile } = useAuthStore();
  const queryClient = useQueryClient();

  const currentStory = stories[currentIndex];

  // Safeguard: if story doesn't exist (e.g. deleted), close
  useEffect(() => {
    if (!currentStory) onClose();
  }, [currentStory, onClose]);

  const isOwner = profile?.userId === currentStory?.userId;

  const STORY_DURATION = 5000; // 5 seconds per story
  const PROGRESS_INTERVAL = 50; // Update progress every 50ms

  // Mark as viewed
  useEffect(() => {
    let viewed = false;
    if (currentStory && !isOwner && !viewed) {
      storiesApi.markViewed(currentStory.id).catch(console.error);
      viewed = true;
    }
  }, [currentStory, isOwner]);

  // Audio Playback Initialization
  useEffect(() => {
    // Cleanup previous audio if any
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
      audioRef.current = null;
    }

    if (currentStory?.audio) {
      const audio = new window.Audio(currentStory.audio.url);
      audio.loop = true;
      audioRef.current = audio;
    }

    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
        audioRef.current = null;
      }
    };
  }, [currentStory?.audio]); // Only re-run when story audio changes

  // Control Audio Playback State
  useEffect(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.muted = isMuted;
      if (isPaused || showViewers || showDeleteConfirm) {
        audio.pause();
      } else {
        audio
          .play()
          .catch((e) => logger.error('Story audio playback failed', e));
      }
    }
  }, [isMuted, isPaused, showViewers, showDeleteConfirm]);

  const handleNext = useCallback(() => {
    if (currentIndex < stories.length - 1) {
      setCurrentIndex((prev) => prev + 1);
      setProgress(0);
      setShowViewers(false); // Close viewers if open when moving to next
      setShowDeleteConfirm(false);
    } else {
      onClose();
    }
  }, [currentIndex, stories.length, onClose]);

  const handlePrev = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1);
      setProgress(0);
      setShowViewers(false);
      setShowDeleteConfirm(false);
    }
  }, [currentIndex]);

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsPaused(true);
    setShowDeleteConfirm(true);
  };

  const cancelDelete = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setShowDeleteConfirm(false);
    setIsPaused(false);
  };

  const confirmDelete = async (e?: React.MouseEvent) => {
    e?.stopPropagation();

    try {
      await storiesApi.delete(currentStory.id);
      queryClient.invalidateQueries({ queryKey: ['stories'] });
      onClose();
    } catch (error) {
      logger.error('Failed to delete story:', error);
      alert('Failed to delete story');
      setIsPaused(false);
    }
  };

  const handleShowViewers = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsPaused(true);
    setShowViewers(true);
    setIsLoadingViewers(true);
    try {
      const res = await storiesApi.getViews(currentStory.id);
      setViewers(res.data);
    } catch (error) {
      logger.error('Failed to load viewers', error);
    } finally {
      setIsLoadingViewers(false);
    }
  };

  const handleLike = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      // Trigger floating animation locally right away for UX
      triggerReactionAnimation('❤️');

      // Toggle logic: addReaction on backend handles the toggle if implemented,
      // but for now we'll just push it.
      await storiesApi.addReaction(currentStory.id, '❤️');
      const res = await storiesApi.getReactions(currentStory.id);
      setReactions(res.data);
    } catch (error) {
      logger.error('Failed to toggle like', error);
    }
  };

  const handleSendReply = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!replyText.trim() || isSendingReply) return;

    setIsSendingReply(true);
    try {
      await chatApi.sendMessage({
        recipientId: currentStory.user.id,
        content: replyText,
        storyId: currentStory.id,
      });
      setReplyText('');
      setMessageSent(true);
      setTimeout(() => setMessageSent(false), 3000);
    } catch (error) {
      logger.error('Failed to send story reply', error);
    } finally {
      setIsSendingReply(false);
    }
  };

  useEffect(() => {
    if (currentStory) {
      storiesApi
        .getReactions(currentStory.id)
        .then((res) => setReactions(res.data));
    }
  }, [currentStory]);

  // Auto-advance stories
  useEffect(() => {
    if (isPaused || showViewers || showDeleteConfirm) return;

    const progressIncrement = (PROGRESS_INTERVAL / STORY_DURATION) * 100;
    const timer = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          handleNext();
          return 0;
        }
        return prev + progressIncrement;
      });
    }, PROGRESS_INTERVAL);

    return () => clearInterval(timer);
  }, [isPaused, showViewers, showDeleteConfirm, handleNext]);

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (showDeleteConfirm) return; // Disable nav when modal open

      switch (e.key) {
        case 'ArrowRight':
        case ' ':
          handleNext();
          break;
        case 'ArrowLeft':
          handlePrev();
          break;
        case 'Escape':
          if (showViewers) handleCloseViewers();
          else if (showDeleteConfirm) setShowDeleteConfirm(false);
          else onClose();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    handleNext,
    handlePrev,
    onClose,
    showViewers,
    showDeleteConfirm,
    handleCloseViewers,
  ]);

  if (!currentStory) return null;

  const modalContent = (
    <div className="fixed inset-0 z-50 bg-black flex items-center justify-center overflow-hidden">
      {/* Accessibility: Screen Reader Announcements */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {`Story ${currentIndex + 1} of ${stories.length} from ${currentStory.user.profile.username}`}
      </div>

      {/* Blurred Background Layer (Cinematic Mesh) */}
      <div className="absolute inset-0 z-0">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentStory.id}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.8 }}
            className="absolute inset-0"
          >
            {(() => {
              const { className, style } = parseFilter(currentStory.filter);
              const bgUrl =
                currentStory.thumbnailUrl ||
                currentStory.standardUrl ||
                currentStory.url;
              return currentStory.mediaType === 'video' ? (
                <video
                  src={currentStory.url}
                  className={`w-full h-full object-cover blur-3xl opacity-40 scale-125 ${className}`}
                  style={style}
                  muted
                />
              ) : (
                <img
                  src={bgUrl}
                  alt="background"
                  className={`w-full h-full object-cover blur-3xl opacity-40 scale-125 ${className}`}
                  style={style}
                />
              );
            })()}
          </motion.div>
        </AnimatePresence>

        {/* Mesh Gradient Overlays */}
        <div className="absolute inset-0 bg-black/60 md:bg-black/40" />
        <div className="absolute inset-0 opacity-20 pointer-events-none mix-blend-overlay bg-linear-to-tr from-brand-primary/20 via-transparent to-brand-secondary/20" />

        {/* Film Grain / Noise Texture */}
        <div
          className="absolute inset-0 opacity-[0.03] pointer-events-none mix-blend-screen"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
          }}
        />
      </div>

      {/* Center content (Cinematic Container) */}
      <div className="absolute inset-0 flex items-center justify-center z-10 md:p-8">
        <AnimatePresence mode="popLayout" custom={currentIndex}>
          <motion.div
            key={currentStory.id}
            initial={{ opacity: 0, scale: 0.95, x: 100 }}
            animate={{ opacity: 1, scale: 1, x: 0 }}
            exit={{ opacity: 0, scale: 0.95, x: -100 }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="relative w-full h-full md:w-auto md:h-[92vh] md:max-h-[92vh] md:aspect-9/16 flex items-center justify-center md:rounded-3xl overflow-hidden ring-1 ring-white/10 md:shadow-[0_0_50px_rgba(0,0,0,0.5)] md:mx-auto"
          >
            {(() => {
              const { className, style } = parseFilter(currentStory.filter);
              return currentStory.mediaType === 'video' ? (
                <video
                  src={currentStory.url}
                  className={`w-full h-full md:rounded-2xl shadow-2xl object-cover pointer-events-auto ${className}`}
                  style={style}
                  autoPlay
                  muted
                  playsInline
                />
              ) : (
                <img
                  src={currentStory.standardUrl || currentStory.url}
                  srcSet={
                    currentStory.standardUrl
                      ? `${currentStory.standardUrl} 1080w, ${currentStory.url} 1920w`
                      : undefined
                  }
                  sizes="(max-width: 768px) 100vw, 500px"
                  alt="Story"
                  className={`w-full h-full md:rounded-2xl shadow-2xl object-cover pointer-events-auto ${className}`}
                  style={style}
                  loading="eager"
                />
              );
            })()}

            {/* UI Overlays inside the 9:16 frame */}

            {/* Progress Bars */}
            <div className="absolute top-0 left-0 right-0 z-40 flex gap-1.5 p-3 pt-safe-top">
              {stories.map((story, idx) => (
                <div
                  key={story.id}
                  className="h-0.5 flex-1 bg-white/20 rounded-full overflow-hidden backdrop-blur-sm"
                >
                  <div
                    className="h-full bg-white transition-all duration-100 ease-linear shadow-[0_0_10px_rgba(255,255,255,0.8)]"
                    style={{
                      width:
                        idx < currentIndex
                          ? '100%'
                          : idx === currentIndex
                            ? `${progress}%`
                            : '0%',
                    }}
                  />
                </div>
              ))}
            </div>

            {/* Header */}
            <div className="absolute top-4 left-0 right-0 z-40 px-4 flex items-center justify-between pointer-events-none">
              <div className="flex items-center gap-3 pointer-events-auto">
                <UserAvatar
                  src={currentStory.user.profile?.avatar}
                  thumbnailUrl={currentStory.user.profile?.thumbnailUrl}
                  standardUrl={currentStory.user.profile?.standardUrl}
                  alt={currentStory.user.profile?.username || 'User'}
                  size="sm"
                />
                <div className="flex flex-col">
                  <span className="text-white font-semibold text-sm drop-shadow-md flex items-center gap-1">
                    {currentStory.user.profile.username}
                    <VerificationBadge
                      level={
                        currentStory.user.verificationLevel as VerificationLevel
                      }
                      size={12}
                    />
                  </span>
                  <span className="text-white/80 text-xs drop-shadow-md">
                    {new Date(currentStory.createdAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 pointer-events-auto">
                <button
                  type="button"
                  onClick={() => setIsMuted(!isMuted)}
                  aria-label={isMuted ? 'Unmute' : 'Mute'}
                  className="text-white/90 bg-black/20 p-2 rounded-full backdrop-blur-md"
                >
                  {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close story viewer"
                  className="text-white bg-black/20 p-2 rounded-full backdrop-blur-md"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Footer Capsule */}
            <div className="absolute bottom-6 left-0 right-0 z-40 px-4 pointer-events-none mb-safe-bottom">
              <div className="pointer-events-auto w-full">
                {!isOwner ? (
                  <div className="flex items-center gap-3">
                    <form
                      onSubmit={handleSendReply}
                      className={`flex-1 bg-white/10 backdrop-blur-2xl border border-white/20 rounded-full px-4 py-3 flex items-center shadow-2xl transition-all focus-within:bg-white/15 ${messageSent ? 'border-green-500/50 bg-green-500/5' : ''}`}
                    >
                      <input
                        type="text"
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value)}
                        placeholder={
                          messageSent
                            ? t('story.sent')
                            : t('story.reply_placeholder')
                        }
                        className="bg-transparent text-white placeholder:text-white/50 flex-1 outline-none text-sm font-medium"
                        onFocus={() => setIsPaused(true)}
                        onBlur={() => setIsPaused(false)}
                      />
                      <button
                        type="submit"
                        aria-label="Send reply"
                        disabled={!replyText.trim() || isSendingReply}
                        className="ml-2 text-white/70 disabled:opacity-30"
                      >
                        {messageSent ? (
                          <Check size={18} className="text-green-400" />
                        ) : (
                          <Send size={18} />
                        )}
                      </button>
                    </form>
                    <button
                      type="button"
                      onClick={handleLike}
                      aria-label={
                        reactions.some(
                          (r) =>
                            r.userId === (profile?.user?.id || profile?.id) &&
                            r.reaction === '❤️',
                        )
                          ? 'Remove like'
                          : 'Like story'
                      }
                      className="text-white bg-white/10 backdrop-blur-xl p-3 rounded-full border border-white/10"
                    >
                      <Heart
                        size={20}
                        className={
                          reactions.some(
                            (r) =>
                              r.userId === (profile?.user?.id || profile?.id) &&
                              r.reaction === '❤️',
                          )
                            ? 'fill-red-500 text-red-500'
                            : ''
                        }
                      />
                    </button>

                    {/* Floating Particles Container */}
                    <AnimatePresence>
                      {particles.map((p) => (
                        <motion.div
                          key={p.id}
                          initial={{ opacity: 0, y: 0, x: p.x, scale: 0.5 }}
                          animate={{
                            opacity: [0, 1, 1, 0],
                            y: -400 - p.y * 5,
                            x: p.x + (Math.random() * 40 - 20),
                            scale: [0.5, 1.5, 1, 1],
                          }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 1.5, ease: 'easeOut' }}
                          className="absolute bottom-14 right-6 text-3xl pointer-events-none drop-shadow-lg z-50"
                        >
                          {p.emoji}
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
                ) : (
                  <div className="flex justify-between items-center bg-black/20 backdrop-blur-md rounded-full px-4 py-2 border border-white/10">
                    <button
                      type="button"
                      onClick={handleShowViewers}
                      className="flex items-center gap-2 text-white"
                    >
                      <Eye size={16} />
                      <span className="font-bold text-xs">
                        {viewers.length} {t('story.views')}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={handleDeleteClick}
                      aria-label="Delete this story"
                      className="text-red-400 p-2 hover:bg-red-500/10 rounded-full transition-colors"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Gesture Handler (Inside the frame) */}
            <div
              className="absolute inset-x-0 top-16 bottom-24 z-30 flex pointer-events-auto"
              onPointerDown={(e) => {
                startX.current = e.clientX;
                longPressTimer.current = setTimeout(() => {
                  setIsPaused(true);
                  longPressRef.current = true;
                }, 200);
              }}
              onPointerUp={(e) => {
                if (longPressTimer.current)
                  clearTimeout(longPressTimer.current);
                if (longPressRef.current) {
                  setIsPaused(false);
                  longPressRef.current = false;
                } else if (Math.abs(e.clientX - startX.current) < 10) {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const x = e.clientX - rect.left;
                  if (x < rect.width * 0.3) handlePrev();
                  else handleNext();
                }
              }}
            />
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Reactions Display (Owner View) */}
      {isOwner && reactions.length > 0 && (
        <div className="absolute bottom-20 left-4 z-20 flex flex-wrap gap-2 pointer-events-none">
          {reactions.slice(0, 5).map((r) => (
            <div
              key={r.userId}
              className="flex items-center gap-1 bg-black/40 backdrop-blur-md rounded-full px-2 py-1 border border-white/10 pointer-events-auto"
            >
              <span className="text-sm">{r.reaction}</span>
              <span className="text-[10px] text-white/70">
                {r.user.profile.username}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-confirm-title"
            className="bg-[#262626] rounded-xl p-6 w-[80%] max-w-xs shadow-2xl border border-white/10 transform scale-100 animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === 'Escape') cancelDelete();
              e.stopPropagation();
            }}
          >
            <div className="flex flex-col items-center text-center gap-3">
              <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center text-red-500 mb-1">
                <Trash2 size={24} />
              </div>
              <h3 className="text-white font-bold text-lg">
                {t('story.delete_title')}
              </h3>
              <p className="text-white/60 text-sm mb-4">
                {t('story.delete_warning')}
              </p>

              <div className="flex flex-col gap-2 w-full">
                <button
                  type="button"
                  onClick={confirmDelete}
                  className="w-full py-3 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition-colors"
                >
                  {t('story.delete')}
                </button>
                <button
                  type="button"
                  onClick={cancelDelete}
                  className="w-full py-3 bg-white/5 hover:bg-white/10 text-white font-semibold rounded-lg transition-colors"
                >
                  {t('story.cancel')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Viewers Sheet */}
      {showViewers && (
        <>
          <button
            type="button"
            aria-label="Close viewers"
            className="absolute inset-0 bg-black/50 z-40 cursor-default"
            onClick={handleCloseViewers}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="viewers-title"
            className="absolute inset-x-0 bottom-0 max-h-[70%] bg-[#1a1a1a]/95 backdrop-blur-xl rounded-t-3xl z-50 flex flex-col shadow-[0_-8px_30px_rgba(0,0,0,0.5)] border-t border-white/10 animate-in slide-in-from-bottom duration-300"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === 'Escape') handleCloseViewers();
              e.stopPropagation();
            }}
          >
            {/* Drag Handle */}
            <button
              type="button"
              aria-label="Drag down to close"
              className="w-full flex justify-center pt-3 pb-1"
              onClick={handleCloseViewers}
            >
              <div className="w-12 h-1.5 bg-white/20 rounded-full" />
            </button>

            <div className="p-4 border-b border-white/5 flex items-center justify-between">
              <h3 className="text-white font-bold text-lg flex items-center gap-2">
                {t('story.viewers')}{' '}
                <span className="bg-white/10 text-xs px-2 py-0.5 rounded-full text-white/80">
                  {viewers.length}
                </span>
              </h3>
              <button
                type="button"
                onClick={handleCloseViewers}
                className="text-white/60 hover:text-white bg-white/5 p-1 rounded-full"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-2 custom-scrollbar">
              {isLoadingViewers ? (
                <div className="flex justify-center p-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-2 border-white/20 border-t-blue-500"></div>
                </div>
              ) : viewers.length > 0 ? (
                <div className="space-y-1">
                  {viewers.map((viewer) => (
                    <div
                      key={viewer.id}
                      className="flex items-center gap-3 p-3 hover:bg-white/5 rounded-xl transition-colors cursor-pointer group"
                    >
                      <UserAvatar
                        src={viewer.profile?.avatar}
                        thumbnailUrl={viewer.profile?.thumbnailUrl}
                        standardUrl={viewer.profile?.standardUrl}
                        alt={viewer.profile?.username || 'User'}
                        size="md"
                      />
                      <div className="flex-1">
                        <p className="text-white text-sm font-semibold group-hover:text-blue-400 transition-colors flex items-center gap-1">
                          {viewer.profile?.username}
                          <VerificationBadge
                            level={
                              viewer.verificationLevel as VerificationLevel
                            }
                            size={12}
                          />
                        </p>
                        <p className="text-white/50 text-xs">
                          {viewer.profile?.fullName}
                        </p>
                      </div>
                      <button
                        type="button"
                        className="text-white/40 hover:text-white p-2"
                      >
                        <MoreHorizontal size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-16 opacity-40">
                  <Eye size={48} className="mb-3 text-white/50" />
                  <p className="text-white font-medium">
                    {t('story.no_views')}
                  </p>
                  <p className="text-white/50 text-sm">
                    {t('story.viewer_list_empty')}
                  </p>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );

  return createPortal(modalContent, document.body);
}
