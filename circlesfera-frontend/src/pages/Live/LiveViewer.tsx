import '@livekit/components-styles';
import {
  LiveKitRoom,
  RoomAudioRenderer,
  VideoConference,
} from '@livekit/components-react';
import { Eye, Gift, Heart, Send, X } from 'lucide-react';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import CoHostInviteBanner from '../../components/live/CoHostInviteBanner';
import LiveGiftModal from '../../components/live/LiveGiftModal';
import LivePinnedComment, {
  type PinnedCommentData,
} from '../../components/live/LivePinnedComment';
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
  const navigate = useNavigate();
  const chatEndRef = useRef<HTMLDivElement>(null);

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

  if (activeToken === '') {
    return (
      <div className="flex h-screen items-center justify-center bg-black text-white font-bold">
        {t('live.connecting')}
      </div>
    );
  }

  const serverUrl = import.meta.env.VITE_LIVEKIT_URL || 'ws://localhost:7880';

  return (
    // biome-ignore lint/a11y/useSemanticElements: Double-tap on screen area
    <div
      role="button"
      tabIndex={0}
      className="flex h-screen flex-col bg-black relative select-none"
      onDoubleClick={handleDoubleTap}
      onKeyDown={(e) => e.key === 'Enter' && handleDoubleTap()}
    >
      {/* Top Header Overlay */}
      <div className="absolute top-4 left-4 right-4 z-50 flex items-center justify-between pointer-events-auto">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="p-2 bg-black/60 hover:bg-black/80 rounded-full text-white backdrop-blur-md transition-all"
        >
          <X className="w-6 h-6" />
        </button>

        {/* Live Viewer Badge */}
        <div className="flex items-center space-x-1.5 px-3 py-1.5 bg-black/60 border border-white/10 rounded-full backdrop-blur-md text-xs font-bold text-white shadow-lg">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          <Eye className="w-3.5 h-3.5 text-gray-300 ml-1" />
          <span>{viewerCount}</span>
        </div>
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
          <VideoConference />
          <RoomAudioRenderer />
        </LiveKitRoom>
      </div>

      {/* Floating Reactions Overlay */}
      <div className="pointer-events-none absolute bottom-36 right-8 top-16 flex w-20 flex-col-reverse items-center justify-start overflow-hidden pb-4 z-40">
        {reactions.map((r) => (
          <div
            key={r.id}
            className="animate-float-up absolute bottom-0 opacity-0 text-3xl drop-shadow-lg"
            style={{ transform: `translateX(${r.x}px)` }}
          >
            {r.emoji === '❤️' ? (
              <Heart className="h-8 w-8 fill-red-500 text-red-500" />
            ) : (
              <span>{r.emoji}</span>
            )}
          </div>
        ))}
      </div>

      {/* Chat & Interactivity Overlay */}
      <div className="absolute bottom-0 left-0 right-0 bg-linear-to-t from-black/90 via-black/50 to-transparent p-4 flex flex-col justify-end z-40">
        {/* Pinned Comment Banner */}
        <LivePinnedComment pinnedComment={pinnedComment} />

        {/* Live Chat Messages */}
        <div className="overflow-y-auto max-h-44 mb-3 space-y-2 no-scrollbar">
          {chatMessages.map((msg) => (
            <div
              key={msg.id}
              className="text-white text-sm bg-black/30 backdrop-blur-xs px-2.5 py-1 rounded-xl w-fit max-w-[85%]"
            >
              <span className="font-bold text-blue-300">
                {msg.user.username}:{' '}
              </span>
              <span className="text-gray-100">{msg.message}</span>
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>

        {/* Input & Quick Reactions */}
        <div className="flex flex-col gap-2">
          <form onSubmit={handleSend} className="flex gap-2 items-center">
            <input
              type="text"
              placeholder={t('live.chat_placeholder')}
              value={messageInput}
              onChange={(e) => setMessageInput(e.target.value)}
              className="flex-1 rounded-full bg-white/15 px-4 py-2 text-sm text-white placeholder-white/50 outline-none backdrop-blur-md border border-white/10 focus:border-accent-blue/50 transition-all"
            />
            <button
              type="submit"
              className="rounded-full bg-accent-blue p-2.5 text-white hover:bg-accent-blue/90 active:scale-95 transition-all shadow-lg shrink-0"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>

          {/* Quick Reaction Bar */}
          <div className="flex items-center justify-between pt-1">
            <button
              type="button"
              onClick={() => setGiftModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 h-8 rounded-full bg-brand-primary/90 hover:bg-brand-primary text-white text-xs font-bold transition-all shadow-lg"
            >
              <Gift className="w-3.5 h-3.5" />
              {t('live.send_gift_btn', 'Regalo')}
            </button>
            <div className="flex items-center justify-end space-x-1.5">
              {REACTION_EMOJIS.map((emoji) => (
                <button
                  type="button"
                  key={emoji}
                  onClick={() => sendQuickReaction(emoji)}
                  className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 active:scale-90 flex items-center justify-center text-base transition-all backdrop-blur-md border border-white/5"
                  title={t('live.send_reaction', { emoji })}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {streamId && (
        <LiveGiftModal
          isOpen={giftModalOpen}
          onClose={() => setGiftModalOpen(false)}
          streamId={streamId}
        />
      )}

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
  );
}
