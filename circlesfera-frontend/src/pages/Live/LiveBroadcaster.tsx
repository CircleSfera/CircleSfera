import '@livekit/components-styles';
import {
  LiveKitRoom,
  RoomAudioRenderer,
  VideoConference,
} from '@livekit/components-react';
import { Heart, Send, UserMinus, UserPlus, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiClient as api } from '../../services/api';
import { liveApi } from '../../services/live';
import { useSocketStore } from '../../stores/socketStore';

export default function LiveBroadcaster() {
  const [token, setToken] = useState('');
  const [streamId, setStreamId] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [messageInput, setMessageInput] = useState('');
  const [hearts, setHearts] = useState<{ id: string; x: number }[]>([]);
  const [coHostUsernameInput, setCoHostUsernameInput] = useState('');
  const [coHostUsername, setCoHostUsername] = useState<string | null>(null);
  const [isInviting, setIsInviting] = useState(false);
  const navigate = useNavigate();
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.post('/live/start', { title: 'My Live Stream' }).then((res: any) => {
      setToken(res.data.token);
      setStreamId(res.data.stream.id);
    });

    return () => {
      api.post('/live/end');
    };
  }, []);

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

  if (token === '') {
    return (
      <div className="flex h-screen items-center justify-center">
        Iniciando directo...
      </div>
    );
  }

  const serverUrl = import.meta.env.VITE_LIVEKIT_URL || 'ws://localhost:7880';

  return (
    // biome-ignore lint/a11y/useSemanticElements: Double-tap on screen area
    <div
      role="button"
      tabIndex={0}
      className="flex h-screen flex-col bg-black relative"
      onDoubleClick={handleDoubleTap}
      onKeyDown={(e) => e.key === 'Enter' && handleDoubleTap()}
    >
      {/* Top controls */}
      <div className="absolute top-4 left-4 z-50 flex items-center gap-2">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="p-2 bg-black/50 rounded-full text-white"
        >
          <X className="w-6 h-6" />
        </button>
      </div>

      {/* Co-Host panel — top right */}
      <div className="absolute top-4 right-4 z-50 flex flex-col items-end gap-2">
        {coHostUsername ? (
          // Co-host active indicator
          <div className="flex items-center gap-2 bg-purple-700/80 backdrop-blur-sm px-3 py-1.5 rounded-full text-white text-sm">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-400" />
            </span>
            <span>
              Co-host: <strong>@{coHostUsername}</strong>
            </span>
            <button
              type="button"
              onClick={handleRemoveCoHost}
              className="ml-1 text-red-300 hover:text-red-100 transition-colors"
              title="Expulsar co-anfitrión"
            >
              <UserMinus size={14} />
            </button>
          </div>
        ) : (
          // Invite form
          <form
            onSubmit={handleInviteCoHost}
            className="flex items-center gap-1.5 bg-black/60 backdrop-blur-sm border border-white/20 rounded-full px-3 py-1.5"
          >
            <UserPlus size={14} className="text-purple-300 shrink-0" />
            <input
              type="text"
              placeholder="@usuario co-host"
              value={coHostUsernameInput}
              onChange={(e) => setCoHostUsernameInput(e.target.value)}
              className="bg-transparent text-white text-xs placeholder-white/40 outline-none w-28"
            />
            <button
              type="submit"
              disabled={isInviting || !coHostUsernameInput.trim()}
              className="text-purple-300 hover:text-purple-100 transition-colors disabled:opacity-40"
            >
              <Send size={13} />
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
          <VideoConference />
          <RoomAudioRenderer />
        </LiveKitRoom>
      </div>

      <div className="pointer-events-none absolute bottom-32 right-8 top-0 flex w-16 flex-col-reverse items-center justify-start overflow-hidden pb-4">
        {hearts.map((heart) => (
          <div
            key={heart.id}
            className="animate-float-up absolute bottom-0 opacity-0"
            style={{ transform: `translateX(${heart.x}px)` }}
          >
            <Heart className="h-8 w-8 fill-red-500 text-red-500" />
          </div>
        ))}
      </div>

      <div className="absolute bottom-0 left-0 right-0 h-64 bg-linear-to-t from-black/80 to-transparent p-4 flex flex-col justify-end z-40">
        <div className="overflow-y-auto max-h-48 mb-2 space-y-2 no-scrollbar">
          {chatMessages.map((msg) => (
            <div key={msg.id} className="text-white text-sm">
              <span className="font-bold opacity-80">
                {msg.user.username}:{' '}
              </span>
              <span>{msg.message}</span>
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>

        <form onSubmit={handleSend} className="flex gap-2 items-center">
          <input
            type="text"
            placeholder="Escribe un comentario..."
            value={messageInput}
            onChange={(e) => setMessageInput(e.target.value)}
            className="flex-1 rounded-full bg-white/20 px-4 py-2 text-sm text-white placeholder-white/50 outline-none backdrop-blur-md"
          />
          <button
            type="submit"
            className="rounded-full bg-brand-primary p-2 text-white"
          >
            <Send className="h-5 w-5" />
          </button>
        </form>
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
