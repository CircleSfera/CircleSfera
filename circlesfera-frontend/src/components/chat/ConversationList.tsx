import { AnimatePresence, motion } from 'framer-motion';
import { ChevronLeft, Edit, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { apiClient } from '../../services/api';
import { useAuthStore } from '../../stores/authStore';
import { useSocketStore } from '../../stores/socketStore';
import type { Conversation, Message, Participant } from '../../types';
import { logger } from '../../utils/logger';
import UserAvatar from '../UserAvatar';
import NewChatModal from './NewChatModal';

export default function ConversationList() {
  const { id: activeId } = useParams();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [isNewChatOpen, setIsNewChatOpen] = useState(false);
  const { profile: me } = useAuthStore();
  const [searchQuery, setSearchQuery] = useState('');
  const { t } = useTranslation();

  const { socket, userStatuses } = useSocketStore();

  useEffect(() => {
    apiClient
      .get('/chat/conversations')
      .then((res) => setConversations(res.data))
      .catch((err) => logger.error(err))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!socket) return;

    const handleNewMessage = (msg: Message) => {
      setConversations((prev) => {
        const existingIdx = prev.findIndex((c) => c.id === msg.conversationId);
        if (existingIdx !== -1) {
          // Move to top and update message
          const updated = [...prev];
          const [conv] = updated.splice(existingIdx, 1);

          // Check for duplication/tempId
          const processedMessages = (conv.messages as Message[]) || [];
          // If we have a temp message with this ID, replace it
          const tempIdx = processedMessages.findIndex(
            (m) => m.tempId === msg.tempId,
          );
          if (tempIdx !== -1) {
            processedMessages[tempIdx] = msg;
          } else if (!processedMessages.some((m) => m.id === msg.id)) {
            processedMessages.unshift(msg);
          }

          conv.messages = processedMessages;
          return [conv, ...updated];
        } else {
          // New conversation - fetch to get full details including participants
          apiClient
            .get('/chat/conversations')
            .then((res) => setConversations(res.data));
          return prev;
        }
      });
    };

    const handleConversationDeleted = ({
      conversationId,
    }: {
      conversationId: string;
    }) => {
      setConversations((prev) => prev.filter((c) => c.id !== conversationId));
    };

    socket.on('receiveMessage', handleNewMessage);
    socket.on('conversationDeleted', handleConversationDeleted);

    return () => {
      socket.off('receiveMessage', handleNewMessage);
      socket.off('conversationDeleted', handleConversationDeleted);
    };
  }, [socket]);

  const filteredConversations = conversations.filter((c) => {
    if (!searchQuery) return true;
    const participants = c.participants || [];
    const other = participants.find(
      (p: Participant) => p.userId !== me?.userId,
    )?.user;
    const name =
      c.name || other?.profile.fullName || other?.profile.username || '';
    return name.toLowerCase().includes(searchQuery.toLowerCase());
  });

  if (loading) {
    return (
      <div className="flex flex-col h-full bg-black/95 border-r border-white/10 items-center justify-center space-y-4">
        <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
        <p className="text-sm text-gray-500 font-medium">{t('chat.loading')}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-transparent">
      {/* Header Area */}
      <div className="p-4 flex flex-col gap-4 bg-black/80 backdrop-blur-2xl sticky top-0 z-10 border-b border-white/10">
        <div className="flex justify-between items-center">
          <Link
            to="/"
            className="p-2 -ml-2 text-white hover:bg-white/10 rounded-full transition-colors"
          >
            <ChevronLeft size={28} />
          </Link>
          <h2 className="text-lg font-bold text-white tracking-tight flex-1 text-center">
            {me?.username || t('chat.messages')}
          </h2>
          <button
            type="button"
            onClick={() => setIsNewChatOpen(true)}
            className="p-2 -mr-2 text-white hover:bg-white/10 rounded-full transition-colors"
          >
            <Edit size={24} />
          </button>
        </div>

        {/* Search Bar */}
        <div className="relative group">
          <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
            <Search
              size={16}
              className="text-gray-400 group-focus-within:text-white transition-colors"
            />
          </div>
          <input
            type="text"
            placeholder={t('chat.search')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-white/10 text-sm text-white rounded-xl py-2 pl-9 pr-4 focus:bg-white/20 outline-none placeholder-gray-400 transition-all font-medium"
          />
        </div>
      </div>

      {isNewChatOpen && (
        <NewChatModal onClose={() => setIsNewChatOpen(false)} />
      )}

      <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
        <AnimatePresence initial={false}>
          {conversations.length === 0 ? (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center justify-center h-64 text-center p-8 space-y-4"
            >
              <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center transform rotate-12 rings-1 ring-white/10">
                <Edit className="w-7 h-7 text-white/40" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-white">
                  {t('chat.no_messages')}
                </h3>
                <p className="text-xs text-gray-500 max-w-[180px] mx-auto mt-1 leading-relaxed">
                  {t('chat.start_connecting')}
                </p>
              </div>
              <motion.button
                type="button"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setIsNewChatOpen(true)}
                className="px-5 py-2 bg-white text-black text-sm font-semibold rounded-full hover:bg-gray-100 transition-colors"
              >
                {t('chat.send_message')}
              </motion.button>
            </motion.div>
          ) : (
            filteredConversations.map((conv) => {
              const participants = conv.participants || [];
              const otherParticipant =
                participants.find(
                  (p: Participant) => p.userId !== me?.userId,
                ) || participants[0];
              const myParticipant = participants.find(
                (p: Participant) => p.userId === me?.userId,
              );
              const other = otherParticipant?.user;

              const lastMsg = conv.messages[0];
              const isActive = activeId === conv.id;
              const status = other ? userStatuses[other.id] : undefined;
              const isOnline = status
                ? status.isOnline
                : (other?.isOnline ?? false);

              // Check if last message is unread using lastReadAt timestamp
              const isUnread = Boolean(
                lastMsg &&
                  lastMsg.senderId !== me?.userId &&
                  (!myParticipant?.lastReadAt ||
                    new Date(lastMsg.createdAt).getTime() >
                      new Date(myParticipant.lastReadAt).getTime()),
              );

              return (
                <Link to={`/direct/inbox/t/${conv.id}`} key={conv.id}>
                  <motion.div
                    layout
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className={`group relative flex items-center p-3 rounded-lg transition-all duration-300 ${
                      isActive
                        ? 'bg-white/10 shadow-lg shadow-black/20'
                        : 'hover:bg-white/5 hover:scale-[1.02]'
                    }`}
                  >
                    {/* Active Indicator Bar */}
                    {isActive && (
                      <motion.div
                        layoutId="active-bar"
                        className="absolute left-0 top-1/2 -translate-y-1/2 w-1.5 h-8 bg-linear-to-b from-brand-secondary to-brand-primary rounded-r-full shadow-[0_0_15px_rgba(131,58,180,0.5)]"
                      />
                    )}

                    <div className="relative shrink-0">
                      <UserAvatar
                        src={other?.profile?.avatar || undefined}
                        thumbnailUrl={other?.profile?.thumbnailUrl}
                        standardUrl={other?.profile?.standardUrl}
                        alt={other?.profile?.username || 'User'}
                        className={`w-12 h-12 transition-all hover:opacity-90`}
                        isOnline={isOnline}
                      />
                    </div>

                    <div className="flex-1 min-w-0 ml-3.5">
                      <div className="flex justify-between items-center mb-0.5">
                        <span
                          className={`truncate text-xs ${isActive || isUnread ? 'font-semibold text-white' : 'font-medium text-white/90'}`}
                        >
                          {conv.name ||
                            other?.profile?.fullName ||
                            other?.profile?.username}
                        </span>
                        {lastMsg && (
                          <span
                            className={`text-xs font-bold ${isActive ? 'text-brand-primary drop-shadow-[0_0_5px_rgba(131,58,180,0.5)]' : 'text-gray-500'}`}
                          >
                            {getTimeString(lastMsg.createdAt)}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center text-xs">
                        <p
                          className={`truncate max-w-[85%] ${isActive ? 'text-white/70' : isUnread ? 'text-white font-bold' : 'text-gray-500'}`}
                        >
                          {lastMsg ? (
                            <>
                              {lastMsg.senderId === me?.userId && (
                                <span className="mr-1 opacity-70">
                                  {t('chat.you')}
                                </span>
                              )}
                              {renderMessageContent(lastMsg, t)}
                            </>
                          ) : (
                            <span className="italic opacity-50">
                              {t('chat.draft')}
                            </span>
                          )}
                          {!lastMsg?.content &&
                            lastMsg?.url &&
                            t('chat.media_attachment')}
                          {!lastMsg?.content &&
                            !lastMsg?.url &&
                            t('chat.started_chat')}
                        </p>
                        {isUnread && !isActive && (
                          <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            className="ml-auto w-2.5 h-2.5 bg-brand-primary rounded-full shadow-[0_0_10px_rgba(var(--brand-primary),0.8)]"
                          />
                        )}
                      </div>
                    </div>
                  </motion.div>
                </Link>
              );
            })
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function getTimeString(dateStr: string | Date) {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();

  if (diff < 86400000 && now.getDate() === date.getDate()) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  if (diff < 604800000) {
    return date.toLocaleDateString([], { weekday: 'short' });
  }
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function renderMessageContent(msg: Message, t: any) {
  if (msg.mediaType === 'audio') return t('chat.sent_voice');
  if (msg.mediaType === 'image') return t('chat.sent_image');
  if (msg.url) return t('chat.sent_attachment');
  return msg.content;
}
