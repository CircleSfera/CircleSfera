import '@livekit/components-styles';
import {
  LiveKitRoom,
  RoomAudioRenderer,
  VideoConference,
} from '@livekit/components-react';
import { Heart, Send, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import CoHostInviteBanner from '../../components/live/CoHostInviteBanner';
import { apiClient as api } from '../../services/api';
import { useSocketStore } from '../../stores/socketStore';

export default function LiveViewer() {
  const { streamId } = useParams<{ streamId: string }>();
  const [token, setToken] = useState('');
  const [coHostToken, setCoHostToken] = useState<string | null>(null);
  const [coHostStreamId, setCoHostStreamId] = useState<string | null>(null);
  const [pendingInvite, setPendingInvite] = useState<{
    streamId: string;
    streamTitle?: string | null;
    host: { id?: string; username?: string; avatar?: string | null };
  } | null>(null);
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [messageInput, setMessageInput] = useState('');
  const [hearts, setHearts] = useState<{ id: string; x: number }[]>([]);
  const navigate = useNavigate();
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!streamId) return;

    api
      .get(`/live/join/${streamId}`)
      .then((res: any) => {
        setToken(res.data.token);
      })
      .catch(() => {
        alert('Transmisión finalizada o no encontrada.');
        navigate(-1);
      });

    const socket = useSocketStore.getState().socket;
    if (!socket) return;
    socket.emit('live:join', { streamId });

    socket.on('live:chat_message', (msg: any) => {
      setChatMessages((prev) => [...prev.slice(-49), msg]); // Keep last 50
      setTimeout(
        () => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }),
        100,
      );
    });

    socket.on('live:heart_received', () => {
      const id = Math.random().toString(36).substr(2, 9);
      const x = Math.random() * 40 - 20; // Random X offset for animation
      setHearts((prev) => [...prev, { id, x }]);
      setTimeout(() => {
        setHearts((prev) => prev.filter((h) => h.id !== id));
      }, 2000);
    });

    socket.on('live:cohost_invite', (data: any) => {
      setPendingInvite(data);
    });

    return () => {
      socket.emit('live:leave', { streamId });
      socket.off('live:chat_message');
      socket.off('live:heart_received');
      socket.off('live:cohost_invite');
    };
  }, [streamId, navigate]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageInput.trim() || !streamId) return;
    const socket = useSocketStore.getState().socket;
    if (!socket) return;
    socket.emit('live:chat', { streamId, message: messageInput });
    setMessageInput('');
  };

  const handleDoubleTap = () => {
    if (!streamId) return;
    const socket = useSocketStore.getState().socket;
    if (!socket) return;
    socket.emit('live:heart', { streamId });
  };

  // If co-host accepted: switch LiveKitRoom to publisher mode
  const activeToken = coHostToken || token;

  if (activeToken === '') {
    return (
      <div className="flex h-screen items-center justify-center">
        Conectando al directo...
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
      <div className="absolute top-4 left-4 z-50">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="p-2 bg-black/50 rounded-full text-white"
        >
          <X className="w-6 h-6" />
        </button>
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
          video={!!coHostToken} // Publish video only when co-host
          audio={!!coHostToken} // Publish audio only when co-host
          token={activeToken}
          serverUrl={serverUrl}
          data-lk-theme="default"
          className="h-full w-full"
          onDisconnected={() => navigate(-1)}
        >
          <VideoConference />
          <RoomAudioRenderer />
        </LiveKitRoom>
      </div>

      {/* Floating Hearts Overlay */}
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

      {/* Chat Overlay */}
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
