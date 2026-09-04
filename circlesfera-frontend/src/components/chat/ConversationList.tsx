import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { TFunction } from 'i18next';
import { ChevronLeft, Edit, Search } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { apiClient } from '../../services/api';
import { useAuthStore } from '../../stores/authStore';
import { useSocketStore } from '../../stores/socketStore';
import type { Conversation, Message, Participant } from '../../types';
import { getMessagePreviewText } from '../../utils/chatMessageDisplay';
import { EmptyState } from '../ErrorEmptyStates';
import { LoadingSpinner } from '../LoadingStates';
import UserAvatar from '../UserAvatar';
import NewChatModal from './NewChatModal';

export default function ConversationList() {
  const { id: activeId } = useParams();
  const queryClient = useQueryClient();
  const listRef = useRef<HTMLDivElement>(null);

  const { data: conversations = [], isLoading: loading } = useQuery({
    queryKey: ['conversations'],
    queryFn: async () => {
      const res = await apiClient.get('/chat/conversations');
      return res.data as Conversation[];
    },
  });
  const [isNewChatOpen, setIsNewChatOpen] = useState(false);
  const me = useAuthStore((state) => state.profile);
  const [searchQuery, setSearchQuery] = useState('');
  const { t } = useTranslation();

  const { socket, userStatuses } = useSocketStore();

  useEffect(() => {
    if (!socket) return;

    const handleNewMessage = (msg: Message) => {
      queryClient.setQueryData<Conversation[]>(['conversations'], (prev) => {
        if (!prev) return prev;
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
          queryClient.invalidateQueries({ queryKey: ['conversations'] });
          return prev;
        }
      });
    };

    const handleConversationDeleted = ({
      conversationId,
    }: {
      conversationId: string;
    }) => {
      queryClient.setQueryData<Conversation[]>(['conversations'], (prev) => {
        if (!prev) return prev;
        return prev.filter((c) => c.id !== conversationId);
      });
    };

    socket.on('receiveMessage', handleNewMessage);
    socket.on('conversationDeleted', handleConversationDeleted);

    return () => {
      socket.off('receiveMessage', handleNewMessage);
      socket.off('conversationDeleted', handleConversationDeleted);
    };
  }, [socket, queryClient]);

  const filteredConversations = conversations.filter((c) => {
    if (!searchQuery) return true;
    const participants = c.participants || [];
    const otherProfile = participants.find(
      (p: Participant) => p.profileId !== me?.id,
    )?.profile;
    const name =
      c.name || otherProfile?.fullName || otherProfile?.username || '';
    return name.toLowerCase().includes(searchQuery.toLowerCase());
  });

  const virtualizer = useVirtualizer({
    count: filteredConversations.length,
    getScrollElement: () => listRef.current,
    estimateSize: () => 72,
    overscan: 8,
  });

  if (loading) {
    return (
      <div className="flex flex-col h-full bg-black/95 border-r border-white/10 items-center justify-center gap-3">
        <LoadingSpinner size="md" />
        <p className="text-sm text-white/50 font-medium">{t('chat.loading')}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-transparent">
      {/* Header Area */}
      <div className="p-2.5 md:p-4 flex flex-col gap-3 md:gap-4 bg-black/80 backdrop-blur-2xl sticky top-0 z-10 border-b border-white/10">
        <div className="flex justify-between items-center">
          <Link
            to="/"
            className="w-11 h-11 -ml-2 text-white hover:bg-white/10 rounded-full transition-colors flex items-center justify-center"
          >
            <ChevronLeft size={28} />
          </Link>
          <h2 className="text-lg font-bold text-white tracking-tight flex-1 text-center">
            {me?.username || t('chat.messages')}
          </h2>
          <button
            type="button"
            onClick={() => setIsNewChatOpen(true)}
            className="w-11 h-11 -mr-2 text-white hover:bg-white/10 rounded-full transition-colors flex items-center justify-center"
          >
            <Edit size={24} />
          </button>
        </div>

        {/* Search Bar */}
        <div className="relative group">
          <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
            <Search
              size={16}
              className="text-gray-300 group-focus-within:text-white transition-colors"
            />
          </div>
          <input
            type="text"
            placeholder={t('chat.search')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-11 bg-white/10 text-sm text-white rounded-xl pl-9 pr-4 focus:bg-white/20 outline-none placeholder-gray-400 transition-all font-medium"
          />
        </div>
      </div>

      {isNewChatOpen && (
        <NewChatModal
          isOpen={isNewChatOpen}
          onClose={() => setIsNewChatOpen(false)}
        />
      )}

      <div
        ref={listRef}
        className="flex-1 overflow-y-auto custom-scrollbar p-2 min-h-0"
      >
        {conversations.length === 0 ? (
          <EmptyState
            icon="comments"
            title={t('chat.no_messages')}
            message={t('chat.start_connecting')}
            action={{
              label: t('chat.send_message'),
              onClick: () => setIsNewChatOpen(true),
            }}
          />
        ) : filteredConversations.length === 0 ? (
          <p className="text-center text-sm text-white/45 py-8">
            {t('chat.no_search_results')}
          </p>
        ) : (
          <div
            className="relative w-full"
            style={{ height: `${virtualizer.getTotalSize()}px` }}
          >
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const conv = filteredConversations[virtualRow.index];
              if (!conv) return null;

              const participants = conv.participants || [];
              const otherParticipant =
                participants.find((p: Participant) => p.profileId !== me?.id) ||
                participants[0];
              const myParticipant = participants.find(
                (p: Participant) => p.profileId === me?.id,
              );
              const otherProfile = otherParticipant?.profile;
              const status = otherParticipant
                ? userStatuses[otherParticipant.profileId]
                : undefined;
              const isOnline = status?.isOnline ?? false;
              const lastMsg = conv.messages?.[0];
              const isActive = activeId === conv.id;
              const isUnread = Boolean(
                lastMsg &&
                  lastMsg.senderId !== me?.id &&
                  (!myParticipant?.lastReadAt ||
                    new Date(lastMsg.createdAt).getTime() >
                      new Date(myParticipant.lastReadAt).getTime()),
              );

              return (
                <div
                  key={conv.id}
                  ref={virtualizer.measureElement}
                  data-index={virtualRow.index}
                  className="absolute left-0 top-0 w-full px-0"
                  style={{ transform: `translateY(${virtualRow.start}px)` }}
                >
                  <Link to={`/direct/inbox/t/${conv.id}`}>
                    <div
                      className={`group relative flex items-center min-h-[72px] py-3 px-3 rounded-lg transition-all duration-300 ${
                        isActive
                          ? 'bg-white/10 shadow-lg shadow-black/20'
                          : 'hover:bg-white/5'
                      }`}
                    >
                      {isActive && (
                        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1.5 h-8 bg-linear-to-b from-brand-secondary to-brand-primary rounded-r-full shadow-[0_0_15px_rgba(var(--brand-primary-rgb),0.5)]" />
                      )}

                      <div className="relative shrink-0">
                        <UserAvatar
                          src={otherProfile?.avatar || undefined}
                          thumbnailUrl={otherProfile?.thumbnailUrl}
                          standardUrl={otherProfile?.standardUrl}
                          alt={otherProfile?.username || 'User'}
                          size="md"
                          isOnline={isOnline}
                        />
                      </div>

                      <div className="flex-1 min-w-0 ml-3">
                        <div className="flex justify-between items-center mb-0.5">
                          <span
                            className={`truncate text-sm ${isActive || isUnread ? 'font-semibold text-white' : 'font-medium text-white/90'}`}
                          >
                            {conv.name ||
                              otherProfile?.fullName ||
                              otherProfile?.username}
                          </span>
                          {lastMsg && (
                            <span
                              className={`text-[11px] font-bold shrink-0 ml-2 ${isActive ? 'text-brand-primary drop-shadow-[0_0_5px_rgba(var(--brand-primary-rgb),0.5)]' : 'text-white/40'}`}
                            >
                              {getTimeString(lastMsg.createdAt)}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center text-xs">
                          <p
                            className={`truncate max-w-[85%] ${isActive ? 'text-white/70' : isUnread ? 'text-white font-bold' : 'text-white/45'}`}
                          >
                            {lastMsg ? (
                              <>
                                {lastMsg.senderId === me?.id && (
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
                            <div className="ml-auto w-2.5 h-2.5 bg-brand-primary rounded-full shadow-[0_0_10px_rgba(var(--brand-primary),0.8)]" />
                          )}
                        </div>
                      </div>
                    </div>
                  </Link>
                </div>
              );
            })}
          </div>
        )}
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

function renderMessageContent(msg: Message, t: TFunction) {
  const preview = getMessagePreviewText(msg, t);
  return preview;
}
