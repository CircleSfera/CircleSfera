import '@livekit/components-styles';
import { LiveKitRoom, RoomAudioRenderer } from '@livekit/components-react';
import { Heart, Send, UserMinus, UserPlus, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import CinematicStage from '../../components/live/CinematicStage';
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
  const navigate = useNavigate();
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!hasStarted) return;

    return () => {
      api.post('/live/end');
    };
  }, [hasStarted]);

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

    socket.on('live:heart_received', () => {
      const id = Math.random().toString(36).substr(2, 9);
      const x = Math.random() * 40 - 20;
      setHearts((prev) => [...prev, { id, x }]);
      setTimeout(() => {
        setHearts((prev) => prev.filter((h) => h.id !== id));
      }, 2000);
    });

    return () => {
      socket.emit('live:leave', { streamId });
      socket.off('live:chat_message');
      socket.off('live:heart_received');
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
            onClick={() => navigate(-1)}
            className="p-1.5 bg-black/60 hover:bg-black/80 rounded-full text-white backdrop-blur-md transition-all shadow-md"
          >
            <X className="w-5 h-5" />
          </button>
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
        <div className="absolute bottom-0 left-0 right-0 bg-linear-to-t from-black/90 via-black/50 to-transparent p-3 flex flex-col justify-end z-40">
          <div className="overflow-y-auto max-h-40 mb-2 space-y-1.5 no-scrollbar">
            {chatMessages.map((msg) => (
              <div
                key={msg.id}
                className="text-white text-xs bg-black/40 border border-white/10 backdrop-blur-md px-2.5 py-1 rounded-full w-fit max-w-[85%] shadow-sm flex items-center gap-1"
              >
                <span className="font-extrabold text-purple-300">
                  {msg.user.username}:{' '}
                </span>
                <span className="text-neutral-100">{msg.message}</span>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>

          <form onSubmit={handleSend} className="flex gap-2 items-center">
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
