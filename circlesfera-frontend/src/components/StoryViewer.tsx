import { useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Check,
  Eye,
  Heart,
  Send,
  Trash2,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useStoryPlayback } from '../hooks/useStoryPlayback';
import { chatApi, storiesApi } from '../services';
import { useAuthStore } from '../stores/authStore';
import type { Story, UserWithProfile } from '../types';
import { logger } from '../utils/logger';
import { parseFilter } from '../utils/styleUtils';
import { StoryDeleteConfirm } from './StoryDeleteConfirm';
import { StoryViewersSheet } from './StoryViewersSheet';
import UserAvatar from './UserAvatar';
import VerificationBadge, { type VerificationLevel } from './VerificationBadge';

const getRelativeTime = (dateValue: string | Date | number) => {
  const diffMins = Math.floor(
    (Date.now() - new Date(dateValue).getTime()) / 60000,
  );
  if (diffMins < 60) return `${Math.max(1, diffMins)}m`;
  return `${Math.floor(diffMins / 60)}h`;
};

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
  const { profile } = useAuthStore();
  const queryClient = useQueryClient();

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [viewers, setViewers] = useState<UserWithProfile[]>([]);
  const [showViewers, setShowViewers] = useState(false);
  const [isLoadingViewers, setIsLoadingViewers] = useState(false);
  const [reactions, setReactions] = useState<
    { reaction: string; userId: string; user: UserWithProfile }[]
  >([]);
  const [replyText, setReplyText] = useState('');
  const [isSendingReply, setIsSendingReply] = useState(false);
  const [messageSent, setMessageSent] = useState(false);

  // Floating reactions system
  const [particles, setParticles] = useState<
    { id: number; x: number; y: number; emoji: string }[]
  >([]);
  const particleIdCounter = useRef(0);

  const isModalOpen = showDeleteConfirm || showViewers;

  const {
    currentIndex,
    progress,
    setIsPaused,
    isMuted,
    setIsMuted,
    handleNext,
    handlePrev,
  } = useStoryPlayback({
    totalStories: stories.length,
    initialIndex,
    onClose,
    audioUrl: stories[0]?.audio?.url,
    isPausedOverride: isModalOpen,
  });

  const currentStory = stories[currentIndex];
  const isOwner = profile?.userId === currentStory?.userId;

  // Safeguard
  useEffect(() => {
    if (!currentStory) onClose();
  }, [currentStory, onClose]);

  // Mark as viewed
  useEffect(() => {
    let viewed = false;
    if (currentStory && !isOwner && !viewed) {
      storiesApi
        .markViewed(currentStory.id)
        .then(() => queryClient.invalidateQueries({ queryKey: ['stories'] }))
        .catch(console.error);
      viewed = true;
    }
  }, [currentStory, isOwner, queryClient]);

  // Fetch Reactions
  useEffect(() => {
    if (currentStory) {
      storiesApi
        .getReactions(currentStory.id)
        .then((res) => setReactions(res.data))
        .catch(console.error);
    }
  }, [currentStory]);

  const triggerReactionAnimation = (emoji: string) => {
    const newParticles = Array.from({ length: 12 }).map(() => ({
      id: particleIdCounter.current++,
      x: Math.random() * 100 - 50,
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

  const handleLike = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      triggerReactionAnimation('❤️');
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

  const confirmDelete = async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    try {
      await storiesApi.delete(currentStory.id);
      queryClient.invalidateQueries({ queryKey: ['stories'] });
      queryClient.invalidateQueries({ queryKey: ['my-stories'] });
      onClose();
    } catch (error) {
      logger.error('Failed to delete story:', error);
      alert('Failed to delete story');
      setShowDeleteConfirm(false);
    }
  };

  const handleShowViewers = async (e: React.MouseEvent) => {
    e.stopPropagation();
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

  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressRef = useRef(false);
  const startX = useRef(0);

  if (!currentStory) return null;

  const modalContent = (
    <div className="fixed inset-0 z-50 bg-black flex items-center justify-center overflow-hidden">
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {`Story ${currentIndex + 1} of ${stories.length} from ${currentStory.user.profile.username}`}
      </div>

      {/* Blurred Background Layer */}
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
        <div className="absolute inset-0 bg-black/60 md:bg-black/40" />
        <div className="absolute inset-0 opacity-20 pointer-events-none mix-blend-overlay bg-linear-to-tr from-brand-primary/20 via-transparent to-brand-secondary/20" />
      </div>

      {/* Center content */}
      <div className="absolute inset-0 flex items-center justify-center z-10 md:p-8">
        <AnimatePresence mode="popLayout" custom={currentIndex}>
          <motion.div
            key={currentStory.id}
            initial={{ opacity: 0, scale: 0.95, x: 100 }}
            animate={{ opacity: 1, scale: 1, x: 0 }}
            exit={{ opacity: 0, scale: 0.95, x: -100 }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="relative w-full h-full md:w-auto md:h-[92vh] md:max-h-[92vh] md:aspect-9/16 flex items-center justify-center md:rounded-xl overflow-hidden ring-1 ring-white/10 md:shadow-[0_0_50px_rgba(0,0,0,0.5)] md:mx-auto"
          >
            {(() => {
              const { className, style } = parseFilter(currentStory.filter);
              return currentStory.mediaType === 'video' ? (
                <video
                  src={currentStory.url}
                  className={`absolute inset-0 w-full h-full md:rounded-lg shadow-2xl object-contain pointer-events-auto z-10 ${className}`}
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
                  className={`absolute inset-0 w-full h-full md:rounded-lg shadow-2xl object-contain pointer-events-auto z-10 ${className}`}
                  style={style}
                  loading="eager"
                />
              );
            })()}

            <div className="absolute inset-x-0 top-0 h-40 bg-linear-to-b from-black/80 via-black/40 to-transparent pointer-events-none z-20 md:rounded-t-2xl" />
            <div className="absolute inset-x-0 bottom-0 h-48 bg-linear-to-t from-black/90 via-black/50 to-transparent pointer-events-none z-20 md:rounded-b-2xl" />

            {/* Progress Bars */}
            <div className="absolute top-0 left-0 right-0 z-40 flex gap-1 p-3 pt-safe-top">
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
            <div className="absolute top-12 md:top-10 left-0 right-0 z-40 px-4 flex items-center justify-between pointer-events-none">
              <div className="flex items-center gap-3 pointer-events-auto">
                <div className="ring-1 ring-white/20 rounded-full shadow-lg">
                  <UserAvatar
                    src={currentStory.user.profile?.avatar}
                    thumbnailUrl={currentStory.user.profile?.thumbnailUrl}
                    standardUrl={currentStory.user.profile?.standardUrl}
                    alt={currentStory.user.profile?.username || 'User'}
                    size="sm"
                  />
                </div>
                <div className="flex flex-col gap-0.5 justify-center">
                  <span className="text-white font-semibold text-[15px] leading-tight drop-shadow-md flex items-center gap-1">
                    {currentStory.user.profile.username}
                    <VerificationBadge
                      level={
                        currentStory.user.verificationLevel as VerificationLevel
                      }
                      size={14}
                    />
                  </span>
                  <span className="text-white/80 text-[13px] font-medium leading-tight drop-shadow-md">
                    {getRelativeTime(currentStory.createdAt)}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2.5 pointer-events-auto">
                <button
                  type="button"
                  onClick={() => setIsMuted(!isMuted)}
                  aria-label={isMuted ? 'Unmute' : 'Mute'}
                  className="text-white/90 bg-black/30 hover:bg-black/50 p-2.5 rounded-full backdrop-blur-md transition-colors shadow-lg"
                >
                  {isMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close story viewer"
                  className="text-white/90 bg-black/30 hover:bg-black/50 p-2.5 rounded-full backdrop-blur-md transition-colors shadow-lg"
                >
                  <X size={22} />
                </button>
              </div>
            </div>

            {/* Footer */}
            <div className="absolute bottom-6 left-0 right-0 z-40 px-4 pointer-events-none mb-safe-bottom">
              <div className="pointer-events-auto w-full">
                {!isOwner ? (
                  <div className="flex items-center gap-3">
                    <form
                      onSubmit={handleSendReply}
                      className={`flex-1 bg-black/40 backdrop-blur-2xl border border-white/20 rounded-full px-2 py-1 flex items-center shadow-2xl transition-all focus-within:bg-black/60 ${messageSent ? 'border-green-500/50 bg-green-500/20' : ''}`}
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
                          className="absolute bottom-14 right-6 text-xl pointer-events-none drop-shadow-lg z-50"
                        >
                          {p.emoji}
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
                ) : (
                  <div className="flex justify-between items-center">
                    <button
                      type="button"
                      onClick={handleShowViewers}
                      className="flex items-center gap-2 text-white bg-black/40 backdrop-blur-xl rounded-full px-5 py-3 border border-white/20 hover:bg-black/60 transition-colors shadow-2xl"
                    >
                      <Eye size={20} />
                      <span className="font-bold text-sm">
                        {viewers.length} {t('story.views')}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setShowDeleteConfirm(true); }}
                      aria-label="Delete this story"
                      className="text-white bg-black/40 backdrop-blur-xl p-3 rounded-full border border-white/20 hover:bg-red-500/80 hover:border-red-500 transition-all shadow-2xl"
                    >
                      <Trash2 size={20} />
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Gesture Handler */}
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
                if (longPressTimer.current) clearTimeout(longPressTimer.current);
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

      {isOwner && reactions.length > 0 && (
        <div className="absolute bottom-24 left-4 z-50 flex flex-wrap gap-2 pointer-events-none">
          {reactions.slice(0, 5).map((r) => (
            <div
              key={r.userId}
              className="flex items-center gap-1 bg-black/60 backdrop-blur-md rounded-full px-3 py-1.5 border border-white/20 pointer-events-auto"
            >
              <span className="text-base">{r.reaction}</span>
              <span className="text-xs font-medium text-white">
                {r.user.profile.username}
              </span>
            </div>
          ))}
        </div>
      )}

      {showDeleteConfirm && (
        <StoryDeleteConfirm
          onConfirm={confirmDelete}
          onCancel={(e) => {
            e?.stopPropagation();
            setShowDeleteConfirm(false);
          }}
        />
      )}

      {showViewers && (
        <StoryViewersSheet
          viewers={viewers}
          isLoading={isLoadingViewers}
          onClose={(e) => {
            e?.stopPropagation();
            setShowViewers(false);
          }}
        />
      )}
    </div>
  );

  return createPortal(modalContent, document.body);
}
