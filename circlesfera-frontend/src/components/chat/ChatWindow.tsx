import { useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowLeft,
  Image as ImageIcon,
  Mic,
  MoreVertical,
  Phone,
  Send,
  Smile,
  Trash2,
  Video,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { apiClient, chatApi, uploadApi } from '../../services/index';
import { useAuthStore } from '../../stores/authStore';
import { useSocketStore } from '../../stores/socketStore';
import { useCallStore } from '../../stores/useCallStore';
import type { Conversation, Message, Participant } from '../../types';
import { E2EService } from '../../utils/e2e';
import { logger } from '../../utils/logger';
import UserAvatar from '../UserAvatar';
import AudioRecorder from './AudioRecorder';
import MessageBubble from './MessageBubble';

export default function ChatWindow() {
  const { t } = useTranslation();
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const {
    socket,
    typingUsers,
    userStatuses,
    startTyping,
    stopTyping,
    markRead,
  } = useSocketStore();
  const { profile } = useAuthStore();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isTyping, setIsTyping] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [editingMessage, setEditingMessage] = useState<{ id: string, text: string } | null>(null);
  const [showMenu, setShowMenu] = useState(false);


  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const handleAudioSend = async (audioBlob: Blob) => {
    setIsRecording(false);
    setIsUploading(true);
    try {
      const file = new File([audioBlob], 'voice-message.webm', {
        type: 'audio/webm',
      });
      const formData = new FormData();
      formData.append('file', file);
      const uploadRes = await uploadApi.upload(formData);

      await apiClient.post('/chat/messages', {
        conversationId: id,
        content: '🎤 Voice Message', // Placeholder content for validation
        url: uploadRes.data.url,
        mediaType: 'audio',
      });
    } catch (err) {
      logger.error('Audio upload failed', err);
    } finally {
      setIsUploading(false);
    }
  };

  // Scroll to bottom helper
  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({
        top: scrollContainerRef.current.scrollHeight,
        behavior,
      });
    }
  }, []);

  // Initial scroll on mount (instant)
  useEffect(() => {
    if (messages.length > 0) {
      // Use a short timeout to ensure the DOM has updated
      const timer = setTimeout(() => scrollToBottom('auto'), 50);
      return () => clearTimeout(timer);
    }
  }, [messages.length, scrollToBottom]); // Only on conversation change or first load of messages

  const handleEdit = useCallback((msg: Message, decryptedText: string) => {
    setEditingMessage({ id: msg.id!, text: decryptedText });
    setReplyTo(null);
    setInput(decryptedText);
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  const handleDelete = useCallback(async (messageId: string) => {
    try {
      await chatApi.deleteMessage(messageId);
      // Optimistic update
      setMessages((prev) => prev.map((m) => m.id === messageId ? { ...m, isDeleted: true, content: '', e2eKeys: undefined } : m));
    } catch (err) {
      logger.error('Failed to delete message', err);
    }
  }, []);

  // Smooth scroll on new messages or typing
  useEffect(() => {
    if (messages.length > 0) {
      scrollToBottom('smooth');
    }
  }, [messages, scrollToBottom]);

  useEffect(() => {
    if (!id || !profile) return;

    // Fetch conversation details and messages
    apiClient
      .get<Message[]>(`/chat/conversations/${id}/messages`)
      .then((res) => {
        setMessages(res.data);
      })
      .catch((err) => logger.error('Failed to load messages', err))
      .finally(() => setIsLoading(false));

    apiClient.get<Conversation[]>('/chat/conversations').then((res) => {
      const conv = res.data.find((c: Conversation) => c.id === id);
      if (conv) {
        setConversation(conv);

        // Use the chatApi to persist the read status in the database
        chatApi
          .markAsRead(id)
          .then(() => {
            queryClient.invalidateQueries({ queryKey: ['unreadMessages'] });
          })
          .catch((err) => {
            logger.error('Failed to mark conversation as read', err);
          });

        // Try to emit socket event if possible, but the API is the source of truth
        if (!conv.isGroup && conv.participants) {
          const other = conv.participants.find(
            (p: Participant) => p.userId !== profile?.id,
          );
          if (other) {
            markRead(id, other.userId);
          }
        }
      }
    });
  }, [id, profile, markRead, queryClient]);

  useEffect(() => {
    if (!socket || !id) return;

    const handleReceiveMessage = (msg: Message) => {
      if (msg.conversationId === id) {
        setMessages((prev) => {
          // Check if we have a temp message with this ID
          const existingIdx = prev.findIndex((m) => m.tempId === msg.tempId);
          if (existingIdx !== -1) {
            // Replace temp message with real one
            const newMessages = [...prev];
            newMessages[existingIdx] = msg;
            return newMessages;
          }
          // Check if message ID already exists (double safety)
          if (prev.some((m) => m.id === msg.id)) return prev;

          return [...prev, msg];
        });

        // Persist read status in database on new message while window is open
        chatApi
          .markAsRead(id)
          .then(() => {
            queryClient.invalidateQueries({ queryKey: ['unreadMessages'] });
          })
          .catch((err) => {
            logger.error('Failed to mark conversation as read', err);
          });

        if (msg.senderId !== profile?.id) {
          markRead(id, msg.senderId);
        }
      }
    };

    const handleReaction = (data: {
      messageId: string;
      userId: string;
      reaction: string;
    }) => {
      setMessages((prev) =>
        prev.map((msg) => {
          if (msg.id === data.messageId) {
            const reactions = msg.reactions || [];
            // Check if user already reacted, if so update, else add (simplified)
            const existingIdx = reactions.findIndex(
              (r) => r.userId === data.userId,
            );
            const newReactions = [...reactions];
            if (existingIdx !== -1) {
              newReactions[existingIdx] = {
                ...newReactions[existingIdx],
                reaction: data.reaction,
              };
            } else {
              newReactions.push({
                id: Date.now().toString(),
                reaction: data.reaction,
                userId: data.userId,
              });
            }
            return { ...msg, reactions: newReactions };
          }
          return msg;
        }),
      );
    };

    const handleMessagesRead = (data: {
      conversationId: string;
      userId: string;
      readAt: string;
    }) => {
      if (data.conversationId === id) {
        setConversation((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            participants: prev.participants.map((p: Participant) =>
              p.userId === data.userId ? { ...p, lastReadAt: data.readAt } : p,
            ),
          };
        });
      }
    };

    const handleMessageEdited = (editedMsg: Message) => {
      if (editedMsg.conversationId === id) {
        setMessages((prev) => prev.map((m) => m.id === editedMsg.id ? editedMsg : m));
      }
    };

    const handleMessageDeleted = (data: { messageId: string }) => {
      setMessages((prev) => prev.map((m) => m.id === data.messageId ? { ...m, isDeleted: true, content: '', e2eKeys: undefined } : m));
    };

    socket.on('receiveMessage', handleReceiveMessage);
    socket.on('message_reaction', handleReaction);
    socket.on('messages_read', handleMessagesRead);
    socket.on('message_edited', handleMessageEdited);
    socket.on('message_deleted', handleMessageDeleted);

    return () => {
      socket.off('receiveMessage', handleReceiveMessage);
      socket.off('message_reaction', handleReaction);
      socket.off('messages_read', handleMessagesRead);
      socket.off('message_edited', handleMessageEdited);
      socket.off('message_deleted', handleMessageDeleted);
    };
  }, [socket, id, markRead, queryClient, profile?.id]);

  // Helper to get display name/avatar
  const getChatInfo = () => {
    if (!conversation || !profile)
      return {
        name: t('chat.chat'),
        username: '',
        avatar: null,
        isGroup: false,
        userId: null,
      };

    if (conversation.isGroup) {
      return {
        name: conversation.name || t('chat.group_chat'),
        username: t('chat.members', {
          count: conversation.participants.length,
        }),
        avatar: null,
        isGroup: true,
        participants: conversation.participants,
        userId: null,
      };
    }

    const myUsername = profile.username?.toLowerCase();
    const myId = profile.id;

    // Filter out me strictly by username (case-insensitive) AND ID
    // We want to find the participant that is NOT me.
    const others = conversation.participants.filter((p: Participant) => {
      const pUsername = p.user?.profile.username?.toLowerCase();
      const pId = p.userId;
      return pUsername !== myUsername && pId !== myId;
    });

    logger.log('Debug Chat Redirection:', {
      myUsername,
      myId,
      allParticipants: conversation.participants.map((p: Participant) => ({
        u: p.user?.profile.username,
        id: p.userId,
      })),
      others: others.map((p: Participant) => p.user?.profile.username),
    });

    // If others exist, take the first one.
    // If no others (e.g. self-chat), then target is me.
    const targetUser =
      others.length > 0 ? others[0].user : conversation.participants[0]?.user;

    return {
      name:
        targetUser?.profile.fullName ||
        targetUser?.profile.username ||
        t('chat.user'),
      username: targetUser?.profile.username || '',
      avatar: targetUser?.profile.avatar,
      thumbnailUrl: targetUser?.profile.thumbnailUrl,
      standardUrl: targetUser?.profile.standardUrl,
      isGroup: false,
      userId: targetUser?.id,
    };
  };

  const chatInfo = getChatInfo();

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInput(e.target.value);

    if (!socket || !id || !profile) return;

    // Only send typing indicators for 1-on-1 for now
    if (!chatInfo.isGroup && chatInfo.userId) {
      if (!isTyping) {
        setIsTyping(true);
        startTyping(id, chatInfo.userId);
      }

      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);

      typingTimeoutRef.current = setTimeout(() => {
        setIsTyping(false);
        stopTyping(id, chatInfo.userId!);
      }, 2000);
    }
  };

  const handleReply = (msg: Message) => {
    setReplyTo(msg);
    inputRef.current?.focus();
  };

  const cancelReply = () => {
    setReplyTo(null);
  };

  const sendReaction = (messageId: string, emoji: string) => {
    if (!socket || !chatInfo.userId) return;
    socket.emit('send_reaction', {
      messageId,
      recipientId: chatInfo.userId,
      reaction: emoji,
    });

    setMessages((prev) =>
      prev.map((msg) => {
        if (msg.id === messageId) {
          const reactions = msg.reactions || [];
          const myId = profile?.user?.id || profile?.id;

          // Base: All reactions NOT from me
          const baseReactions = reactions.filter((r) => r.userId !== myId);
          const myExisting = reactions.find((r) => r.userId === myId);

          const newReactions = [...baseReactions];

          // Toggle logic
          if (myExisting && myExisting.reaction === emoji) {
            // Toggle off -> Keep just the baseReactions
          } else {
            // Add or Update reaction
            newReactions.push({
              id: Date.now().toString(),
              reaction: emoji,
              userId: myId ?? '',
            });
          }

          return { ...msg, reactions: newReactions };
        }
        return msg;
      }),
    );
  };

  const confirmDelete = async (mode: 'me' | 'both') => {
    if (!id) return;
    try {
      await chatApi.deleteConversation(id, mode);
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      navigate('/direct/inbox');
    } catch (error) {
      logger.error('Failed to delete conversation', error);
      // Could show a toast here
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !id) return;

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const uploadRes = await uploadApi.upload(formData);

      await apiClient.post('/chat/messages', {
        conversationId: id,
        content: t('chat.sent_image'),
        url: uploadRes.data.url,
        mediaType: 'image',
      });
    } catch (err) {
      logger.error('Upload failed', err);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const sendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !socket || !id || !profile) return;

    const tempId =
      Date.now().toString() + Math.random().toString(36).substring(2, 9);

    const tempMsg: Message = {
      id: tempId,
      content: input, // We keep plaintext locally for immediate display
      conversationId: id,
      senderId: profile.id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      sender: { id: profile.id, profile: profile },
      replyToId: replyTo?.id,
      replyTo: replyTo
        ? {
            ...replyTo,
            sender: replyTo.sender
              ? {
                  id: replyTo.sender.id,
                  profile: replyTo.sender.profile,
                }
              : undefined,
          }
        : undefined,
      tempId,
    };
    
    if (!editingMessage) {
      setMessages((prev) => [...prev, tempMsg]);
    }

    const doSend = async () => {
      try {
        let finalContent = input;
        let e2eKeys: Record<string, string> | undefined;

        // Try to encrypt if participants have E2E keys
        const keysMap: Record<string, CryptoKey> = {};
        
        if (conversation?.participants) {
          for (const p of conversation.participants) {
            const pubKey = p.user?.e2ePublicKey;
            if (pubKey) {
              try {
                keysMap[p.userId] = await E2EService.importPublicKey(pubKey);
              } catch {
                console.warn('Invalid public key for user', p.userId);
              }
            }
          }
        }

        if (Object.keys(keysMap).length > 0) {
          // Add my own public key so I can read my own messages later (if I have one)
          const myPubB64 = localStorage.getItem('e2e_public_key');
          if (myPubB64 && !keysMap[profile.id]) {
            try {
               keysMap[profile.id] = await E2EService.importPublicKey(myPubB64);
            } catch {
              // Ignore errors fetching my own key
            }
          }

          const aesKey = await E2EService.generateSymmetricKey();
          const encrypted = await E2EService.encryptMessage(input, aesKey);
          finalContent = JSON.stringify(encrypted);

          e2eKeys = {};
          for (const [pid, pubKey] of Object.entries(keysMap)) {
            e2eKeys[pid] = await E2EService.wrapSymmetricKey(aesKey, pubKey);
          }
        }

        if (editingMessage) {
          await chatApi.editMessage(editingMessage.id, finalContent, e2eKeys);
          // Only update UI if we want to manually handle it, but websocket will update it anyway
        } else {
          await apiClient.post('/chat/messages', {
            conversationId: id,
            content: finalContent,
            replyToId: replyTo?.id,
            tempId,
            e2eKeys,
          });
        }
      } catch (err) {
        logger.error('Failed to send E2E message', err);
        // Remove temp message on error
        setMessages((prev) => prev.filter(m => m.tempId !== tempId));
      }
    };

    doSend();

    setInput('');
    setReplyTo(null);
    setEditingMessage(null);
    setIsTyping(false);
    if (!chatInfo.isGroup && chatInfo.userId) {
      stopTyping(id, chatInfo.userId);
    }
  };

  const getTypingText = () => {
    const currentUserId = profile?.userId || profile?.user?.id || profile?.id;
    if (!id || !conversation || !typingUsers[id]) return null;
    const typingIds = typingUsers[id].filter((uid) => uid !== currentUserId);
    if (typingIds.length === 0) return null;

    if (chatInfo.isGroup) {
      if (typingIds.length === 1) {
        const user = conversation.participants.find(
          (p: Participant) => p.userId === typingIds[0],
        );
        return t('chat.is_typing', { username: user?.user?.profile.username });
      }
      return t('chat.people_typing', { count: typingIds.length });
    } else {
      return (
        <div className="flex items-center gap-1.5 opacity-80 mt-0.5">
          <span className="text-[11px] text-brand-primary font-bold tracking-wider">
            {t('chat.typing')}
          </span>
          <div className="flex items-center gap-0.5 pt-1">
            <motion.div
              animate={{ y: [0, -3, 0] }}
              transition={{ repeat: Infinity, duration: 0.6, delay: 0 }}
              className="w-1 h-1 bg-brand-primary rounded-full"
            />
            <motion.div
              animate={{ y: [0, -3, 0] }}
              transition={{ repeat: Infinity, duration: 0.6, delay: 0.2 }}
              className="w-1 h-1 bg-brand-primary rounded-full"
            />
            <motion.div
              animate={{ y: [0, -3, 0] }}
              transition={{ repeat: Infinity, duration: 0.6, delay: 0.4 }}
              className="w-1 h-1 bg-brand-primary rounded-full"
            />
          </div>
        </div>
      );
    }
  };

  const getStatusText = () => {
    if (chatInfo.isGroup) {
      return t('chat.members', {
        count: conversation?.participants.length || 0,
      });
    }

    if (chatInfo.userId) {
      const socketStatus = userStatuses[chatInfo.userId];
      if (socketStatus) {
        if (socketStatus.isOnline)
          return <span className="text-green-500">{t('chat.active_now')}</span>;
        if (socketStatus.lastSeenAt) {
          const diff = Date.now() - new Date(socketStatus.lastSeenAt).getTime();
          const mins = Math.floor(diff / 60000);
          if (mins < 60) return t('chat.active_mins_ago', { mins });
          const hours = Math.floor(mins / 60);
          if (hours < 24) return t('chat.active_hours_ago', { hours });
          return t('chat.active_recently');
        }
      }
      // Fallback
      const participant = conversation?.participants.find(
        (p: Participant) => p.userId === chatInfo.userId,
      );
      if (participant?.user?.isOnline)
        return <span className="text-green-500">{t('chat.active_now')}</span>;
    }
    return null;
  };

  return (
    <div className="flex flex-col h-dvh bg-[#050505] relative overflow-hidden">
      {/* Background Accent Mesh */}
      <div className="absolute inset-0 -z-10 overflow-hidden pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[70%] h-[50%] bg-blue-500/15 blur-[120px] rounded-full mix-blend-screen" />
        <div className="absolute bottom-[-10%] right-[-20%] w-[60%] h-[60%] bg-purple-500/15 blur-[130px] rounded-full mix-blend-screen" />
      </div>

      {/* Details Header */}
      <div className="px-4 md:px-6 pt-[calc(1.2rem+env(safe-area-inset-top,0px))] pb-4 flex items-center justify-between bg-black/20 backdrop-blur-3xl border-b border-white/10 relative z-30 shrink-0 shadow-2xl w-full">
        <div className="flex items-center gap-3 md:gap-4 min-w-0 flex-1 mr-4">
          <Link
            to="/direct/inbox"
            className="md:hidden text-white/70 hover:text-white transition-all p-2 -ml-2 rounded-full hover:bg-white/10 active:scale-95 shrink-0"
          >
            <ArrowLeft size={24} strokeWidth={2} />
          </Link>
          {conversation ? (
            <button
              type="button"
              className="flex items-center gap-3 md:gap-4 cursor-pointer group min-w-0 flex-1 appearance-none bg-transparent border-none p-0 text-left"
              onClick={() =>
                !chatInfo.isGroup &&
                chatInfo.username &&
                navigate(`/${chatInfo.username}`)
              }
            >
              {chatInfo.isGroup ? (
                <div className="w-11 h-11 md:w-12 md:h-12 shrink-0 rounded-full bg-white/10 flex items-center justify-center overflow-hidden">
                  <div className="grid grid-cols-2 gap-0.5 w-full h-full">
                    {conversation.participants
                      .slice(0, 4)
                      .map((p: Participant) => (
                        <img
                          key={p.id}
                          src={
                            p.user?.profile.thumbnailUrl ||
                            p.user?.profile.avatar ||
                            '/default-avatar.png'
                          }
                          className="w-full h-full object-cover"
                          alt={p.user?.profile.username || 'User'}
                          loading="lazy"
                        />
                      ))}
                  </div>
                </div>
              ) : (
                <div className="relative shrink-0">
                  <UserAvatar
                    className="w-11 h-11 md:w-12 md:h-12 transition-all hover:opacity-90 shadow-md shadow-black/20"
                    src={chatInfo.avatar || undefined}
                    thumbnailUrl={chatInfo.thumbnailUrl || undefined}
                    standardUrl={chatInfo.standardUrl || undefined}
                    alt={chatInfo.name}
                    isOnline={
                      chatInfo.userId
                        ? userStatuses[chatInfo.userId]?.isOnline
                        : false
                    }
                  />
                </div>
              )}

              <div className="flex flex-col justify-center gap-1 min-w-0 flex-1">
                <div className="font-bold text-white leading-tight text-[16px] md:text-[18px] group-hover:text-gray-200 transition-colors tracking-tight wrap-break-word">
                  {chatInfo.name}
                </div>
                <div className="text-[12px] md:text-[13px] font-semibold flex flex-wrap items-center gap-x-1.5 gap-y-0.5 min-w-0 text-white/50">
                  {!chatInfo.isGroup && chatInfo.username && (
                    <span className="break-all hover:text-white/80 transition-colors">
                      @{chatInfo.username}
                    </span>
                  )}
                  {!chatInfo.isGroup && chatInfo.username && (
                    <span className="shrink-0 hidden xs:inline">•</span>
                  )}
                  <span className="wrap-break-word">{getStatusText()}</span>
                </div>
              </div>
            </button>
          ) : (
            <div className="flex items-center gap-4 animate-pulse min-w-0 flex-1">
              <div className="w-11 h-11 md:w-12 md:h-12 shrink-0 rounded-full bg-white/10"></div>
              <div className="space-y-2 flex-1 min-w-0">
                <div className="h-4 w-32 max-w-full bg-white/10 rounded"></div>
                <div className="h-3 w-16 bg-white/10 rounded"></div>
              </div>
            </div>
          )}
        </div>

        {/* Header Actions */}
        <div className="flex items-center gap-1 md:gap-2 text-white/70 relative shrink-0">
          {/* Call Actions */}
          {!chatInfo.isGroup && chatInfo.userId && (
            <>
              <button
                type="button"
                onClick={() => {
                  const targetUser = {
                    id: chatInfo.userId!,
                    profile: {
                      username: chatInfo.username,
                      fullName: chatInfo.name,
                      avatar: chatInfo.avatar,
                    },
                  };
                  useCallStore
                    .getState()
                    .initiateCall(chatInfo.userId!, 'audio', targetUser);
                }}
                className="hover:text-white text-white/60 transition-all p-2.5 rounded-full hover:bg-white/10 active:scale-90"
              >
                <Phone size={20} strokeWidth={2} />
              </button>
              <button
                type="button"
                onClick={() => {
                  const targetUser = {
                    id: chatInfo.userId!,
                    profile: {
                      username: chatInfo.username,
                      fullName: chatInfo.name,
                      avatar: chatInfo.avatar,
                    },
                  };
                  useCallStore
                    .getState()
                    .initiateCall(chatInfo.userId!, 'video', targetUser);
                }}
                className="hover:text-white text-white/60 transition-all p-2.5 rounded-full hover:bg-white/10 active:scale-90"
              >
                <Video size={24} strokeWidth={2} />
              </button>
            </>
          )}
          <div className="relative ml-1">
            {showMenu && (
              <button
                type="button"
                className="fixed inset-0 z-40 bg-transparent cursor-default border-none p-0 w-screen h-screen"
                onClick={() => setShowMenu(false)}
                aria-label="Cerrar menú"
              />
            )}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShowMenu(!showMenu);
              }}
              className="hover:text-white text-white/60 transition-all p-2.5 rounded-full hover:bg-white/10 active:bg-white/20 relative z-50"
            >
              <MoreVertical size={22} strokeWidth={2} />
            </button>

            <AnimatePresence>
              {showMenu && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: -10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: -10 }}
                  className="absolute right-0 top-full mt-2 w-56 bg-[#262626] border border-white/10 rounded-2xl shadow-2xl overflow-hidden z-50 backdrop-blur-3xl"
                >
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowMenu(false);
                      confirmDelete('me');
                    }}
                    className="w-full text-left px-4 py-3 text-sm text-red-500 hover:bg-red-500/10 transition-colors flex items-center gap-3 font-medium"
                  >
                    <Trash2 size={16} />
                    {t('chat.delete_for_me', { defaultValue: 'Eliminar para mí' })}
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowMenu(false);
                      confirmDelete('both');
                    }}
                    className="w-full text-left px-4 py-3 text-sm text-red-500 hover:bg-red-500/10 transition-colors flex items-center gap-3 font-medium border-t border-white/10"
                  >
                    <Trash2 size={16} />
                    {t('chat.delete_for_everyone', { defaultValue: 'Eliminar para todos' })}
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Messages Area */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto overflow-x-hidden px-6 py-4 space-y-4 custom-scrollbar relative z-0"
      >
        {isLoading && (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <div className="w-8 h-8 rounded-full border-2 border-brand-primary/30 border-t-brand-primary animate-spin" />
            <span className="text-sm font-medium text-white/50">
              {t('chat.loading_history')}
            </span>
          </div>
        )}

        {!isLoading && messages.length === 0 && !isUploading && (
          <div className="flex flex-col items-center justify-center h-full text-gray-500 opacity-50">
            <p>{t('chat.no_messages')}</p>
            <p className="text-xs">{t('chat.say_hello')}</p>
          </div>
        )}

        <div className="flex flex-col justify-end min-h-full">
          <AnimatePresence initial={false}>
            {messages.map((msg, idx) => {
              const currentUserId =
                profile?.userId || profile?.user?.id || profile?.id;
              const isMe = msg.senderId === currentUserId;
              const isSeq =
                idx > 0 && messages[idx - 1].senderId === msg.senderId;
              const showAvatar = !isMe && !isSeq;

              // Calculate isRead: find the latest read horizon from other participants
              const othersReadAt =
                conversation?.participants
                  .filter((p: Participant) => p.userId !== currentUserId)
                  .map((p: Participant) =>
                    new Date(p.lastReadAt || 0).getTime(),
                  ) || [];
              const maxReadAt =
                othersReadAt.length > 0 ? Math.max(...othersReadAt) : 0;
              const isRead = new Date(msg.createdAt).getTime() <= maxReadAt;

              return (
                <MessageBubble
                  key={msg.id || msg.tempId}
                  msg={msg}
                  isMe={isMe}
                  isSeq={isSeq}
                  showAvatar={showAvatar}
                  onReply={handleReply}
                  onReact={sendReaction}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  isRead={isRead}
                  currentUserId={currentUserId}
                />
              );
            })}
          </AnimatePresence>
          {getTypingText() && (
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
              className="flex justify-start my-2 ml-2"
            >
              <div className="bg-white/5 border border-white/10 rounded-2xl px-4 py-3 rounded-bl-sm">
                {getTypingText()}
              </div>
            </motion.div>
          )}
          <div className="h-2 shrink-0" />
        </div>

        {isUploading && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex justify-end p-2"
          >
            <div className="bg-white/10 backdrop-blur-md rounded-2xl px-4 py-2 text-xs text-white/50 animate-pulse border border-white/5">
              {t('chat.uploading_attachment')}
            </div>
          </motion.div>
        )}
      </div>

      {/* Input Area */}
      <div className="px-4 md:px-6 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] pt-3 bg-transparent relative z-30 shrink-0 w-full mt-auto">
        <AnimatePresence>
          {replyTo && !editingMessage && (
            <motion.div
              initial={{ opacity: 0, y: 10, height: 0 }}
              animate={{ opacity: 1, y: 0, height: 'auto' }}
              exit={{ opacity: 0, y: 10, height: 0 }}
              className="flex items-center justify-between bg-white/5 p-3 rounded-t-[20px] border-x border-t border-white/10 mb-[-16px] pb-5 pt-3 px-4 mx-2 backdrop-blur-md relative z-0"
            >
              <div className="flex flex-col text-sm border-l-2 border-purple-500 pl-3">
                <div className="flex items-center gap-2">
                  <span className="text-purple-400 font-semibold text-xs">
                    {t('chat.replying_to', {
                      username: replyTo.sender?.profile.username,
                    })}
                  </span>
                </div>
                <span className="text-gray-400 line-clamp-1 text-xs mt-0.5">
                  {replyTo.content || t('chat.attachment')}
                </span>
              </div>
              <button
                type="button"
                onClick={cancelReply}
                className="p-1.5 bg-black/40 hover:bg-white/10 rounded-full text-white/70 hover:text-white transition-colors border border-white/10"
              >
                <X size={14} strokeWidth={2.5} />
              </button>
            </motion.div>
          )}
          {editingMessage && (
            <motion.div
              initial={{ opacity: 0, y: 10, height: 0 }}
              animate={{ opacity: 1, y: 0, height: 'auto' }}
              exit={{ opacity: 0, y: 10, height: 0 }}
              className="flex items-center justify-between bg-blue-500/10 p-3 rounded-t-[20px] border-x border-t border-blue-500/20 mb-[-16px] pb-5 pt-3 px-4 mx-2 backdrop-blur-md relative z-0"
            >
              <div className="flex flex-col text-sm border-l-2 border-blue-500 pl-3">
                <div className="flex items-center gap-2">
                  <span className="text-blue-400 font-semibold text-xs">
                    {t('chat.editing_message', { defaultValue: 'Editando mensaje' })}
                  </span>
                </div>
                <span className="text-gray-400 line-clamp-1 text-xs mt-0.5">
                  {editingMessage.text}
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setEditingMessage(null);
                  setInput('');
                }}
                className="p-1.5 bg-black/40 hover:bg-white/10 rounded-full text-white/70 hover:text-white transition-colors border border-white/10"
              >
                <X size={14} strokeWidth={2.5} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="relative z-10">
          {isRecording ? (
            <AudioRecorder
              onSend={handleAudioSend}
              onCancel={() => setIsRecording(false)}
            />
          ) : (
            <form
              onSubmit={sendMessage}
              className={`flex items-end gap-1.5 glass-panel p-1.5 rounded-[32px] border border-white/10 shadow-2xl shadow-black/50 focus-within:border-brand-primary/50 focus-within:shadow-[0_0_20px_rgba(131,58,180,0.2)] transition-all duration-300 ${replyTo ? 'rounded-t-[10px] border-t-0' : ''}`}
            >
              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept="image/*"
                onChange={handleFileUpload}
              />

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="p-2.5 rounded-full text-white/50 hover:text-white hover:bg-white/10 transition-colors shrink-0 mb-0.5 ml-0.5"
              >
                <ImageIcon size={22} strokeWidth={1.5} />
              </button>

              <textarea
                ref={inputRef as any}
                value={input}
                onChange={(e) => {
                  handleInputChange(e as any);
                  e.target.style.height = 'auto';
                  e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    if (input.trim()) sendMessage(e as any);
                  }
                }}
                rows={1}
                className="flex-1 bg-transparent border-none py-3.5 px-2 text-white placeholder-white/40 focus:ring-0 text-[15px] resize-none overflow-hidden custom-scrollbar max-h-[120px] min-h-[44px]"
                placeholder={t('chat.type_message')}
              />

              {input.trim() || isUploading ? (
                <motion.button
                  type="submit"
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  disabled={!input.trim() && !isUploading}
                  className="p-3 rounded-full bg-linear-to-tr from-brand-primary to-brand-secondary text-white font-semibold hover:opacity-90 disabled:opacity-50 transition-colors shrink-0 shadow-lg shadow-brand-primary/30 mb-0.5 mr-0.5"
                >
                  <Send size={18} fill="currentColor" className="ml-0.5" />
                </motion.button>
              ) : (
                <div className="flex items-center gap-1 group px-1 min-w-0 shrink-0 mb-0.5 mr-0.5">
                  <button
                    type="button"
                    onClick={() => setIsRecording(true)}
                    className="p-2.5 rounded-full text-white/50 hover:text-white hover:bg-white/10 transition-colors"
                  >
                    <Mic size={22} strokeWidth={1.5} />
                  </button>
                  <button
                    type="button"
                    className="p-2.5 rounded-full text-white/50 hover:text-white hover:bg-white/10 transition-colors"
                  >
                    <Smile size={22} strokeWidth={1.5} />
                  </button>
                </div>
              )}

              <button type="submit" className="hidden" />
            </form>
          )}
        </div>
      </div>

      {/* Modal deleted, options moved directly to dropdown menu */}
    </div>
  );
}
