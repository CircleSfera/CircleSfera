import '@livekit/components-styles';
import { LiveKitRoom, RoomAudioRenderer } from '@livekit/components-react';
import {
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
import { toast } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
  CREATE_PRIMARY,
  CREATE_SECONDARY,
} from '../../components/create-post/createStyles';
import CinematicStage from '../../components/live/CinematicStage';
import LiveGoalBar, {
  type LiveGoalData,
} from '../../components/live/LiveGoalBar';
import LiveGoalDialog from '../../components/live/LiveGoalDialog';
import LiveHostControls from '../../components/live/LiveHostControls';
import {
  LiveControl,
  LiveFrame,
  LiveSheet,
  LiveStatus,
} from '../../components/live/LivePieces';
import LivePinnedComment, {
  type PinnedCommentData,
} from '../../components/live/LivePinnedComment';
import LiveQnAPanel, {
  type LiveQuestion,
} from '../../components/live/LiveQnAPanel';
import ConfirmModal from '../../components/modals/ConfirmModal';
import { apiClient as api } from '../../services/api';
import { liveApi } from '../../services/live';
import { profileApi } from '../../services/profile.service';
import { useSocketStore } from '../../stores/socketStore';
import { initialsAvatarUrl } from '../../utils/initialsAvatar';

/** A neutral picture with the person's initials, for someone without one. */
const fallbackAvatar = (username: string) => initialsAvatarUrl(username);

