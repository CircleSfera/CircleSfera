import '@livekit/components-styles';
import { LiveKitRoom, RoomAudioRenderer } from '@livekit/components-react';
import {
  Heart,
  HelpCircle,
  Pin,
  Send,
  SwitchCamera,
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
import {
  LiveCameraPreview,
  useCameraPreview,
} from '../../components/live/LiveCameraPreview';
import LiveGoalBar, {
  type LiveGoalData,
} from '../../components/live/LiveGoalBar';
import LiveGoalDialog from '../../components/live/LiveGoalDialog';
import {
  LiveCameraMicSwitches,
  LiveCameraTurn,
} from '../../components/live/LiveHostControls';
import {
  LiveControl,
  LiveFrame,
  LiveHost,
  LiveSheet,
  LiveStatus,
  liveClock,
} from '../../components/live/LivePieces';
import LivePinnedComment, {
  type PinnedCommentData,
} from '../../components/live/LivePinnedComment';
import LiveQnAPanel, {
  type LiveQuestion,
} from '../../components/live/LiveQnAPanel';
import LiveRecordingChoice from '../../components/live/LiveRecordingChoice';
import ConfirmModal from '../../components/modals/ConfirmModal';
import { apiClient as api } from '../../services/api';
import { liveApi } from '../../services/live';
import { profileApi } from '../../services/profile.service';
import { useAuthStore } from '../../stores/authStore';
import { useSocketStore } from '../../stores/socketStore';
import { initialsAvatarUrl } from '../../utils/initialsAvatar';
import { formatCents } from '../../utils/money';

/** A neutral picture with the person's initials, for someone without one. */
const fallbackAvatar = (username: string) => initialsAvatarUrl(username);

export default function LiveBroadcaster() {
  const { t, i18n } = useTranslation();
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
  const profile = useAuthStore((state) => state.profile);
  // The host sees themself before going live; the broadcast takes the
  // camera from the preview when it starts.
  const preview = useCameraPreview();
  const [endedAfter, setEndedAfter] = useState('00:00');
  // What the summary says, counted on this screen while on air.
  const [peakViewers, setPeakViewers] = useState(0);
  const [commentsCount, setCommentsCount] = useState(0);
  const [giftsCents, setGiftsCents] = useState(0);
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
    if (startedAt) setEndedAfter(liveClock((Date.now() - startedAt) / 1000));
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
      preview.stop();
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
      setCommentsCount((count) => count + 1);
      setTimeout(
        () => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }),
        100,
      );
    });

    socket.on('live:viewer_count_update', (data: { viewerCount: number }) => {
      if (typeof data?.viewerCount === 'number') {
        setViewerCount(Math.max(0, data.viewerCount - 1)); // Broadcaster doesn't count as viewer
        setPeakViewers((peak) => Math.max(peak, data.viewerCount - 1));
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
        setGiftsCents((cents) => cents + (data.amountCents || 0));
        setLiveGoal((prev) => {
          if (!prev) return prev;
          // In this example, 1 cent = 1 unit for the goal
          return { ...prev, current: prev.current + (data.amountCents || 0) };
        });
      }
    });

    // Viewers send every reaction, hearts included, as a reaction; a heart
    // of the host comes as a heart. Both float, and the hearts are counted.
    // Each floats for two seconds; leaving the live cancels what is left.
    const floating = new Set<ReturnType<typeof setTimeout>>();
    const showReaction = (emoji: string) => {
      if (emoji === '❤️') setLikesCount((prev) => prev + 1);
      const id = Math.random().toString(36).substring(2, 9);
      const x = Math.random() * 40 - 20;
      setHearts((prev) => [...prev, { id, x, emoji }]);
      const timer = setTimeout(() => {
        floating.delete(timer);
        setHearts((prev) => prev.filter((h) => h.id !== id));
      }, 2000);
      floating.add(timer);
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
      for (const timer of floating) clearTimeout(timer);
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
      let coHostProfileId: string | undefined;
      try {
        const profileRes = await profileApi.getProfile(username);
        coHostProfileId = profileRes.data?.id;
      } catch {
        coHostProfileId = undefined;
      }
      if (!coHostProfileId) {
        toast.error(t('live.cohost_not_found', { username }));
        return;
      }
      await liveApi.inviteCoHost(streamId, coHostProfileId);
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
      <LiveFrame
        video={
          <LiveCameraPreview
            videoRef={preview.videoRef}
            state={preview.state}
            facing={preview.facing}
          />
        }
      >
        {/* Top band: what this screen is, and the way out. */}
        <div
          data-testid="live-top-band"
          className="pointer-events-none absolute inset-x-(--live-side) top-(--live-top) z-50 flex items-start justify-between gap-2 [&>*]:pointer-events-auto"
        >
          <div className="flex min-w-0 flex-col gap-1">
            <LiveHost
              username={profile?.username ?? ''}
              avatar={profile?.avatar}
            />
            <h1 className="sr-only">{t('live.setup_title')}</h1>
          </div>
          <div className="flex shrink-0 flex-col gap-2.5">
            <LiveControl label={t('common.close')} onClick={() => navigate(-1)}>
              <X className="h-5 w-5" aria-hidden />
            </LiveControl>
            <LiveControl
              label={t('live.turn_camera')}
              onClick={preview.turn}
              disabled={preview.state !== 'on'}
            >
              <SwitchCamera className="h-5 w-5" aria-hidden />
            </LiveControl>
          </div>
        </div>

        {/* Bottom band: the title, and going live. */}
        <form
          onSubmit={handleStart}
          className="pointer-events-auto absolute inset-x-0 bottom-0 z-40 flex flex-col gap-3 px-(--live-side) pb-(--live-bottom)"
        >
          <input
            type="text"
            aria-label={t('live.title_label')}
            value={titleInput}
            onChange={(e) => setTitleInput(e.target.value)}
            placeholder={t('live.title_placeholder')}
            maxLength={100}
            className="live-glass min-h-12 rounded-full px-4 text-base text-white placeholder-white/60 outline-none focus:border-white/40"
          />
          <p className="px-1 text-center text-xs text-white/70">
            {t('live.setup_hint')}
          </p>
          <button
            type="submit"
            disabled={isStarting}
            className={CREATE_PRIMARY}
          >
            {isStarting ? t('live.starting') : t('live.start_button')}
          </button>
        </form>
      </LiveFrame>
    );
  }

  if (isEnded) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center px-4 text-white">
        <div className="flex w-full max-w-sm flex-col items-center gap-6">
          <div className="text-center">
            <h1 className="mb-2 text-2xl font-semibold">
              {t('live.ended_title')}
            </h1>
            <p className="text-sm text-white/60">{t('live.ended_summary')}</p>
          </div>
          <ul className="grid w-full grid-cols-2 gap-2 text-center sm:grid-cols-3">
            {[
              [t('live.duration'), endedAfter],
              [t('live.viewers_peak'), String(peakViewers)],
              [t('live.likes'), String(likesCount)],
              [t('live.comments'), String(commentsCount)],
              [
                t('live.gifts_received'),
                formatCents(giftsCents, i18n.language),
              ],
            ].map(([label, value]) => (
              <li
                key={label}
                className="rounded-2xl border border-white/10 bg-white/5 px-2 py-4"
              >
                <span className="block text-xl font-semibold tabular-nums">
                  {value}
                </span>
                <span className="mt-1 block text-xs text-white/60">
                  {label}
                </span>
              </li>
            ))}
          </ul>
          {streamId && <LiveRecordingChoice streamId={streamId} />}
          <button
            type="button"
            onClick={() => navigate(-1)}
            className={`button-alone ${CREATE_SECONDARY}`}
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
      {/* The room holds the whole screen: the host's switches, anywhere on
          it, need the connection. It draws no box of its own. */}
      <LiveKitRoom
        video={true}
        audio={true}
        token={token}
        serverUrl={serverUrl}
        data-lk-theme="default"
        className="contents"
        onDisconnected={() => {
          // Ending the live closes the connection on purpose.
          if (endedRef.current) return;
          toast.error(t('live.connection_lost'));
          navigate(-1);
        }}
      >
        <LiveFrame
          onDoubleClick={handleDoubleTap}
          video={
            <>
              <CinematicStage isBroadcaster={true} />
              <RoomAudioRenderer />
            </>
          }
        >
          {/* Top band: whose broadcast it is and what it is doing; the way
            out on the right, with the host's own picture and sound under it. */}
          <div
            data-testid="live-top-band"
            className="pointer-events-none absolute inset-x-(--live-side) top-(--live-top) z-50 flex items-start justify-between gap-2 [&>*]:pointer-events-auto"
          >
            <div className="flex min-w-0 flex-col items-start gap-2">
              <div className="flex min-w-0 max-w-full flex-wrap items-center gap-x-2.5 gap-y-2">
                <LiveHost
                  username={profile?.username ?? ''}
                  avatar={profile?.avatar}
                />
                <LiveStatus startedAt={startedAt} viewers={viewerCount} />
              </div>
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
            <div className="flex shrink-0 flex-col gap-2.5">
              <LiveControl
                label={t('live.end_stream')}
                onClick={() => setConfirmEndOpen(true)}
              >
                <X className="h-5 w-5" aria-hidden />
              </LiveControl>
              <LiveCameraMicSwitches />
            </div>
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
          <div className="pointer-events-none absolute right-(--live-side) top-(--live-top) bottom-[calc(var(--live-bottom)+4rem)] flex w-16 flex-col-reverse items-center justify-start overflow-hidden pb-4 z-40">
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
          <div
            data-testid="live-bottom-band"
            className="pointer-events-auto absolute inset-x-0 bottom-0 z-40 flex flex-col justify-end bg-linear-to-t from-black/85 via-black/40 to-transparent px-(--live-side) pt-3 pb-(--live-bottom)"
          >
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

            {/* The field first, then what the host can do. While something
              is being written the actions give way to sending it. */}
            <form onSubmit={handleSend} className="flex items-center gap-2">
              <input
                type="text"
                aria-label={t('live.chat_placeholder')}
                placeholder={t('live.chat_placeholder')}
                value={messageInput}
                onChange={(e) => setMessageInput(e.target.value)}
                className="live-glass min-h-12 min-w-0 flex-1 rounded-full px-4 text-base text-white placeholder-white/60 outline-none focus:border-white/40"
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
                    label={
                      questions.length > 0
                        ? t('live.qna.open_with_count', {
                            count: questions.length,
                          })
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
                  {!coHostUsername && (
                    <LiveControl
                      label={t('live.cohost_invite_button')}
                      aria-expanded={coHostFormOpen}
                      onClick={() => setSheet('cohost')}
                    >
                      <UserPlus className="h-5 w-5" aria-hidden />
                    </LiveControl>
                  )}
                  <LiveCameraTurn />
                </>
              )}
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
          {/* What the host does with a comment: the same sheet as the rest. */}
          <LiveSheet
            isOpen={!!selectedMessage}
            onClose={() => setSelectedMessage(null)}
            title={selectedMessage?.user?.username ?? ''}
          >
            <p className="mb-3 text-sm text-white/80 wrap-break-word">
              {selectedMessage?.message}
            </p>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={handlePinMessage}
                className="flex min-h-12 items-center gap-3 rounded-2xl bg-white/10 px-4 text-sm font-semibold text-white hover:bg-white/15"
              >
                <Pin size={18} aria-hidden /> {t('live.pin')}
              </button>
              <button
                type="button"
                onClick={handleDeleteMessage}
                className="flex min-h-12 items-center gap-3 rounded-2xl bg-white/10 px-4 text-sm font-semibold text-red-300 hover:bg-white/15"
              >
                <Trash2 size={18} aria-hidden /> {t('live.delete_comment')}
              </button>
            </div>
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
          <LiveGoalDialog
            isOpen={goalDialogOpen}
            onClose={() => setGoalDialogOpen(false)}
            onSave={handleSetGoal}
          />
        </LiveFrame>
      </LiveKitRoom>

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
