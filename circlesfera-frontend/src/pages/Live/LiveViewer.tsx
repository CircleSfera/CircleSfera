import '@livekit/components-styles';
import { LiveKitRoom, RoomAudioRenderer } from '@livekit/components-react';
import { AnimatePresence, motion } from 'framer-motion';
import { Gift, Heart, HelpCircle, Send, X } from 'lucide-react';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  CREATE_PRIMARY,
  CREATE_SECONDARY,
} from '../../components/create-post/createStyles';
import CinematicStage from '../../components/live/CinematicStage';
import CoHostInviteBanner from '../../components/live/CoHostInviteBanner';
import LiveGiftModal from '../../components/live/LiveGiftModal';
import LiveGoalBar, {
  type LiveGoalData,
} from '../../components/live/LiveGoalBar';
import {
  LiveControl,
  LiveFrame,
  LiveHost,
  LiveStatus,
} from '../../components/live/LivePieces';
import LivePinnedComment, {
  type PinnedCommentData,
} from '../../components/live/LivePinnedComment';
import LiveQnAPanel, {
  type LiveQuestion,
} from '../../components/live/LiveQnAPanel';
import { apiClient as api } from '../../services/api';
import { useAuthStore } from '../../stores/authStore';
import { useSocketStore } from '../../stores/socketStore';
import { initialsAvatarUrl } from '../../utils/initialsAvatar';
import { hasElitePlan } from '../../utils/plans';

const REACTION_EMOJIS = ['🔥', '❤️', '👏', '🚀', '⭐'];
// The reactions of the Elite Creator and Business plans. Everyone sees them
// float; the server only lets a profile on one of those plans send them.
const ELITE_REACTION_EMOJIS = ['💎', '👑', '⚡', '🎉', '💯'];

interface FloatingReaction {
  id: string;
  emoji: string;
  x: number;
}

/** A neutral picture with the person's initials, for someone without one. */
const fallbackAvatar = (username: string) => initialsAvatarUrl(username);