export default function LiveBroadcaster() {
  const { t } = useTranslation();
  const [token, setToken] = useState('');
  const [streamId, setStreamId] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [messageInput, setMessageInput] = useState('');
  const [hearts, setHearts] = useState<
    { id: string; x: number; emoji: string }[]
  >([]);
  const [coHostUsernameInput, setCoHostUsernameInput] = useState('');
  const [coHostUsername, setCoHostUsername] = useState<string | null>(null);
  const [isInviting, setIsInviting] = useState(false);
  const [titleInput, setTitleInput] = useState('');
  const [hasStarted, setHasStarted] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isEnded, setIsEnded] = useState(false);
  const [isEnding, setIsEnding] = useState(false);
  const [confirmEndOpen, setConfirmEndOpen] = useState(false);
  // One sheet at a time: opening one closes the other.
  const [sheet, setSheet] = useState<'cohost' | 'questions' | null>(null);
  const coHostFormOpen = sheet === 'cohost';
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [goalDialogOpen, setGoalDialogOpen] = useState(false);
  // Read when the video connection closes, which also happens on purpose
  // when the live ends.
  const endedRef = useRef(false);
  const [viewerCount, setViewerCount] = useState(0);
  const [likesCount, setLikesCount] = useState(0);
  const [pinnedComment, setPinnedComment] = useState<PinnedCommentData | null>(
    null,
  );
  const [selectedMessage, setSelectedMessage] = useState<any | null>(null);

  // Phase 2 State
  const [liveGoal, setLiveGoal] = useState<LiveGoalData | null>(null);
  const isQnAOpen = sheet === 'questions';
  const [questions, setQuestions] = useState<LiveQuestion[]>([]);
  const [highlightedQuestion, setHighlightedQuestion] =
    useState<LiveQuestion | null>(null);

  const navigate = useNavigate();
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!hasStarted) return;
    return () => {
      // Leaving the screen ends the live, unless it was ended already.
      if (!endedRef.current) {
        api.post('/live/end').catch(() => {});
      }
    };
  }, [hasStarted]);

  // The live is only shown as ended once the server has ended it: saying so
  // while it is still on air would leave the camera broadcasting unnoticed.
  const handleEndLive = async () => {
    setIsEnding(true);
    try {
      await api.post('/live/end');
    } catch {
      toast.error(t('live.end_failed'));
      setIsEnding(false);
      return;
    }
    endedRef.current = true;
    setConfirmEndOpen(false);
    setIsEnding(false);
    setIsEnded(true);
    const socket = useSocketStore.getState().socket;
    if (socket && streamId) {
      socket.emit('live:leave', { streamId });
    }
  };

  const handleStart = async (e: React.FormEvent) => {
    e.preventDefault();
    const title = titleInput.trim() || t('live.default_title');
    setIsStarting(true);
    try {
      const res: any = await api.post('/live/start', { title });
      setToken(res.data.token);
      setStreamId(res.data.stream.id);
      setHasStarted(true);
      setStartedAt(Date.now());
    } catch {
      toast.error(t('live.start_failed'));
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

    // Viewers send every reaction, hearts included, as a reaction; a heart
    // of the host comes as a heart. Both float, and the hearts are counted.
    const showReaction = (emoji: string) => {
      if (emoji === '❤️') setLikesCount((prev) => prev + 1);
      const id = Math.random().toString(36).substring(2, 9);
      const x = Math.random() * 40 - 20;
      setHearts((prev) => [...prev, { id, x, emoji }]);
      setTimeout(() => {
        setHearts((prev) => prev.filter((h) => h.id !== id));
      }, 2000);
    };

    socket.on('live:heart_received', (data?: { reaction?: string }) => {
      showReaction(data?.reaction || '❤️');
    });

    socket.on('live:reaction_received', (data?: { reaction?: string }) => {
      showReaction(data?.reaction || '🔥');
    });

    return () => {
      socket.emit('live:leave', { streamId });
      socket.off('live:chat_message');
      socket.off('live:viewer_count_update');
      socket.off('live:comment_pinned');
      socket.off('live:comment_unpinned');
      socket.off('live:heart_received');
      socket.off('live:reaction_received');
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
    const username = coHostUsernameInput.trim().replace(/^@/, '');
    setIsInviting(true);
    try {
      let coHostUserId: string | undefined;
      try {
        const profileRes = await profileApi.getProfile(username);
        coHostUserId = profileRes.data?.user?.id;
      } catch {
        coHostUserId = undefined;
      }
      if (!coHostUserId) {
        toast.error(t('live.cohost_not_found', { username }));
        return;
      }
      await liveApi.inviteCoHost(streamId, coHostUserId);
      setCoHostUsername(username);
      setCoHostUsernameInput('');
      setSheet(null);
    } catch {
      toast.error(t('live.cohost_invite_failed'));
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
      toast.error(t('live.cohost_remove_failed'));
    }
  };

  const handleDoubleTap = (e: React.MouseEvent) => {
    if (!streamId) return;
    // Two quick presses on a control are two uses of that control.
    if (
      (e.target as HTMLElement).closest(
        'button, input, textarea, a, [role="dialog"]',
      )
    ) {
      return;
    }
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

  const handleSetGoal = (goal: { title: string; target: number }) => {
    setGoalDialogOpen(false);
    const socket = useSocketStore.getState().socket;
    if (socket && streamId) {
      socket.emit('live:set_goal', { streamId, ...goal });
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
    setSheet(null);
  };

  const handleClearHighlightQuestion = () => {
    const socket = useSocketStore.getState().socket;
    if (socket && streamId) {
      socket.emit('live:clear_question', { streamId });
    }
    setSheet(null);
  };

  if (!hasStarted || token === '') {
    return (
      <div className="flex h-dvh flex-col items-center justify-center px-4 gap-6">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="absolute left-4 top-[max(1rem,env(safe-area-inset-top,0px))] w-11 h-11 flex items-center justify-center bg-black/50 rounded-full text-white"
          aria-label={t('common.close')}
        >
          <X className="w-6 h-6" aria-hidden />
        </button>
        <h1 className="text-2xl font-semibold text-white text-center">
          {t('live.setup_title')}
        </h1>
        <form
          onSubmit={handleStart}
          className="w-full max-w-sm flex flex-col gap-4"
        >
          <label className="flex flex-col gap-2 text-left">
            <span className="text-sm text-white/70">
              {t('live.title_label')}
            </span>
            <input
              type="text"
              value={titleInput}
              onChange={(e) => setTitleInput(e.target.value)}
              placeholder={t('live.title_placeholder')}
              maxLength={100}
              className="min-h-12 rounded-2xl bg-white/8 border border-white/10 px-4 text-base text-white placeholder-white/40 outline-none focus:border-brand-primary"
            />
          </label>
          <button
            type="submit"
            disabled={isStarting}
            className={CREATE_PRIMARY}
          >
            {isStarting ? t('live.starting') : t('live.start_button')}
          </button>
        </form>
      </div>
    );
  }

  if (isEnded) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center bg-surface-base md:bg-transparent px-4 text-white">
        <div className="w-full max-w-sm bg-black/50 p-8 rounded-3xl border border-white/10 flex flex-col items-center gap-6 shadow-2xl backdrop-blur-xl">
          <div className="p-4 bg-brand-primary/20 rounded-full">
            <Heart className="w-12 h-12 text-brand-primary-text" />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-semibold mb-2">
              {t('live.ended_title')}
            </h1>
            <p className="text-white/60 text-sm">{t('live.ended_summary')}</p>
          </div>
          <div className="w-full flex gap-4 text-center mt-2">
            <div className="flex-1 bg-white/5 rounded-2xl p-4 border border-white/5">
              <span className="block text-2xl font-bold">{viewerCount}</span>
              <span className="text-xs text-white/60">{t('live.viewers')}</span>
            </div>
            <div className="flex-1 bg-white/5 rounded-2xl p-4 border border-white/5">
              <span className="block text-2xl font-bold text-brand-secondary">
                {likesCount}
              </span>
              <span className="text-xs text-white/60">{t('live.likes')}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => navigate(-1)}
            className={`w-full mt-4 ${CREATE_SECONDARY}`}
          >
            {t('live.close_summary')}
          </button>
        </div>
      </div>
    );
  }

  const serverUrl =
    import.meta.env.VITE_LIVEKIT_URL ||
    'wss://circlesfera-6sxa79qt.livekit.cloud';

  return (
    <>
      {/* A double tap anywhere sends a heart. It is not a button: it holds
          every control of the screen, and the reactions have their own. */}
      <LiveFrame
        onDoubleClick={handleDoubleTap}
        video={
          <LiveKitRoom
            video={true}
            audio={true}
            token={token}
            serverUrl={serverUrl}
            data-lk-theme="default"
            className="h-full w-full"
            onDisconnected={() => {
              // Ending the live closes the connection on purpose.
              if (endedRef.current) return;
              toast.error(t('live.connection_lost'));
              navigate(-1);
            }}
          >
            <CinematicStage isBroadcaster={true} />
            <RoomAudioRenderer />
            {/* The host's own picture and sound, down the right edge. They
                need the room, so they are drawn inside it. */}
            <div className="live-frame-host-controls absolute right-3 z-50 flex flex-col gap-2.5">
              {!coHostUsername && (
                <LiveControl
                  label={t('live.cohost_invite_button')}
                  aria-expanded={coHostFormOpen}
                  onClick={() => setSheet('cohost')}
                >
                  <UserPlus className="h-5 w-5" aria-hidden />
                </LiveControl>
              )}
              <LiveHostControls />
            </div>
          </LiveKitRoom>
        }
      >
        {/* Top band: what the broadcast is doing, and the way out. */}
        <div className="pointer-events-none absolute inset-x-3 top-(--live-top) z-50 flex items-start justify-between gap-2 [&>*]:pointer-events-auto">
          <div className="flex min-w-0 flex-col items-start gap-2">
            <LiveStatus startedAt={startedAt} viewers={viewerCount} />
            {coHostUsername && (
              <div className="live-glass flex min-w-0 items-center gap-1.5 rounded-full pl-3 text-xs text-white">
                <span className="truncate">
                  {t('live.cohost_label')} <strong>@{coHostUsername}</strong>
                </span>
                <button
                  type="button"
                  onClick={handleRemoveCoHost}
                  className="flex h-11 w-11 shrink-0 items-center justify-center text-white/80 hover:text-white"
                  aria-label={t('live.cohost_remove')}
                >
                  <UserMinus size={18} aria-hidden />
                </button>
              </div>
            )}
            <LiveGoalBar
              goal={liveGoal}
              isHost={true}
              onClick={() => setGoalDialogOpen(true)}
            />
          </div>
          <LiveControl
            label={t('live.end_stream')}
            onClick={() => setConfirmEndOpen(true)}
          >
            <X className="h-5 w-5" aria-hidden />
          </LiveControl>
        </div>

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

        {/* Floating Hearts */}
        <div className="pointer-events-none absolute bottom-24 right-6 top-0 flex w-16 flex-col-reverse items-center justify-start overflow-hidden pb-4 z-40">
          {hearts.map((heart) => (
            <div
              key={heart.id}
              className="animate-float-up absolute bottom-0 opacity-0"
              style={{ transform: `translateX(${heart.x}px)` }}
            >
              {heart.emoji === '❤️' ? (
                <Heart className="h-7 w-7 fill-brand-secondary text-brand-secondary drop-shadow-[0_0_8px_rgba(239,68,68,0.8)]" />
              ) : (
                <span className="text-2xl">{heart.emoji}</span>
              )}
            </div>
          ))}
        </div>

        {/* Bottom band: the comments and what the host writes. */}
        <div className="pointer-events-auto absolute inset-x-0 bottom-0 z-40 flex flex-col justify-end bg-linear-to-t from-black/85 via-black/40 to-transparent px-3 pt-3 pb-(--live-bottom)">
          <LivePinnedComment
            pinnedComment={pinnedComment}
            onUnpin={handleUnpinMessage}
          />

          <div className="overflow-y-auto max-h-40 mb-2 space-y-1.5 no-scrollbar relative mask-[linear-gradient(to_bottom,transparent,black_20%)] pt-6">
            {chatMessages.map((msg) => (
              // The whole row answers the tap; the bubble inside keeps its size.
              <button
                type="button"
                key={msg.id}
                onClick={() =>
                  setSelectedMessage(
                    selectedMessage?.id === msg.id ? null : msg,
                  )
                }
                aria-pressed={selectedMessage?.id === msg.id}
                className="min-h-11 flex items-center text-left max-w-[85%]"
              >
                <span
                  className={`text-white text-xs bg-black/40 border backdrop-blur-md px-2.5 py-1 rounded-2xl shadow-sm ${
                    selectedMessage?.id === msg.id
                      ? 'border-brand-primary'
                      : 'border-white/10'
                  }`}
                >
                  <span className="font-extrabold text-white">
                    {msg.user.username}:{' '}
                  </span>
                  <span className="text-white/90">{msg.message}</span>
                </span>
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
                className="flex-1 min-h-11 flex items-center justify-center gap-2 px-3 bg-white/10 hover:bg-white/20 rounded-xl text-xs font-semibold text-white transition-colors"
              >
                <Pin size={14} /> {t('live.pin')}
              </button>
              <button
                type="button"
                onClick={handleDeleteMessage}
                className="flex-1 min-h-11 flex items-center justify-center gap-2 px-3 bg-brand-secondary/20 hover:bg-brand-secondary/40 text-brand-secondary rounded-xl text-xs font-semibold transition-colors"
              >
                <Trash2 size={14} /> {t('live.delete_comment')}
              </button>
              <button
                type="button"
                onClick={() => setSelectedMessage(null)}
                className="w-11 h-11 shrink-0 flex items-center justify-center bg-white/5 hover:bg-white/10 rounded-xl text-white/60 transition-colors"
                aria-label={t('common.close')}
              >
                <X size={16} aria-hidden />
              </button>
            </div>
          )}

          <form onSubmit={handleSend} className="flex items-center gap-2">
            <LiveControl
              label={
                questions.length > 0
                  ? t('live.qna.open_with_count', { count: questions.length })
                  : t('live.qna.title')
              }
              onClick={() => setSheet('questions')}
            >
              <HelpCircle className="h-5 w-5" aria-hidden />
              {questions.length > 0 && (
                <span
                  className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-secondary px-1 text-xs font-bold"
                  aria-hidden
                >
                  {questions.length}
                </span>
              )}
            </LiveControl>
            <input
              type="text"
              aria-label={t('live.chat_placeholder')}
              placeholder={t('live.chat_placeholder')}
              value={messageInput}
              onChange={(e) => setMessageInput(e.target.value)}
              className="live-glass min-h-12 min-w-0 flex-1 rounded-full px-4 text-base text-white placeholder-white/60 outline-none focus:border-white/40"
            />
            <LiveControl
              type="submit"
              tone="brand"
              label={t('live.send_comment')}
              disabled={!messageInput.trim()}
            >
              <Send className="h-4 w-4" aria-hidden />
            </LiveControl>
          </form>
        </div>

        {/* One sheet at a time. */}
        <LiveSheet
          isOpen={coHostFormOpen && !coHostUsername}
          onClose={() => setSheet(null)}
          title={t('live.cohost_sheet_title')}
          icon={<UserPlus size={20} className="shrink-0" aria-hidden />}
        >
          <p className="mb-3 text-sm text-white/70">
            {t('live.cohost_sheet_hint')}
          </p>
          <form
            onSubmit={handleInviteCoHost}
            className="flex items-center gap-2"
          >
            <input
              type="text"
              aria-label={t('live.cohost_input_label')}
              placeholder={t('live.cohost_input_placeholder')}
              value={coHostUsernameInput}
              onChange={(e) => setCoHostUsernameInput(e.target.value)}
              autoCapitalize="none"
              autoCorrect="off"
              className="min-h-12 min-w-0 flex-1 rounded-full border border-white/15 bg-white/10 px-4 text-base text-white placeholder-white/50 outline-none focus:border-white/40"
            />
            <LiveControl
              type="submit"
              tone="brand"
              label={t('live.cohost_invite_send')}
              disabled={isInviting || !coHostUsernameInput.trim()}
            >
              <Send size={18} aria-hidden />
            </LiveControl>
          </form>
        </LiveSheet>
        <LiveQnAPanel
          isOpen={isQnAOpen}
          onClose={() => setSheet(null)}
          isHost={true}
          questions={questions}
          hasHighlight={!!highlightedQuestion}
          onHighlightQuestion={handleHighlightQuestion}
          onClearHighlight={handleClearHighlightQuestion}
        />
      </LiveFrame>

      <ConfirmModal
        isOpen={confirmEndOpen}
        onClose={() => setConfirmEndOpen(false)}
        onConfirm={handleEndLive}
        title={t('live.end_confirm_title')}
        message={t('live.end_confirm_message')}
        confirmText={t('live.end_stream')}
        cancelText={t('live.end_confirm_keep')}
        isLoading={isEnding}
      />
      <LiveGoalDialog
        isOpen={goalDialogOpen}
        onClose={() => setGoalDialogOpen(false)}
        onSave={handleSetGoal}
      />

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
    </>
  );
}
