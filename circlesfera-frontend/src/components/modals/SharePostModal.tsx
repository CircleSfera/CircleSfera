import { useMutation, useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Check, Search, Send } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { chatApi } from '../../services';
import type { Conversation, Participant, Post } from '../../types';
import { logger } from '../../utils/logger';

interface SharePostModalProps {
  isOpen: boolean;
  onClose: () => void;
  post: Post;
}

export default function SharePostModal({
  isOpen,
  onClose,
  post,
}: SharePostModalProps) {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const { data: conversationsData, isLoading } = useQuery({
    queryKey: ['conversations'],
    queryFn: () => chatApi.getConversations(),
  });

  const shareMutation = useMutation({
    mutationFn: async ({
      conversationId,
      recipientId,
    }: {
      conversationId?: string;
      recipientId?: string;
    }) => {
      return chatApi.sendMessage({
        conversationId,
        recipientId,
        content: t('modals.share.shared_post', {
          preview: post.caption?.substring(0, 30) || 'Post',
        }),
        postId: post.id,
      });
    },
    onSuccess: () => {
      // Handled per selection
    },
  });

  if (!isOpen) return null;

  const conversations = conversationsData?.data || [];
  const filteredConversations = conversations.filter((c) => {
    if (c.isGroup) return c.name?.toLowerCase().includes(search.toLowerCase());
    const otherParticipant = c.participants.find(
      (p: Participant) => p.userId !== post.userId,
    );
    return otherParticipant?.user.profile.username
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
    <div className="fixed inset-0 z-100 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-300">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="modal-glass w-full max-w-md rounded-[32px] overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-4 duration-300 ease-out"
      >
        {/* Header with brand-vibrant accent line */}
        <div className="relative pt-8 pb-4 px-6">
          <div className="absolute top-0 left-0 right-0 h-1 bg-linear-to-r from-brand-primary via-brand-secondary to-brand-accent opacity-80" />
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-bold text-white tracking-tight">
              {t('modals.share.share_to')}
            </h3>
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-gray-500 hover:text-white transition-colors rounded-full hover:bg-white/5"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="p-4">
          <div className="relative mb-4">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"
              size={18}
            />
            <input
              type="text"
              placeholder={t('modals.share.search_conversations')}
              className="w-full bg-white/5 border border-white/10 rounded-xl py-2 pl-10 pr-4 outline-none focus:border-brand-primary/50"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="max-h-[60vh] overflow-y-auto space-y-2 custom-scrollbar">
            {isLoading ? (
              <div className="flex justify-center p-8">
                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-brand-primary"></div>
              </div>
            ) : filteredConversations.length > 0 ? (
              filteredConversations.map((c) => {
                const otherParticipant = !c.isGroup
                  ? c.participants.find(
                      (p: Participant) => p.userId !== post.userId,
                    )
                  : null;
                const name = c.isGroup
                  ? c.name
                  : otherParticipant?.user.profile.username;
                const avatar = !c.isGroup
                  ? otherParticipant?.user.profile.avatar
                  : null;
                const isSent = selectedIds.includes(c.id);

                return (
                  <div
                    key={c.id}
                    className="flex items-center justify-between p-2 hover:bg-white/5 rounded-xl transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-zinc-800 border border-white/10 overflow-hidden">
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
                      <span className="font-medium text-sm">{name}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleShare(c)}
                      disabled={isSent}
                      className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                        isSent
                          ? 'bg-zinc-700 text-gray-400 opacity-50'
                          : 'bg-brand-primary hover:bg-brand-primary/80 text-white'
                      }`}
                    >
                      {isSent ? (
                        <Check size={16} className="inline mr-1" />
                      ) : (
                        <Send size={16} className="inline mr-1" />
                      )}
                      {isSent ? t('modals.share.sent') : t('modals.share.send')}
                    </button>
                  </div>
                );
              })
            ) : (
              <div className="text-center py-8 text-gray-500 text-sm">
                {t('modals.share.no_conversations')}
              </div>
            )}
          </div>
        </div>

        <div className="p-4 bg-zinc-800/50 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2 bg-white/10 hover:bg-white/20 rounded-xl text-sm font-semibold transition-colors"
          >
            {t('modals.share.done')}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
