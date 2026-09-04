import { useMutation, useQuery } from '@tanstack/react-query';
import { Check, Search, Send } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { chatApi } from '../../services';
import type { Conversation, Participant, Post } from '../../types';
import { sanitizeUrl } from '../../utils/apiUtils';
import { logger } from '../../utils/logger';
import FrameBottomSheet from '../frames/FrameBottomSheet';
import { Button } from '../ui';
import { Dialog } from '../ui/Dialog';

interface SharePostModalProps {
  isOpen: boolean;
  onClose: () => void;
  post: Post;
  presentation?: 'default' | 'frame';
}

function isVideoMediaUrl(url: string): boolean {
  return /\.(mp4|mov|webm|m4v|mkv|m3u8)(\?|#|$)/i.test(url);
}

function getSharePreviewMedia(post: Post): {
  kind: 'image' | 'video' | 'avatar';
  url?: string;
} {
  const media = post.media?.[0];

  if (media?.thumbnailUrl) {
    return { kind: 'image', url: sanitizeUrl(media.thumbnailUrl) };
  }

  const candidate = media?.standardUrl || media?.url;
  if (candidate) {
    const sanitized = sanitizeUrl(candidate);
    if (sanitized && isVideoMediaUrl(candidate)) {
      return { kind: 'video', url: sanitized };
    }
    if (sanitized) {
      return { kind: 'image', url: sanitized };
    }
  }

  const avatar = post.profile?.avatar;
  return avatar
    ? { kind: 'avatar', url: sanitizeUrl(avatar) }
    : { kind: 'avatar' };
}

function SharePostPreview({ post }: { post: Post }) {
  const preview = getSharePreviewMedia(post);

  return (
    <div className="flex items-center gap-3 px-4 py-2 border-b border-white/10 bg-white/5 shrink-0">
      <div className="w-10 h-10 rounded-lg overflow-hidden bg-black/40 border border-white/10 shrink-0">
        {preview.kind === 'video' && preview.url ? (
          <video
            src={preview.url}
            muted
            playsInline
            preload="metadata"
            className="w-full h-full object-cover"
          />
        ) : preview.url ? (
          <img
            src={preview.url}
            alt=""
            className="w-full h-full object-cover"
          />
        ) : null}
      </div>
      <p className="text-xs text-white/70 line-clamp-2 min-w-0 flex-1">
        {post.caption || post.profile?.username}
      </p>
    </div>
  );
}

function SharePostBody({ post, compact }: { post: Post; compact?: boolean }) {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const { data: conversationsData, isLoading } = useQuery({
    queryKey: ['conversations'],
    queryFn: () => chatApi.getConversations(),
  });

  const shareMutation = useMutation({
    mutationFn: async ({ conversationId }: { conversationId: string }) => {
      return chatApi.sendMessage({
        conversationId,
        content: t('chat.shared_post', 'Shared a post'),
        postId: post.id,
      });
    },
  });

  const conversations = conversationsData?.data || [];
  const filteredConversations = conversations.filter((c) => {
    if (c.isGroup) return c.name?.toLowerCase().includes(search.toLowerCase());
    const otherParticipant = c.participants.find(
      (p: Participant) => p.profileId !== post.profileId,
    );
    return otherParticipant?.profile.username
      .toLowerCase()
      .includes(search.toLowerCase());
  });

  const handleShare = async (c: Conversation) => {
    if (selectedIds.includes(c.id)) return;

    setSelectedIds((prev) => [...prev, c.id]);

    try {
      await shareMutation.mutateAsync({ conversationId: c.id });
    } catch (err) {
      logger.error('Failed to share post', err);
      setSelectedIds((prev) => prev.filter((id) => id !== c.id));
    }
  };

  return (
    <>
      {compact && <SharePostPreview post={post} />}
      <div className={`shrink-0 ${compact ? 'px-3 pt-2 pb-1' : 'pb-3'}`}>
        <div className="relative">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"
            size={18}
            aria-hidden
          />
          <input
            type="search"
            placeholder={t('modals.share.search_conversations')}
            className={`w-full bg-white/5 border border-white/10 rounded-xl outline-none focus:border-brand-primary/50 text-white text-sm ${
              compact ? 'h-11 pl-10 pr-3' : 'min-h-11 py-2 pl-10 pr-4'
            }`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div
        className={`flex-1 min-h-0 overflow-y-auto custom-scrollbar ${
          compact ? 'px-2 pb-2 space-y-0.5' : 'space-y-2 max-h-[55vh]'
        }`}
      >
        {isLoading ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-brand-primary" />
          </div>
        ) : filteredConversations.length > 0 ? (
          filteredConversations.map((c) => {
            const otherParticipant = !c.isGroup
              ? c.participants.find(
                  (p: Participant) => p.profileId !== post.profileId,
                )
              : null;
            const name = c.isGroup
              ? c.name
              : otherParticipant?.profile.username;
            const avatar = !c.isGroup ? otherParticipant?.profile.avatar : null;
            const isSent = selectedIds.includes(c.id);

            return (
              <div
                key={c.id}
                className={`flex items-center justify-between gap-2 rounded-xl transition-colors ${
                  compact
                    ? 'px-2 py-1.5 hover:bg-white/5'
                    : 'p-2 hover:bg-white/5'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <div className="w-10 h-10 rounded-full bg-zinc-800 border border-white/10 overflow-hidden shrink-0">
                    {avatar ? (
                      <img
                        src={avatar}
                        alt={name || 'User'}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-xs font-bold text-gray-500">
                        {name?.substring(0, 2).toUpperCase()}
                      </div>
                    )}
                  </div>
                  <span className="font-medium text-sm text-white truncate">
                    {name}
                  </span>
                </div>
                <Button
                  onClick={() => handleShare(c)}
                  disabled={isSent}
                  variant={isSent ? 'secondary' : 'primary'}
                  size="icon"
                  className={`shrink-0 w-11 h-11 rounded-full ${
                    isSent ? 'opacity-50' : ''
                  }`}
                  aria-label={
                    isSent ? t('modals.share.sent') : t('modals.share.send')
                  }
                >
                  {isSent ? <Check size={16} /> : <Send size={16} />}
                </Button>
              </div>
            );
          })
        ) : (
          <div className="text-center py-8 text-gray-500 text-sm">
            {t('modals.share.no_conversations')}
          </div>
        )}
      </div>
    </>
  );
}

export default function SharePostModal({
  isOpen,
  onClose,
  post,
  presentation = 'default',
}: SharePostModalProps) {
  const { t } = useTranslation();
  const isFrame = presentation === 'frame';

  if (isFrame) {
    if (!isOpen) return null;
    return (
      <FrameBottomSheet
        isOpen
        onClose={onClose}
        title={t('frames.share_frame', 'Share frame')}
        maxHeightClass="max-h-[58%]"
      >
        <SharePostBody post={post} compact />
      </FrameBottomSheet>
    );
  }

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="md"
      title={t('modals.share.share_to')}
      className="max-h-[90vh]"
    >
      <div className="-mx-4 -mb-4 flex flex-col">
        <div className="px-4 pb-4 flex flex-col min-h-0">
          <SharePostBody post={post} />
        </div>
        <div className="px-4 py-3 border-t border-white/10 bg-black/20 flex justify-end shrink-0">
          <Button
            onClick={onClose}
            variant="secondary"
            className="min-h-11 px-6 font-semibold"
          >
            {t('modals.share.done')}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
