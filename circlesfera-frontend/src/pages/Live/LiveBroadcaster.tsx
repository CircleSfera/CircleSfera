import '@livekit/components-styles';
import { LiveKitRoom, RoomAudioRenderer } from '@livekit/components-react';
import {
  Eye,
  Heart,
  HelpCircle,
  Pin,
  Send,
  Trash2,
  UserMinus,
  UserPlus,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import CinematicStage from '../../components/live/CinematicStage';
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
import { liveApi } from '../../services/live';
import { useSocketStore } from '../../stores/socketStore';

export default function LiveBroadcaster() {
  const { t } = useTranslation();
  const [token, setToken] = useState('');
  const [streamId, setStreamId] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [messageInput, setMessageInput] = useState('');
  const [hearts, setHearts] = useState<{ id: string; x: number }[]>([]);
  const [coHostUsernameInput, setCoHostUsernameInput] = useState('');
  const [coHostUsername, setCoHostUsername] = useState<string | null>(null);
  const [isInviting, setIsInviting] = useState(false);
  const [titleInput, setTitleInput] = useState('');
  const [hasStarted, setHasStarted] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isEnded, setIsEnded] = useState(false);
  const [viewerCount, setViewerCount] = useState(0);
  const [likesCount, setLikesCount] = useState(0);
  const [pinnedComment, setPinnedComment] = useState<PinnedCommentData | null>(
    null,
  );
  const [selectedMessage, setSelectedMessage] = useState<any | null>(null);

  // Phase 2 State
  const [liveGoal, setLiveGoal] = useState<LiveGoalData | null>(null);
  const [isQnAOpen, setIsQnAOpen] = useState(false);
  const [questions, setQuestions] = useState<LiveQuestion[]>([]);
  const [highlightedQuestion, setHighlightedQuestion] =
    useState<LiveQuestion | null>(null);

  const navigate = useNavigate();
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!hasStarted) return;
    return () => {
      // Don't call end automatically on unmount if we explicitly ended it
      if (!isEnded) {
        api.post('/live/end').catch(() => {});
      }
    };
  }, [hasStarted, isEnded]);

  const handleEndLive = async () => {
    try {
      await api.post('/live/end');
    } catch {
      // Silently fail
    } finally {
      setIsEnded(true);
      const socket = useSocketStore.getState().socket;
      if (socket && streamId) {
        socket.emit('live:leave', { streamId });
      }
    }
  };

  const handleStart = async (e: React.FormEvent) => {
    e.preventDefault();
    const title =
      titleInput.trim() || t('live.default_title', 'My Live Stream');
    setIsStarting(true);
    try {
      const res: any = await api.post('/live/start', { title });
      setToken(res.data.token);
      setStreamId(res.data.stream.id);
      setHasStarted(true);
    } catch {
      setIsStarting(false);
    }
  };

  useEffect(() => {
    if (!streamId) return;

    const socket = useSocketStore.getState().socket;
    if (!socket) return;
    socket.emit('live:join', { streamId });

    socket.on('live:chat_message', (msg: any) => {
      setChatMessages((prev) => [...prev.slice(-49), msg]);
      setTimeout(
        () => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }),
        100,
      );
    });

    socket.on('live:viewer_count_update', (data: { viewerCount: number }) => {
      if (typeof data?.viewerCount === 'number') {
        setViewerCount(Math.max(0, data.viewerCount - 1)); // Broadcaster doesn't count as viewer
      }
    });

    socket.on('live:comment_pinned', (data: PinnedCommentData) => {
      setPinnedComment(data);
    });

    socket.on('live:comment_unpinned', () => {
      setPinnedComment(null);
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

    // Listen for gifts to update goal
    socket.on('live:gift', (data: { amountCents?: number }) => {
      if (data.amountCents) {
        setLiveGoal((prev) => {
          if (!prev) return prev;
          // In this example, 1 cent = 1 unit for the goal
          return { ...prev, current: prev.current + (data.amountCents || 0) };
        });
      }
    });

    socket.on('live:heart_received', () => {
      setLikesCount((prev) => prev + 1);
      const id = Math.random().toString(36).substring(2, 9);
      const x = Math.random() * 40 - 20;
      setHearts((prev) => [...prev, { id, x }]);
      setTimeout(() => {
        setHearts((prev) => prev.filter((h) => h.id !== id));
      }, 2000);
    });

    return () => {
      socket.emit('live:leave', { streamId });
      socket.off('live:chat_message');
      socket.off('live:viewer_count_update');
      socket.off('live:comment_pinned');
      socket.off('live:comment_unpinned');
      socket.off('live:heart_received');
      socket.off('live:goal_set');
      socket.off('live:question_asked');
      socket.off('live:question_highlighted');
      socket.off('live:question_cleared');
      socket.off('live:gift');
    };
  }, [streamId]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageInput.trim() || !streamId) return;
    const socket = useSocketStore.getState().socket;
    if (!socket) return;
    socket.emit('live:chat', { streamId, message: messageInput });
    setMessageInput('');
  };

  const handleInviteCoHost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!streamId || !coHostUsernameInput.trim()) return;
    setIsInviting(true);
    try {
      // Resolve userId from username via profile search
      const profileRes = await api.get(
        `/users/profile/${coHostUsernameInput.trim()}`,
      );
      const userId = profileRes.data?.id;
      if (!userId) throw new Error('User not found');
      await liveApi.inviteCoHost(streamId, userId);
      setCoHostUsername(coHostUsernameInput.trim());
      setCoHostUsernameInput('');
    } catch {
      // Silent — socket will handle the real error path
    } finally {
      setIsInviting(false);
    }
  };

  const handleRemoveCoHost = async () => {
    if (!streamId) return;
    try {
      await liveApi.removeCoHost(streamId);
      setCoHostUsername(null);
    } catch {
      // Silent
    }
  };

  const handleDoubleTap = () => {
    if (!streamId) return;
    const socket = useSocketStore.getState().socket;
    if (!socket) return;
    socket.emit('live:heart', { streamId });
  };

  const handlePinMessage = () => {
    if (!selectedMessage || !streamId) return;
    const socket = useSocketStore.getState().socket;
    if (!socket) return;
    socket.emit('live:pin_comment', {
      streamId,
      commentId: selectedMessage.id,
      message: selectedMessage.message,
      username: selectedMessage.user.username,
      avatar: selectedMessage.user.avatar,
    });
    setSelectedMessage(null);
  };

  const handleUnpinMessage = () => {
    if (!streamId) return;
    const socket = useSocketStore.getState().socket;
    if (!socket) return;
    socket.emit('live:unpin_comment', { streamId });
    setSelectedMessage(null);
  };

  const handleDeleteMessage = () => {
    if (!selectedMessage) return;
    setChatMessages((prev) => prev.filter((m) => m.id !== selectedMessage.id));
    // Would ideally emit a socket event to delete it for everyone, but local hide works for Phase 1
    setSelectedMessage(null);
  };

  const handleSetGoal = () => {
    const target = prompt('Ingresa el monto objetivo (ej. 1000):', '1000');
    const title = prompt('Ingresa el título del objetivo:', 'Meta del Directo');
    if (!target || !title || !streamId) return;

    const socket = useSocketStore.getState().socket;
    if (socket) {
      socket.emit('live:set_goal', {
        streamId,
        title,
        target: parseInt(target, 10),
      });
    }
  };

  const handleHighlightQuestion = (q: LiveQuestion) => {
    const socket = useSocketStore.getState().socket;
    if (socket && streamId) {
      socket.emit('live:highlight_question', {
        streamId,
        questionId: q.id,
        question: q.question,
        username: q.username,
        avatar: q.avatar,
      });
    }
    setIsQnAOpen(false);
  };

  const handleClearHighlightQuestion = () => {
    const socket = useSocketStore.getState().socket;
    if (socket && streamId) {
      socket.emit('live:clear_question', { streamId });
    }
    setIsQnAOpen(false);
  };

  if (!hasStarted || token === '') {
    return (
      <div className="flex h-screen flex-col items-center justify-center px-4 gap-6">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="absolute top-4 left-4 p-2 bg-black/50 rounded-full text-white"
        >
          <X className="w-6 h-6" />
        </button>
        <h1 className="text-2xl font-semibold text-white">
          {t('live.setup_title', 'Go live')}
        </h1>
        <form
          onSubmit={handleStart}
          className="w-full max-w-sm flex flex-col gap-4"
        >
          <label className="flex flex-col gap-2 text-left">
            <span className="text-sm text-zinc-400">
              {t('live.title_label', 'Stream title')}
            </span>
            <input
              type="text"
              value={titleInput}
              onChange={(e) => setTitleInput(e.target.value)}
              placeholder={t('live.title_placeholder', 'My Live Stream')}
              maxLength={100}
              className="rounded-full bg-white/10 border border-white/10 px-4 py-2.5 text-white placeholder-white/40 outline-none focus:border-brand-primary"
            />
          </label>
          <button
            type="submit"
            disabled={isStarting}
            className="rounded-full bg-brand-primary px-6 py-2.5 text-white font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {isStarting
              ? t('live.starting')
              : t('live.start_button', 'Start streaming')}
          </button>
        </form>
      </div>
    );
  }

  if (isEnded) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-neutral-950 px-4 text-white">
        <div className="w-full max-w-sm bg-black/50 p-8 rounded-3xl border border-white/10 flex flex-col items-center gap-6 shadow-2xl backdrop-blur-xl">
          <div className="p-4 bg-brand-primary/20 rounded-full">
            <Heart className="w-12 h-12 text-brand-primary" />
          </div>
          <div className="text-center">
            <h1 className="text-3xl font-bold mb-2">Live Finalizado</h1>
            <p className="text-neutral-400 text-sm">
              Resumen de tu transmisión
            </p>
          </div>
          <div className="w-full flex gap-4 text-center mt-2">
            <div className="flex-1 bg-white/5 rounded-2xl p-4 border border-white/5">
              <span className="block text-2xl font-bold">{viewerCount}</span>
              <span className="text-xs text-neutral-400 uppercase tracking-wider">
                Espectadores
              </span>
            </div>
            <div className="flex-1 bg-white/5 rounded-2xl p-4 border border-white/5">
              <span className="block text-2xl font-bold text-pink-400">
                {likesCount}
              </span>
              <span className="text-xs text-neutral-400 uppercase tracking-wider">
                Me Gustas
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="w-full mt-4 rounded-full bg-white/10 hover:bg-white/20 px-6 py-3 font-semibold transition-all"
          >
            Cerrar Resumen
          </button>
        </div>
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
        {/* Top controls */}
        <div className="absolute top-3 left-3 z-50 flex items-center gap-2">
          <button
            type="button"
            onClick={handleEndLive}
            className="p-1.5 bg-black/60 hover:bg-red-500/80 rounded-full text-white backdrop-blur-md transition-colors shadow-md"
            title="Terminar transmisión"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-black/40 border border-white/15 rounded-full backdrop-blur-xl text-xs font-bold text-white shadow-xl">
            <Eye className="w-4 h-4 text-pink-400" />
            <span>{viewerCount}</span>
          </div>
        </div>

        {/* Co-Host panel — top right */}
        <div className="absolute top-3 right-3 z-50 flex flex-col items-end gap-2">
          {coHostUsername ? (
            // Co-host active indicator
            <div className="flex items-center gap-1.5 bg-purple-900/80 backdrop-blur-md px-2.5 py-1 rounded-full text-white text-xs border border-purple-500/30 shadow-lg">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
              </span>
              <span>
                {t('live.cohost_label')} <strong>@{coHostUsername}</strong>
              </span>
              <button
                type="button"
                onClick={handleRemoveCoHost}
                className="ml-1 text-red-300 hover:text-red-100 transition-colors"
                title={t('live.cohost_remove')}
              >
                <UserMinus size={13} />
              </button>
            </div>
          ) : (
            // Invite form
            <form
              onSubmit={handleInviteCoHost}
              className="flex items-center gap-1.5 bg-black/60 backdrop-blur-md border border-white/20 rounded-full px-2.5 py-1 shadow-lg"
            >
              <UserPlus size={13} className="text-purple-300 shrink-0" />
              <input
                type="text"
                placeholder={t('live.cohost_input_placeholder')}
                value={coHostUsernameInput}
                onChange={(e) => setCoHostUsernameInput(e.target.value)}
                className="bg-transparent text-white text-xs placeholder-white/40 outline-none w-24"
              />
              <button
                type="submit"
                disabled={isInviting || !coHostUsernameInput.trim()}
                className="text-purple-300 hover:text-purple-100 transition-colors disabled:opacity-40"
              >
                <Send size={12} />
              </button>
            </form>
          )}
        </div>

        {/* Live Goal Bar (Top Center/Left below header) */}
        <div className="absolute top-16 left-3 z-50 pointer-events-auto">
          <LiveGoalBar goal={liveGoal} isHost={true} onClick={handleSetGoal} />
        </div>

        <div className="flex-1 overflow-hidden relative">
          <LiveKitRoom
            video={true}
            audio={true}
            token={token}
            serverUrl={serverUrl}
            data-lk-theme="default"
            className="h-full w-full"
            onDisconnected={() => navigate(-1)}
          >
            <CinematicStage isBroadcaster={true} />
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

        {/* Floating Hearts */}
        <div className="pointer-events-none absolute bottom-24 right-6 top-0 flex w-16 flex-col-reverse items-center justify-start overflow-hidden pb-4 z-40">
          {hearts.map((heart) => (
            <div
              key={heart.id}
              className="animate-float-up absolute bottom-0 opacity-0"
              style={{ transform: `translateX(${heart.x}px)` }}
            >
              <Heart className="h-7 w-7 fill-red-500 text-red-500 drop-shadow-[0_0_8px_rgba(239,68,68,0.8)]" />
            </div>
          ))}
        </div>

        {/* Chat & Bottom Controls */}
        <div className="absolute bottom-0 left-0 right-0 bg-linear-to-t from-black/90 via-black/50 to-transparent p-3 flex flex-col justify-end z-40 pointer-events-auto">
          <LivePinnedComment
            pinnedComment={pinnedComment}
            onUnpin={handleUnpinMessage}
          />

          <div className="overflow-y-auto max-h-40 mb-2 space-y-1.5 no-scrollbar relative mask-[linear-gradient(to_bottom,transparent,black_20%)] pt-6">
            {chatMessages.map((msg) => (
              <button
                type="button"
                key={msg.id}
                onClick={() =>
                  setSelectedMessage(
                    selectedMessage?.id === msg.id ? null : msg,
                  )
                }
                className={`text-left text-white text-xs bg-black/40 border border-white/10 backdrop-blur-md px-2.5 py-1 rounded-full w-fit max-w-[85%] shadow-sm flex items-center gap-1 hover:bg-black/60 transition-colors ${selectedMessage?.id === msg.id ? 'border-pink-500/50 bg-black/80' : ''}`}
              >
                <span className="font-extrabold text-purple-300">
                  {msg.user.username}:{' '}
                </span>
                <span className="text-neutral-100">{msg.message}</span>
              </button>
            ))}
            <div ref={chatEndRef} />
          </div>

          {/* Chat Context Menu */}
          {selectedMessage && (
            <div className="mb-2 bg-black/80 backdrop-blur-xl border border-white/10 rounded-2xl p-2 flex gap-2 shadow-xl animate-in slide-in-from-bottom-2 fade-in duration-200">
              <button
                type="button"
                onClick={handlePinMessage}
                className="flex-1 flex items-center justify-center gap-2 py-2 px-3 bg-white/10 hover:bg-white/20 rounded-xl text-xs font-semibold text-white transition-colors"
              >
                <Pin size={14} /> Fijar
              </button>
              <button
                type="button"
                onClick={handleDeleteMessage}
                className="flex-1 flex items-center justify-center gap-2 py-2 px-3 bg-red-500/20 hover:bg-red-500/40 text-red-300 rounded-xl text-xs font-semibold transition-colors"
              >
                <Trash2 size={14} /> Eliminar
              </button>
              <button
                type="button"
                onClick={() => setSelectedMessage(null)}
                className="p-2 bg-white/5 hover:bg-white/10 rounded-xl text-neutral-400 transition-colors"
              >
                <X size={14} />
              </button>
            </div>
          )}

          <form onSubmit={handleSend} className="flex gap-2 items-center">
            <button
              type="button"
              onClick={() => setIsQnAOpen(true)}
              className="p-2 bg-white/15 hover:bg-white/25 rounded-full text-white transition-colors relative"
            >
              <HelpCircle size={18} />
              {questions.length > 0 && (
                <span className="absolute -top-1 -right-1 bg-pink-500 text-[10px] w-4 h-4 flex items-center justify-center rounded-full font-bold">
                  {questions.length}
                </span>
              )}
            </button>
            <input
              type="text"
              placeholder={t('live.chat_placeholder')}
              value={messageInput}
              onChange={(e) => setMessageInput(e.target.value)}
              className="flex-1 rounded-full bg-white/15 border border-white/20 px-3.5 py-2 text-xs text-white placeholder-white/50 outline-none backdrop-blur-md focus:bg-white/25 transition-all"
            />
            <button
              type="submit"
              className="rounded-full bg-brand-primary p-2 text-white hover:opacity-90 active:scale-95 transition-all shadow-md shrink-0"
            >
              <Send className="h-3.5 w-3.5" />
            </button>
          </form>
        </div>

        <LiveQnAPanel
          isOpen={isQnAOpen}
          onClose={() => setIsQnAOpen(false)}
          isHost={true}
          questions={questions}
          onHighlightQuestion={handleHighlightQuestion}
          onClearHighlight={handleClearHighlightQuestion}
        />
      </div>

      <style>{`
        .animate-float-up {
          animation: floatUp 2s ease-in forwards;
        }
        @keyframes floatUp {
          0% { transform: translateY(0) scale(0.5); opacity: 0; }
          20% { transform: translateY(-20px) scale(1.2); opacity: 1; }
          100% { transform: translateY(-150px) scale(1); opacity: 0; }
        }
      `}</style>
    </div>
  );
}