export default function LiveViewer() {
  const { t } = useTranslation();
  const { streamId } = useParams<{ streamId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const profile = useAuthStore((state) => state.profile);
  const canSendEliteReactions = hasElitePlan(profile?.verificationLevel);
  const [token, setToken] = useState('');
  const [coHostToken, setCoHostToken] = useState<string | null>(null);
  // The broadcast is over: said on its own screen, not as a lost connection.
  const [hasEnded, setHasEnded] = useState(false);
  const [coHostStreamId, setCoHostStreamId] = useState<string | null>(null);
  const [viewerCount, setViewerCount] = useState<number>(1);
  const [giftModalOpen, setGiftModalOpen] = useState(false);
  const [pinnedComment, setPinnedComment] = useState<PinnedCommentData | null>(
    null,
  );
  const [pendingInvite, setPendingInvite] = useState<{
    streamId: string;
    streamTitle?: string | null;
    host: { id?: string; username?: string; avatar?: string | null };
  } | null>(null);
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [messageInput, setMessageInput] = useState('');
  const [reactions, setReactions] = useState<FloatingReaction[]>([]);

  // Phase 2 State
  const [liveGoal, setLiveGoal] = useState<LiveGoalData | null>(null);
  const [isQnAOpen, setIsQnAOpen] = useState(false);
  const [questions, setQuestions] = useState<LiveQuestion[]>([]);
  const [highlightedQuestion, setHighlightedQuestion] =
    useState<LiveQuestion | null>(null);

  const navigate = useNavigate();
  const chatEndRef = useRef<HTMLDivElement>(null);

  const [streamDetails, setStreamDetails] = useState<any>(null);

  useEffect(() => {
    if (searchParams.get('gift_success') === 'true') {
      toast.success(t('live.gift_sent'));
      searchParams.delete('gift_success');
      searchParams.delete('session_id');
      setSearchParams(searchParams, { replace: true });
    }
    if (searchParams.get('gift_canceled') === 'true') {
      toast.error(t('live.gift_canceled'));
      searchParams.delete('gift_canceled');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams, t]);

  useEffect(() => {
    if (!streamId) return;

    api
      .get(`/live/${streamId}`)
      .then((res: any) => {
        setStreamDetails(res.data);
      })
      .catch(() => {});

    api
      .get(`/live/join/${streamId}`)
      .then((res: any) => {
        setToken(res.data.token);
      })
      .catch(() => {
        setHasEnded(true);
      });

    const socket = useSocketStore.getState().socket;
    if (!socket) return;
    socket.emit('live:join', { streamId });

    socket.on('live:viewer_count_update', (data: { viewerCount: number }) => {
      if (typeof data?.viewerCount === 'number') {
        setViewerCount(data.viewerCount);
      }
    });

    socket.on('live:chat_message', (msg: any) => {
      setChatMessages((prev) => [...prev.slice(-49), msg]); // Keep last 50
      setTimeout(
        () => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }),
        100,
      );
    });

    socket.on('live:comment_pinned', (data: PinnedCommentData) => {
      setPinnedComment(data);
    });

    socket.on('live:comment_unpinned', () => {
      setPinnedComment(null);
    });

    const triggerFloatingReaction = (emoji: string) => {
      const id = Math.random().toString(36).substring(2, 9);
      const x = Math.random() * 50 - 25;
      setReactions((prev) => [...prev, { id, emoji, x }]);
      setTimeout(() => {
        setReactions((prev) => prev.filter((r) => r.id !== id));
      }, 2000);
    };

    socket.on(
      'live:gift',
      (data: {
        giftId?: string;
        senderUsername?: string;
        amountCents?: number;
      }) => {
        toast.success(
          t('live.gift_received_toast', {
            user: data.senderUsername || t('live.someone'),
            gift: data.giftId || t('live.gift_generic'),
          }),
        );
        triggerFloatingReaction('🎁');
      },
    );

    socket.on('live:heart_received', (data: any) => {
      triggerFloatingReaction(data?.reaction || '❤️');
    });

    socket.on('live:reaction_received', (data: any) => {
      triggerFloatingReaction(data?.reaction || '🔥');
    });

    socket.on('live:cohost_invite', (data: any) => {
      setPendingInvite(data);
    });

    // Phase 2 listeners
    socket.on('live:goal_set', (data: LiveGoalData) => {
      setLiveGoal(data);
    });

    socket.on('live:question_asked', (q: LiveQuestion) => {
      setQuestions((prev) => [q, ...prev]);
    });

    socket.on('live:question_highlighted', (q: LiveQuestion) => {
      setHighlightedQuestion(q);
    });

    socket.on('live:question_cleared', () => {
      setHighlightedQuestion(null);
    });

    return () => {
      socket.emit('live:leave', { streamId });
      socket.off('live:viewer_count_update');
      socket.off('live:chat_message');
      socket.off('live:comment_pinned');
      socket.off('live:comment_unpinned');
      socket.off('live:gift');
      socket.off('live:heart_received');
      socket.off('live:reaction_received');
      socket.off('live:cohost_invite');
      socket.off('live:goal_set');
      socket.off('live:question_asked');
      socket.off('live:question_highlighted');
      socket.off('live:question_cleared');
    };
  }, [streamId, t]);

  // If co-host accepted: switch LiveKitRoom to publisher mode
  const activeToken = coHostToken || token;
  const activeStreamId = coHostStreamId || streamId;

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageInput.trim() || !activeStreamId) return;
    const socket = useSocketStore.getState().socket;
    if (!socket) return;
    socket.emit('live:chat', {
      streamId: activeStreamId,
      message: messageInput,
    });
    setMessageInput('');
  };

  const sendQuickReaction = (emoji: string) => {
    if (!activeStreamId) return;
    const socket = useSocketStore.getState().socket;
    if (!socket) return;
    socket.emit('live:send_reaction', {
      streamId: activeStreamId,
      reaction: emoji,
    });
  };

  const handleDoubleTap = (e: React.MouseEvent) => {
    // Two quick presses on a control are two uses of that control, and a
    // double click in the comment field selects a word: neither is a heart.
    if (
      (e.target as HTMLElement).closest(
        'button, input, textarea, a, [role="dialog"]',
      )
    ) {
      return;
    }
    sendQuickReaction('❤️');
  };

  const handleAskQuestion = (question: string) => {
    const socket = useSocketStore.getState().socket;
    if (!socket || !activeStreamId) return;
    const username = profile?.username?.trim() || t('live.anonymous');
    socket.emit('live:ask_question', {
      streamId: activeStreamId,
      question,
      username,
      avatar: profile?.avatar || undefined,
    });
    setIsQnAOpen(false);
  };

  const hostName =
    streamDetails?.host?.profile?.username || t('live.host_fallback');

  if (hasEnded) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center px-4 text-white">
        <div className="flex w-full max-w-sm flex-col items-center gap-6 text-center">
          <img
            src={
              streamDetails?.host?.profile?.avatar || fallbackAvatar(hostName)
            }
            alt=""
            className="h-20 w-20 rounded-full object-cover ring-2 ring-white/20"
          />
          <div>
            <h1 className="mb-2 text-2xl font-semibold">
              {t('live.viewer_ended_title')}
            </h1>
            <p className="text-sm text-white/60">
              {t('live.viewer_ended_body', { username: hostName })}
            </p>
          </div>
          <div className="flex w-full flex-col gap-3">
            {streamDetails?.host?.profile?.username && (
              <button
                type="button"
                onClick={() =>
                  navigate(`/${streamDetails.host.profile.username}`)
                }
                className={CREATE_PRIMARY}
              >
                {t('live.viewer_ended_profile')}
              </button>
            )}
            <button
              type="button"
              onClick={() => navigate(-1)}
              className={`w-full ${CREATE_SECONDARY}`}
            >
              {t('common.close')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (activeToken === '') {
    return (
      <div className="flex h-dvh items-center justify-center bg-black md:bg-transparent text-white font-bold">
        {t('live.connecting')}
      </div>
    );
  }

  const serverUrl =
    import.meta.env.VITE_LIVEKIT_URL ||
    'wss://circlesfera-6sxa79qt.livekit.cloud';

  return (
    <>
      {/* The room holds the whole screen and draws no box of its own. A
          double tap anywhere sends a heart: it is not a button, it holds
          every control of the screen, and the reactions have their own. */}
      <LiveKitRoom
        video={!!coHostToken}
        audio={!!coHostToken}
        token={activeToken}
        serverUrl={serverUrl}
        data-lk-theme="default"
        className="contents"
        onDisconnected={() => {
          // The video stops both when the host ends the broadcast and when
          // the connection drops: the server says which.
          api
            .get(`/live/${streamId}`)
            .then((res: any) => {
              if (res.data?.status === 'ENDED') {
                setHasEnded(true);
                return;
              }
              toast.error(t('live.connection_lost'));
              navigate(-1);
            })
            .catch(() => setHasEnded(true));
        }}
      >
        <LiveFrame
          onDoubleClick={handleDoubleTap}
          video={
            <>
              <CinematicStage />
              <RoomAudioRenderer />
            </>
          }
        >
          {/* Top band: whose broadcast it is and what it is doing; the way
              out on the right. */}
          <div
            data-testid="live-top-band"
            className="pointer-events-none absolute inset-x-(--live-side) top-(--live-top) z-50 flex items-start justify-between gap-2 [&>*]:pointer-events-auto"
          >
            <div className="flex min-w-0 flex-col items-start gap-2">
              <div className="flex min-w-0 max-w-full flex-wrap items-center gap-x-2.5 gap-y-2">
                <LiveHost
                  username={
                    streamDetails?.host?.profile?.username ||
                    t('live.host_fallback')
                  }
                  avatar={streamDetails?.host?.profile?.avatar}
                  title={streamDetails?.title}
                />
                <LiveStatus
                  startedAt={
                    streamDetails?.startedAt
                      ? Date.parse(streamDetails.startedAt)
                      : null
                  }
                  viewers={viewerCount}
                />
              </div>
              <LiveGoalBar goal={liveGoal} isHost={false} />
            </div>
            <LiveControl label={t('common.close')} onClick={() => navigate(-1)}>
              <X className="h-5 w-5" aria-hidden />
            </LiveControl>
          </div>

          {/* The invitation to join as co-host */}
          <CoHostInviteBanner
            invite={pendingInvite}
            onAccepted={(t, sid) => {
              setCoHostToken(t);
              setCoHostStreamId(sid);
              setPendingInvite(null);
            }}
            onDismiss={() => setPendingInvite(null)}
          />

          {/* The question the host put on the video */}
          {highlightedQuestion && (
            <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 z-40 w-[80%] max-w-sm pointer-events-none">
              <div className="bg-white p-4 rounded-3xl shadow-[0_10px_40px_rgba(0,0,0,0.5)] border border-neutral-100 animate-in zoom-in duration-300">
                <div className="flex items-center gap-2 mb-2">
                  <img
                    src={
                      highlightedQuestion.avatar ||
                      fallbackAvatar(highlightedQuestion.username)
                    }
                    alt={highlightedQuestion.username}
                    className="w-8 h-8 rounded-full"
                  />
                  <div>
                    <span className="block text-xs font-bold text-neutral-800">
                      {highlightedQuestion.username}
                    </span>
                    <span className="block text-xs text-brand-secondary font-bold uppercase tracking-widest">
                      {t('live.qna.question')}
                    </span>
                  </div>
                </div>
                <p className="text-black font-semibold text-lg">
                  {highlightedQuestion.question}
                </p>
              </div>
            </div>
          )}
          {/* Floating Reactions Overlay */}
          <div className="pointer-events-none absolute right-(--live-side) top-(--live-top) bottom-[calc(var(--live-bottom)+7.5rem)] flex w-20 flex-col-reverse items-center justify-start overflow-hidden pb-4 z-40">
            <AnimatePresence>
              {reactions.map((r) => (
                <motion.div
                  key={r.id}
                  initial={{ opacity: 0, y: 50, scale: 0.5 }}
                  animate={{ opacity: 1, y: 0, scale: 1.2 }}
                  exit={{ opacity: 0, y: -60, scale: 0.8 }}
                  transition={{ duration: 2, ease: 'easeOut' }}
                  className="absolute bottom-0 text-3xl drop-shadow-[0_4px_12px_rgba(0,0,0,0.8)]"
                  style={{ transform: `translateX(${r.x}px)` }}
                >
                  {r.emoji === '❤️' ? (
                    <Heart className="h-8 w-8 fill-brand-secondary text-brand-secondary drop-shadow-[0_0_12px_rgba(239,68,68,0.8)]" />
                  ) : (
                    <span>{r.emoji}</span>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          {/* Bottom band: the comments, the reactions and what is written. */}
          <div
            data-testid="live-bottom-band"
            className="pointer-events-auto absolute inset-x-0 bottom-0 z-40 flex flex-col justify-end bg-linear-to-t from-black/85 via-black/40 to-transparent px-(--live-side) pt-4 pb-(--live-bottom)"
          >
            {/* Pinned Comment Banner */}
            <LivePinnedComment pinnedComment={pinnedComment} />

            {/* Live chat messages — stream of semi-transparent text lines */}
            <div className="overflow-y-auto max-h-52 mb-4 space-y-1.5 no-scrollbar relative mask-[linear-gradient(to_bottom,transparent,black_20%)] pt-6">
              <AnimatePresence initial={false}>
                {chatMessages.map((msg) => (
                  <motion.div
                    key={msg.id}
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                    className="text-white text-xs sm:text-sm bg-black/40 border border-white/10 backdrop-blur-md px-3 py-1.5 rounded-full w-fit max-w-[85%] shadow-md flex items-center gap-1.5"
                  >
                    <span className="font-extrabold text-white drop-shadow-sm">
                      {msg.user.username}
                    </span>
                    <span className="text-white/90 font-medium">
                      {msg.message}
                    </span>
                  </motion.div>
                ))}
              </AnimatePresence>
              <div ref={chatEndRef} />
            </div>

            {/* The plan reactions, on a row of their own above the others */}
            {canSendEliteReactions && (
              <div className="flex items-center gap-2 mb-2 overflow-x-auto no-scrollbar">
                {ELITE_REACTION_EMOJIS.map((emoji) => (
                  <button
                    type="button"
                    key={emoji}
                    onClick={() => sendQuickReaction(emoji)}
                    className="live-glass flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-lg transition-transform active:scale-90"
                    aria-label={t('live.send_reaction', { emoji })}
                  >
                    <span aria-hidden>{emoji}</span>
                  </button>
                ))}
              </div>
            )}

            {/* Reactions on their own row, so the comment field keeps its width */}
            <div className="flex items-center gap-2 mb-2 overflow-x-auto no-scrollbar">
              {REACTION_EMOJIS.map((emoji) => (
                <button
                  type="button"
                  key={emoji}
                  onClick={() => sendQuickReaction(emoji)}
                  className="live-glass flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-lg transition-transform active:scale-90"
                  aria-label={t('live.send_reaction', { emoji })}
                >
                  <span aria-hidden>{emoji}</span>
                </button>
              ))}
            </div>

            {/* The field first, then what a viewer can do. While something
                is being written the actions give way to sending it. */}
            <form onSubmit={handleSend} className="flex items-center gap-2">
              <input
                type="text"
                aria-label={t('live.chat_placeholder')}
                placeholder={t('live.chat_placeholder')}
                value={messageInput}
                onChange={(e) => setMessageInput(e.target.value)}
                className="live-glass min-h-11 min-w-0 flex-1 rounded-full px-4 text-base text-white placeholder-white/60 outline-none focus:border-white/40"
              />
              {messageInput.trim() ? (
                <LiveControl
                  type="submit"
                  tone="brand"
                  label={t('live.send_comment')}
                >
                  <Send className="h-4 w-4" aria-hidden />
                </LiveControl>
              ) : (
                <>
                  <LiveControl
                    label={t('live.qna.title')}
                    onClick={() => setIsQnAOpen(true)}
                  >
                    <HelpCircle className="h-5 w-5" aria-hidden />
                  </LiveControl>
                  <LiveControl
                    label={t('live.send_gift_btn')}
                    onClick={() => setGiftModalOpen(true)}
                  >
                    <Gift className="h-5 w-5" aria-hidden />
                  </LiveControl>
                </>
              )}
            </form>
          </div>

          <LiveQnAPanel
            isOpen={isQnAOpen}
            onClose={() => setIsQnAOpen(false)}
            isHost={false}
            questions={questions}
            onAskQuestion={handleAskQuestion}
          />
          {streamId ? (
            <LiveGiftModal
              isOpen={giftModalOpen}
              onClose={() => setGiftModalOpen(false)}
              streamId={streamId}
            />
          ) : null}
        </LiveFrame>
      </LiveKitRoom>
      <style>{`
        .animate-float-up {
          animation: floatUp 2s ease-in forwards;
        }
        @keyframes floatUp {
          0% { transform: translateY(0) scale(0.5); opacity: 0; }
          20% { transform: translateY(-20px) scale(1.3); opacity: 1; }
          100% { transform: translateY(-160px) scale(1); opacity: 0; }
        }
      `}</style>
    </>
  );
}
