import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useVirtualizer } from '@tanstack/react-virtual';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, Search, Users, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { chatApi, followsApi, searchApi } from '../../services';
import { useAuthStore } from '../../stores/authStore';
import type { Profile } from '../../types';
import { logger } from '../../utils/logger';
import UserAvatar from '../UserAvatar';
import { Dialog } from '../ui/Dialog';

interface NewChatModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function NewChatModal({ isOpen, onClose }: NewChatModalProps) {
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search.trim(), 300);
  const [selectedUsers, setSelectedUsers] = useState<Profile[]>([]);
  const [groupName, setGroupName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const currentUser = useAuthStore((state) => state.profile);
  const { t } = useTranslation();

  useEffect(() => {
    if (!isOpen) {
      setSearch('');
      setSelectedUsers([]);
      setGroupName('');
    }
  }, [isOpen]);

  const { data: searchResults = [], isLoading: isSearchLoading } = useQuery({
    queryKey: ['searchUsers', debouncedSearch],
    queryFn: async () => {
      if (!debouncedSearch) return [];
      const res = await searchApi.searchUsers(debouncedSearch);
      return res.data.filter((p) => p.id !== currentUser?.id);
    },
    enabled: isOpen && debouncedSearch.length >= 2,
  });

  const { data: following = [], isLoading: isFollowingLoading } = useQuery({
    queryKey: ['following', currentUser?.username],
    queryFn: async () => {
      if (!currentUser?.username) return [];
      const res = await followsApi.getFollowing(currentUser.username);
      return res.data || [];
    },
    enabled: isOpen && !debouncedSearch && !!currentUser?.username,
  });

  const handleUserToggle = (user: Profile) => {
    setSelectedUsers((prev) =>
      prev.some((u) => u.id === user.id)
        ? prev.filter((u) => u.id !== user.id)
        : [...prev, user],
    );
  };

  const handleCreateChat = async () => {
    if (selectedUsers.length === 0) return;
    setIsCreating(true);

    try {
      const participantIds = selectedUsers.map((u) => u.id);
      const res = await chatApi.createGroup({
        participantIds,
        name: selectedUsers.length > 1 ? groupName : undefined,
      });

      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      navigate(`/direct/inbox/t/${res.data.id}`);
      onClose();
    } catch (error) {
      logger.error('Failed to start chat', error);
    } finally {
      setIsCreating(false);
    }
  };

  const displayedUsers = debouncedSearch ? searchResults : following;
  const isLoading = debouncedSearch ? isSearchLoading : isFollowingLoading;

  const virtualizer = useVirtualizer({
    count: displayedUsers.length,
    getScrollElement: () => listRef.current,
    estimateSize: () => 72,
    overscan: 8,
  });

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="2xl"
      className="max-h-[90vh]"
    >
      <div className="-mx-4 -mt-4 flex flex-col h-[75vh] max-h-[720px]">
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0">
          <span className="text-sm font-semibold text-white/60">
            {t('chat.new_message')}
          </span>
          <button
            type="button"
            onClick={handleCreateChat}
            disabled={selectedUsers.length === 0 || isCreating}
            className="text-brand-primary font-semibold hover:text-brand-primary/80 disabled:opacity-50 text-sm transition-colors px-2 py-1 min-h-11"
          >
            {isCreating ? t('chat.creating') : t('chat.chat')}
          </button>
        </div>

        <div className="px-4 py-3 border-b border-white/10 shrink-0">
          <div className="flex flex-wrap gap-2 items-center min-h-11 bg-black/20 backdrop-blur-md px-4 py-2 rounded-xl border border-white/10 focus-within:border-brand-primary/50 transition-all">
            <span className="text-white/60 font-medium text-sm mr-1">
              {t('chat.to')}
            </span>

            <AnimatePresence mode="popLayout">
              {selectedUsers.map((u) => (
                <motion.button
                  type="button"
                  layout
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.8, opacity: 0 }}
                  key={u.id}
                  onClick={() => handleUserToggle(u)}
                  className="bg-brand-primary text-white px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1 hover:opacity-90 transition-opacity"
                >
                  {u.username}
                  <X size={12} aria-hidden />
                </motion.button>
              ))}
            </AnimatePresence>

            <div className="flex-1 min-w-[100px]">
              <input
                type="search"
                className="w-full bg-transparent border-none text-white placeholder-gray-500 focus:ring-0 text-sm p-0 min-h-11"
                placeholder={t('chat.search_dots')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
        </div>

        <AnimatePresence>
          {selectedUsers.length > 1 && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="px-4 py-2 border-b border-white/10 shrink-0 overflow-hidden"
            >
              <div className="flex items-center bg-black/20 backdrop-blur-md rounded-xl px-3 py-2 border border-white/10 focus-within:border-brand-primary/50 transition-all">
                <Users size={16} className="text-white/70 mr-3 shrink-0" />
                <input
                  type="text"
                  placeholder={t('chat.name_group_optional')}
                  className="w-full bg-transparent border-none p-0 text-white placeholder-gray-500 focus:ring-0 text-sm min-h-11"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div
          ref={listRef}
          className="flex-1 overflow-y-auto p-2 custom-scrollbar min-h-0"
        >
          {isLoading ? (
            <div className="flex justify-center items-center h-32 text-white/20">
              <div className="w-6 h-6 border-2 border-current border-t-transparent rounded-full animate-spin" />
            </div>
          ) : displayedUsers.length === 0 ? (
            debouncedSearch ? (
              <div className="flex flex-col items-center justify-center h-32 text-gray-500 space-y-2">
                <Search className="w-8 h-8 opacity-20" aria-hidden />
                <p className="text-sm">{t('chat.no_account_found')}</p>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-32 text-gray-500/50">
                <p className="text-xs uppercase tracking-wide font-bold">
                  {t('chat.no_following')}
                </p>
              </div>
            )
          ) : (
            <>
              {!debouncedSearch && (
                <div className="px-2 py-1 text-xs font-black text-white/40 uppercase tracking-[0.15em] sticky top-0 bg-surface-high/90 backdrop-blur-xl z-10">
                  {t('chat.suggested')}
                </div>
              )}

              <div
                className="relative w-full pb-4"
                style={{ height: `${virtualizer.getTotalSize()}px` }}
              >
                {virtualizer.getVirtualItems().map((virtualRow) => {
                  const profileUser = displayedUsers[virtualRow.index];
                  if (!profileUser) return null;
                  const isSelected = selectedUsers.some(
                    (u) => u.id === profileUser.id,
                  );

                  return (
                    <div
                      key={profileUser.id}
                      ref={virtualizer.measureElement}
                      data-index={virtualRow.index}
                      className="absolute left-0 top-0 w-full px-1"
                      style={{
                        transform: `translateY(${virtualRow.start}px)`,
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => handleUserToggle(profileUser)}
                        className="w-full flex items-center justify-between px-2 py-2 min-h-[72px] rounded-xl hover:bg-white/5 transition-all group"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <UserAvatar
                            src={profileUser.avatar || undefined}
                            thumbnailUrl={profileUser.thumbnailUrl || undefined}
                            standardUrl={profileUser.standardUrl || undefined}
                            alt={profileUser.username}
                            size="md"
                            className="w-12 h-12 shrink-0"
                          />
                          <div className="text-left min-w-0">
                            <div className="font-bold text-white text-sm truncate">
                              {profileUser.username}
                            </div>
                            <div className="text-xs text-gray-300 truncate">
                              {profileUser.fullName}
                            </div>
                          </div>
                        </div>

                        <div
                          className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${
                            isSelected
                              ? 'bg-brand-primary border-brand-primary'
                              : 'border-white/20 group-hover:border-white/50'
                          }`}
                        >
                          {isSelected && (
                            <Check
                              size={14}
                              className="text-white"
                              strokeWidth={4}
                            />
                          )}
                        </div>
                      </button>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </Dialog>
  );
}
