import '@livekit/components-styles';
import { LiveKitRoom, RoomAudioRenderer } from '@livekit/components-react';
import { AnimatePresence, motion } from 'framer-motion';
import { Eye, Gift, Heart, HelpCircle, Send, X } from 'lucide-react';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import CinematicStage from '../../components/live/CinematicStage';
import CoHostInviteBanner from '../../components/live/CoHostInviteBanner';
import LiveGiftModal from '../../components/live/LiveGiftModal';
import LiveGoalBar, {
  type LiveGoalData,
} from '../../components/live/LiveGoalBar';
import LivePinnedComment, {
  type PinnedCommentData,
} from '../../components/live/LivePinnedComment';
import LiveQnAPanel, {
  type LiveQuestion,
} from '../../components/live/LiveQnAPanel';
import { apiClient as api } from '../../services/api';
import { useSocketStore } from '../../stores/socketStore';

const REACTION_EMOJIS = ['🔥', '❤️', '👏', '🚀', '⭐'];

interface FloatingReaction {
  id: string;
  emoji: string;
  x: number;
}

export default function LiveViewer() {
  const { t } = useTranslation();
  const { streamId } = useParams<{ streamId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const [token, setToken] = useState('');
  const [coHostToken, setCoHostToken] = useState<string | null>(null);
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
      toast.success(t('live.gift_sent', '¡Regalo enviado!'));
      searchParams.delete('gift_success');
      searchParams.delete('session_id');
      setSearchParams(searchParams, { replace: true });
    }
    if (searchParams.get('gift_canceled') === 'true') {
      toast.error(t('live.gift_canceled', 'Pago de regalo cancelado'));
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
        toast.error(t('live.ended_or_not_found'));
        navigate(-1);
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
            user: data.senderUsername || 'Someone',
            gift: data.giftId || 'gift',
            defaultValue: `${data.senderUsername || 'Someone'} sent a ${data.giftId || 'gift'}!`,
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
  }, [streamId, navigate, t]);

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

  const handleDoubleTap = () => {
    sendQuickReaction('❤️');
  };

  const handleAskQuestion = (question: string) => {
    const socket = useSocketStore.getState().socket;
    // We can just pass a placeholder 'Espectador' for now.
    if (!socket || !activeStreamId) return;
    socket.emit('live:ask_question', {
      streamId: activeStreamId,
      question,
      username: 'Espectador',
    });
    setIsQnAOpen(false);
  };

  if (activeToken === '') {
    return (
      <div className="flex h-screen items-center justify-center bg-black text-white font-bold">
        {t('live.connecting')}
      </div>
    );
  }

  const serverUrl =
    import.meta.env.VITE_LIVEKIT_URL ||
    'wss://circlesfera-6sxa79qt.livekit.cloud';

  return (
    <div className="w-full h-screen bg-neutral-950 flex items-center justify-center overflow-hidden">
      {/* biome-ignore lint/a11y/useSemanticElements: Double-tap on screen area */}
      <div
        role="button"
        tabIndex={0}
        className="w-full h-full md:max-w-105 md:h-[88vh] md:rounded-3xl border border-white/10 shadow-[0_0_60px_rgba(0,0,0,0.9)] relative flex flex-col overflow-hidden bg-black select-none"
        onDoubleClick={handleDoubleTap}
        onKeyDown={(e) => e.key === 'Enter' && handleDoubleTap()}
      >
        {/* Top Header Overlay */}
        <div className="absolute top-4 left-4 right-4 z-50 flex items-center justify-between pointer-events-auto">
          <div className="flex items-center gap-2.5">
            {/* Host Avatar with Gradient Ring */}
            <div className="p-0.5 bg-linear-to-tr from-amber-400 via-pink-500 to-purple-600 rounded-full shadow-lg">
              <img
                src={
                  streamDetails?.host?.profile?.avatar ||
                  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150'
                }
                alt="Host Avatar"
                className="w-9 h-9 rounded-full object-cover border-2 border-black"
              />
            </div>

            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <span className="text-xs font-extrabold text-white tracking-wide drop-shadow-md">
                  {streamDetails?.host?.profile?.username || 'Creador Live'}
                </span>
                <span className="bg-linear-to-r from-pink-600 to-purple-600 text-[10px] font-black text-white px-2 py-0.5 rounded-md uppercase tracking-wider shadow-md shadow-pink-500/30">
                  VIVO
                </span>
              </div>
              {streamDetails?.title && (
                <span className="text-[11px] text-white/70 truncate max-w-35">
                  {streamDetails.title}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Viewer Count Badge */}
            <div className="flex items-center space-x-1.5 px-3 py-1.5 bg-black/40 border border-white/15 rounded-full backdrop-blur-xl text-xs font-bold text-white shadow-xl">
              <Eye className="w-3.5 h-3.5 text-pink-400" />
              <span>{viewerCount}</span>
            </div>

            {/* Close Button */}
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="p-2 bg-black/40 hover:bg-black/60 rounded-full text-white backdrop-blur-xl border border-white/10 transition-all shadow-xl hover:scale-105 active:scale-95"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
        {/* Live Goal Bar (Top Center/Left below header) */}
        <div className="absolute top-16 left-4 z-50 pointer-events-auto">
          <LiveGoalBar goal={liveGoal} isHost={false} />
        </div>
        {/* Co-Host Invite Banner */}
        <CoHostInviteBanner
          invite={pendingInvite}
          onAccepted={(t, sid) => {
            setCoHostToken(t);
            setCoHostStreamId(sid);
            setPendingInvite(null);
          }}
          onDismiss={() => setPendingInvite(null)}
        />
        <div className="flex-1 overflow-hidden relative">
          <LiveKitRoom
            video={!!coHostToken}
            audio={!!coHostToken}
            token={activeToken}
            serverUrl={serverUrl}
            data-lk-theme="default"
            className="h-full w-full"
            onDisconnected={() => navigate(-1)}
          >
            <CinematicStage />
            <RoomAudioRenderer />
          </LiveKitRoom>

          {/* Projected Question Overlay */}
          {highlightedQuestion && (
            <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 z-40 w-[80%] max-w-sm pointer-events-none">
              <div className="bg-white p-4 rounded-3xl shadow-[0_10px_40px_rgba(0,0,0,0.5)] border border-neutral-100 animate-in zoom-in duration-300">
                <div className="flex items-center gap-2 mb-2">
                  <img
                    src={
                      highlightedQuestion.avatar ||
                      'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=50'
                    }
                    alt={highlightedQuestion.username}
                    className="w-8 h-8 rounded-full"
                  />
                  <div>
                    <span className="block text-xs font-bold text-neutral-800">
                      {highlightedQuestion.username}
                    </span>
                    <span className="block text-[10px] text-pink-500 font-bold uppercase tracking-widest">
                      Pregunta
                    </span>
                  </div>
                </div>
                <p className="text-black font-semibold text-lg">
                  {highlightedQuestion.question}
                </p>
              </div>
            </div>
          )}
        </div>
        {/* Floating Reactions Overlay */}
        <div className="pointer-events-none absolute bottom-36 right-8 top-16 flex w-20 flex-col-reverse items-center justify-start overflow-hidden pb-4 z-40">
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
                  <Heart className="h-8 w-8 fill-red-500 text-red-500 drop-shadow-[0_0_12px_rgba(239,68,68,0.8)]" />
                ) : (
                  <span>{r.emoji}</span>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
        ;{/* Instagram Live Chat & Interactivity Overlay */}
        <div className="absolute bottom-0 left-0 right-0 bg-linear-to-t from-black/95 via-black/60 to-transparent p-4 flex flex-col justify-end z-40">
          {/* Pinned Comment Banner */}
          <LivePinnedComment pinnedComment={pinnedComment} />

          {/* Live Chat Messages (Instagram Style: Stream of semi-transparent text lines) */}
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
                  <span className="font-extrabold text-pink-400 drop-shadow-sm">
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

          {/* Instagram Bottom Action Bar */}
          <div className="flex items-center gap-2 pointer-events-auto">
            <form
              onSubmit={handleSend}
              className="flex-1 flex gap-2 items-center"
            >
              <button
                type="button"
                onClick={() => setIsQnAOpen(true)}
                className="p-2.5 bg-white/15 hover:bg-white/25 rounded-full text-white transition-colors relative"
              >
                <HelpCircle size={20} />
              </button>
              <input
                type="text"
                placeholder={t('live.chat_placeholder', 'Comentar...')}
                value={messageInput}
                onChange={(e) => setMessageInput(e.target.value)}
                className="w-full rounded-full bg-white/15 border border-white/25 px-4 py-2.5 text-xs sm:text-sm text-white placeholder-white/60 outline-none backdrop-blur-xl focus:bg-white/25 focus:border-pink-500/50 transition-all shadow-inner"
              />
              {messageInput.trim() && (
                <button
                  type="submit"
                  className="rounded-full bg-pink-600 p-2.5 text-white hover:bg-pink-700 active:scale-95 transition-all shadow-md shadow-pink-600/30 shrink-0"
                >
                  <Send className="h-4 w-4" />
                </button>
              )}
            </form>

            {/* Action Buttons: Quick Emoji Reactions & Gift */}
            <div className="flex items-center gap-1.5 shrink-0">
              {REACTION_EMOJIS.map((emoji) => (
                <button
                  type="button"
                  key={emoji}
                  onClick={() => sendQuickReaction(emoji)}
                  className="w-9 h-9 rounded-full bg-white/15 hover:bg-white/25 active:scale-90 flex items-center justify-center text-sm transition-all backdrop-blur-xl border border-white/20 shadow-md shrink-0"
                  title={t('live.send_reaction', { emoji })}
                >
                  {emoji}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setGiftModalOpen(true)}
                className="p-2.5 rounded-full bg-linear-to-tr from-amber-400 to-pink-500 text-white shadow-lg shadow-pink-500/30 hover:scale-105 active:scale-95 transition-all shrink-0"
                title={t('live.send_gift_btn', 'Regalar')}
              >
                <Gift className="w-5 h-5 text-white animate-pulse" />
              </button>
            </div>
          </div>
        </div>
        {streamId ? (
          <LiveGiftModal
            isOpen={giftModalOpen}
            onClose={() => setGiftModalOpen(false)}
            streamId={streamId}
          />
        ) : null}
        <LiveQnAPanel
          isOpen={isQnAOpen}
          onClose={() => setIsQnAOpen(false)}
          isHost={false}
          questions={questions}
          onAskQuestion={handleAskQuestion}
        />
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
      </div>
    </div>
  );
}
