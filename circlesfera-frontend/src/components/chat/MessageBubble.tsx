import { motion } from 'framer-motion';
import { Reply, Smile, Trash2 } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { useStoryStore } from '../../stores/storyStore';
import type { Message } from '../../types';
import { VoicePlayer } from '../audio/VoicePlayer';
import UserAvatar from '../UserAvatar';
import AudioPlayer from './AudioPlayer';
import SharedPost from './SharedPost';

interface MessageBubbleProps {
  msg: Message;
  isMe: boolean;
  isSeq: boolean;
  showAvatar: boolean;
  onReply: (msg: Message) => void;
  onReact: (messageId: string, emoji: string) => void;
  onDelete?: (messageId: string) => void;
  onEdit?: (msg: Message, decryptedText: string) => void;
  isRead?: boolean;
  currentUserId?: string;
}

const EMOJI_OPTIONS = ['❤️', '😂', '😮', '😢', '🔥', '👍'];

export default memo(function MessageBubble({
  msg,
  isMe,
  isSeq,
  showAvatar,
  onReply,
  onReact,
  onDelete,
  onEdit,
  isRead,
  currentUserId,
}: MessageBubbleProps) {
  const { t } = useTranslation();
  const openStories = useStoryStore((state) => state.openStories);
  const timeString = msg.createdAt
    ? new Date(msg.createdAt).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      })
    : '';

  let parsedText = msg.content || '';
  const mediaUrl = msg.url;

  try {
    if (typeof parsedText === 'string' && parsedText.startsWith('{')) {
      const mediaPayload = JSON.parse(parsedText);
      if (mediaPayload.text) {
        parsedText = mediaPayload.text;
      }
    }
  } catch (_e) {
    // normal text message, not JSON
  }

  const decryptedText = parsedText;

  const isDecrypting = false;

  return (
    <motion.div
      key={msg.id || msg.tempId}
      initial={{ opacity: 0, scale: 0.95, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={`flex ${isMe ? 'justify-end' : 'justify-start'} group items-end mb-1 hover:z-50 ${!isSeq ? 'mt-8' : 'mt-3'}`}
    >
      {!isMe && (
        <div className="w-10 mr-2 shrink-0 flex justify-center">
          {showAvatar ? (
            <UserAvatar
              src={msg.sender?.profile.avatar || undefined}
              thumbnailUrl={msg.sender?.profile.thumbnailUrl}
              standardUrl={msg.sender?.profile.standardUrl}
              alt={msg.sender?.profile.username || t('chat.user')}
              className="w-8 h-8 rounded-full shadow-sm"
            />
          ) : (
            <div className="w-8" />
          )}
        </div>
      )}

      <div
        className={`flex flex-col max-w-[75%] md:max-w-[65%] ${isMe ? 'items-end' : 'items-start'}`}
      >
        {/* Reply Context */}
        {msg.replyTo && (
          <div
            className={`mb-1 text-xs text-gray-300/80 bg-white/5 border-l-2 border-purple-500 pl-3 py-1.5 pr-2 rounded-r-lg cursor-pointer hover:bg-white/10 transition-colors truncate backdrop-blur-sm self-stretch max-w-xs`}
          >
            <div className="font-semibold text-purple-400 text-xs mb-0.5">
              {t('chat.replying_to_user', {
                username:
                  msg.replyTo?.sender?.profile?.username || t('chat.user'),
              })}
            </div>
            <div className="truncate opacity-90 italic">
              {msg.replyTo?.content
                ? 'Mensaje'
                : msg.replyTo?.url
                  ? t('chat.media_attachment')
                  : t('chat.post')}
            </div>
          </div>
        )}

        <div className="relative group/msg">
          <div
            className={`px-5 py-2 text-[15px] leading-relaxed relative transition-all duration-300 ${
              isMe
                ? `bg-linear-to-br from-brand-primary to-brand-secondary text-white shadow-xl shadow-brand-primary/20 ${isSeq ? 'rounded-3xl' : 'rounded-3xl rounded-tr-sm'}`
                : `glass-panel border border-white/10 text-white shadow-xl shadow-black/40 ${isSeq ? 'rounded-3xl' : 'rounded-3xl rounded-tl-sm'}`
            } ${isSeq ? 'mt-1' : 'mt-3'}`}
          >
            {/* Story Reply Preview */}
            {msg.storyId && (
              <button
                type="button"
                onClick={() => msg.story && openStories([msg.story], 0)}
                className={`mb-3 -mx-2 -mt-1 p-2 rounded-t-[18px] bg-black/20 backdrop-blur-md cursor-pointer group/story hover:bg-black/30 transition-all border-b border-white/5 flex gap-3 items-center w-[calc(100%+1rem)] text-left appearance-none`}
              >
                <div className="w-12 h-20 bg-zinc-800 rounded-lg overflow-hidden shrink-0 border border-white/10 group-hover/story:scale-105 transition-transform duration-300 relative shadow-2xl">
                  {msg.story?.url ? (
                    msg.story.mediaType === 'video' ? (
                      <video
                        src={msg.story.standardUrl || msg.story.url}
                        className="w-full h-full object-cover"
                        muted
                      />
                    ) : (
                      <img
                        src={
                          msg.story.thumbnailUrl ||
                          msg.story.standardUrl ||
                          msg.story.url
                        }
                        alt="Story"
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    )
                  ) : (
                    <div className="w-full h-full flex items-center justify-center opacity-40">
                      <div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-linear-to-t from-black/60 to-transparent" />
                </div>
                <div className="flex flex-col gap-1 py-1">
                  {!isMe && (
                    <span className="text-xs font-bold text-white/40 uppercase tracking-wide bg-white/5 px-2 py-0.5 rounded-full w-fit">
                      {t('chat.replied_to_story')}
                    </span>
                  )}
                  <p className="text-xs text-white/60 line-clamp-2 italic pr-4">
                    {msg.story?.mediaType === 'video'
                      ? t('chat.watch_video_again')
                      : t('chat.view_original_story')}
                  </p>
                </div>
              </button>
            )}

            {/* Media Content */}
            {msg.voiceUrl ? (
              <VoicePlayer
                voiceUrl={msg.voiceUrl}
                durationSeconds={msg.voiceDuration || 0}
                waveform={msg.voiceWaveform as number[] | undefined}
              />
            ) : msg.mediaType === 'audio' && mediaUrl ? (
              <AudioPlayer src={mediaUrl} created={false} />
            ) : (
              mediaUrl && (
                <div className="mb-2 -mx-2 -mt-2 overflow-hidden rounded-t-[18px]">
                  <img
                    src={msg.thumbnailUrl || msg.standardUrl || mediaUrl}
                    srcSet={
                      msg.thumbnailUrl && msg.standardUrl
                        ? `${msg.thumbnailUrl} 300w, ${msg.standardUrl} 600w`
                        : undefined
                    }
                    sizes="(max-width: 768px) 70vw, 400px"
                    alt="Attachment"
                    className={`max-w-full object-cover transition-transform hover:scale-105 duration-300 ${
                      !msg.content ? 'rounded-b-[18px]' : ''
                    }`}
                    loading="lazy"
                  />
                </div>
              )
            )}

            {/* Shared Post Content */}
            {msg.post && (
              <div className="mb-2 -mx-1">
                <SharedPost post={msg.post} />
              </div>
            )}

            {/* Text Content */}
            {(msg.content || msg.isDeleted) && (
              <div className="relative">
                <span
                  className={`break-all whitespace-pre-wrap ${msg.isDeleted ? 'opacity-70 italic' : ''}`}
                >
                  {msg.isDeleted ? (
                    <>
                      🚫{' '}
                      {t('chat.message_deleted', {
                        defaultValue: 'Este mensaje fue eliminado',
                      })}
                    </>
                  ) : isDecrypting ? (
                    <span className="opacity-50 italic">Descifrando...</span>
                  ) : (
                    decryptedText
                  )}
                </span>
                <span className="inline-block w-16 h-4" />{' '}
                {/* Spacer for absolute timestamp */}
              </div>
            )}

            <div
              className={`absolute bottom-1 right-2.5 flex items-center gap-1 pl-2 text-xs ${isMe ? 'text-white/80' : 'text-gray-300'}`}
            >
              <span className="tabular-nums font-mono leading-none tracking-wide opacity-80 flex items-center gap-1">
                {msg.isEdited && !msg.isDeleted && (
                  <span className="text-xs lowercase">(editado)</span>
                )}
                {timeString}
              </span>
              {isMe && (
                <div
                  className="flex ml-0.5"
                  title={isRead ? 'Read' : 'Delivered'}
                >
                  {isRead ? (
                    <motion.svg
                      initial={{ scale: 0.5, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ type: 'spring', bounce: 0.5 }}
                      aria-hidden="true"
                      viewBox="0 0 24 24"
                      fill="none"
                      className="w-3.5 h-3.5 text-blue-300 drop-shadow-[0_0_2px_rgba(147,197,253,0.5)]"
                    >
                      <path
                        d="M4 12L9 17L20 6"
                        stroke="currentColor"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <path
                        d="M4 17L9 22L20 11"
                        stroke="currentColor"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="opacity-70 -translate-x-1"
                      />
                    </motion.svg>
                  ) : (
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 24 24"
                      fill="none"
                      className="w-3.5 h-3.5 opacity-60"
                    >
                      <path
                        d="M5 13L9 17L19 7"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Hover Actions - Floating */}
          <div
            className={`absolute top-1/2 -translate-y-1/2 flex items-center gap-2 opacity-0 group-hover/msg:opacity-100 transition-all duration-200 z-10 ${
              isMe
                ? 'right-[calc(100%+0.5rem)] flex-row-reverse'
                : 'left-[calc(100%+0.5rem)]'
            }`}
          >
            <div
              className={`flex bg-zinc-900/80 rounded-lg p-1 shadow-2xl border border-white/10 backdrop-blur-xl ${isMe ? 'flex-row-reverse' : ''}`}
            >
              <button
                type="button"
                onClick={() => onReply(msg)}
                className="p-1 hover:bg-white/10 rounded-full text-gray-300 hover:text-white transition-colors"
                title="Reply"
              >
                <Reply size={14} />
              </button>
              <div className="relative group/emojis">
                <button
                  type="button"
                  className="p-1 hover:bg-white/10 rounded-full text-gray-300 hover:text-white transition-colors"
                  title="Reaccionar"
                >
                  <Smile size={14} />
                </button>
                <div
                  className={`absolute bottom-full mb-0 pb-3 ${isMe ? 'right-0' : 'left-0'} hidden group-hover/emojis:flex z-100 pointer-events-auto`}
                >
                  <div className="bg-zinc-900/95 backdrop-blur-2xl p-1.5 rounded-full flex gap-1 shadow-2xl border border-white/10 ring-1 ring-white/5">
                    {EMOJI_OPTIONS.map((emoji) => {
                      const isSelected = msg.reactions?.some(
                        (r) => r.reaction === emoji && r.userId === currentUserId,
                      );
                      return (
                        <motion.button
                          type="button"
                          whileHover={{ scale: 1.35, y: -5 }}
                          whileTap={{ scale: 0.85 }}
                          key={emoji}
                          onClick={() => onReact(msg.id!, emoji)}
                          className={`p-1 rounded-full transition-all text-xl leading-none ${
                            isSelected
                              ? 'bg-blue-500/30 ring-1 ring-blue-400/50'
                              : 'hover:bg-white/10'
                          }`}
                          title={isSelected ? 'Quitar reacción' : `Reaccionar ${emoji}`}
                        >
                          {emoji}
                        </motion.button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {isMe && !msg.isDeleted && onEdit && (
                <button
                  type="button"
                  onClick={() => onEdit(msg, decryptedText)}
                  className="p-1 hover:bg-white/10 rounded-full text-gray-300 hover:text-white transition-colors"
                  title="Edit"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-label="Edit"
                  >
                    <title>Edit</title>
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                </button>
              )}
              {isMe && !msg.isDeleted && onDelete && (
                <button
                  type="button"
                  onClick={() => onDelete(msg.id!)}
                  className="p-1 hover:bg-white/10 rounded-full text-gray-300 hover:text-red-400 transition-colors"
                  title="Delete"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          </div>

          {/* Reactions Display (Grouped by emoji with smooth animations) */}
          {msg.reactions && msg.reactions.filter((r) => Boolean(r.reaction)).length > 0 && (
            <div
              className={`absolute -top-4 ${
                isMe ? '-left-3' : '-right-3'
              } flex flex-wrap gap-1 z-50 pointer-events-auto p-0.5`}
              onPointerDown={(e) => e.stopPropagation()}
              role="none"
            >
              {[
                ...new Set(
                  msg.reactions
                    .filter((r) => Boolean(r.reaction))
                    .map((r) => r.reaction),
                ),
              ].map((emoji) => {
                const count =
                  msg.reactions?.filter((r) => r.reaction === emoji).length || 0;
                const hasReacted = msg.reactions?.some(
                  (r) => r.reaction === emoji && r.userId === currentUserId,
                );

                return (
                  <motion.button
                    type="button"
                    key={emoji}
                    initial={{ scale: 0.7, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.7, opacity: 0 }}
                    whileHover={{ scale: 1.18 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={() => onReact(msg.id!, emoji)}
                    className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold backdrop-blur-xl transition-all shadow-lg ${
                      hasReacted
                        ? 'bg-blue-600/90 border-blue-400 text-white shadow-blue-500/40 ring-2 ring-blue-400/30'
                        : 'bg-zinc-900/90 border-white/20 text-white hover:bg-zinc-800'
                    } border`}
                  >
                    <span>{emoji}</span>
                    {count > 1 && <span className="opacity-90 text-[10px]">{count}</span>}
                  </motion.button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
});
