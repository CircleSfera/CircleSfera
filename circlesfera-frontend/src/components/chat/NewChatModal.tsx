import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, Search, Users, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { apiClient, chatApi, followsApi } from '../../services';
import { useAuthStore } from '../../stores/authStore';
import type { Profile } from '../../types';
import { logger } from '../../utils/logger';
import UserAvatar from '../UserAvatar';

interface NewChatModalProps {
  onClose: () => void;
}

export default function NewChatModal({ onClose }: NewChatModalProps) {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedUsers, setSelectedUsers] = useState<Profile[]>([]);
  const [groupName, setGroupName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const navigate = useNavigate();
  const { profile: currentUser } = useAuthStore();
  const { t } = useTranslation();

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Search users
  const { data: searchResults, isLoading: isSearchLoading } = useQuery({
    queryKey: ['searchUsers', debouncedSearch],
    queryFn: async () => {
      if (!debouncedSearch) return [];
      const res = await apiClient.get<Profile[]>(
        `/search/users?q=${debouncedSearch}`,
      );
      return res.data.filter(
        (p) => (p.userId || p.id) !== (currentUser?.userId || currentUser?.id),
      );
    },
    enabled: !!debouncedSearch,
  });

  // Fetch following for suggestions
  const { data: following, isLoading: isFollowingLoading } = useQuery({
    queryKey: ['following', currentUser?.username],
    queryFn: async () => {
      if (!currentUser?.username) return [];
      const res = await followsApi.getFollowing(currentUser.username);
      return (res.data || []).map(
        (f: { following: { profile: Profile } }) => f.following.profile,
      );
    },
    enabled: !debouncedSearch && !!currentUser?.username,
  });

  const handleUserToggle = (user: Profile) => {
    if (selectedUsers.find((u) => u.id === user.id)) {
      setSelectedUsers(selectedUsers.filter((u) => u.id !== user.id));
    } else {
      setSelectedUsers([...selectedUsers, user]);
    }
    // Clear search after selection if desired, or keep it to add more
    // setSearch('');
  };

  const handleCreateChat = async () => {
    if (selectedUsers.length === 0) return;
    setIsCreating(true);

    try {
      // search.service.ts returns the User ID as `id` instead of `userId` in search results
      const participantIds = selectedUsers.map(
        (u) => (u.userId || u.id) as string,
      );
      const res = await chatApi.createGroup({
        participantIds,
        name: selectedUsers.length > 1 ? groupName : undefined,
      });

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

  const modalContent = (
    <div className="fixed inset-0 z-100 flex items-center justify-center p-4 md:p-8">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/80 backdrop-blur-md"
      />

      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="bg-[#1c1c1c] border border-white/10 w-full max-w-2xl rounded-3xl overflow-hidden shadow-2xl flex flex-col h-[70vh] max-h-[800px] relative z-10"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 bg-white/5 backdrop-blur-xl shrink-0 rounded-t-3xl">
          <button
            type="button"
            onClick={onClose}
            className="text-white/70 hover:text-white transition-colors p-2 -ml-2 rounded-full hover:bg-white/10"
          >
            <X size={20} />
          </button>
          <h2 className="font-bold text-lg text-white">
            {t('chat.new_message')}
          </h2>
          <button
            type="button"
            onClick={handleCreateChat}
            disabled={selectedUsers.length === 0 || isCreating}
            className="text-[#3797f0] font-semibold hover:text-blue-400 disabled:opacity-50 text-sm transition-colors px-2 py-1"
          >
            {isCreating ? t('chat.creating') : t('chat.chat')}
          </button>
        </div>

        {/* Search & Selection Area */}
        <div className="px-6 py-3 border-b border-white/5 shrink-0">
          <div className="flex flex-wrap gap-2 items-center min-h-[44px] bg-[#262626] px-4 py-2 rounded-xl border border-white/5 focus-within:border-white/20 transition-colors">
            <span className="text-white/60 font-medium text-[15px] mr-1">
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
                  className="bg-[#e0f1ff] text-[#0095f6] px-2.5 py-0.5 rounded-full text-[13px] font-semibold flex items-center gap-1 hover:opacity-90 transition-opacity"
                >
                  {u.username}
                  <X size={12} />
                </motion.button>
              ))}
            </AnimatePresence>

            <div className="flex-1 min-w-[100px]">
              <input
                type="text"
                className="w-full bg-transparent border-none text-white placeholder-gray-500 focus:ring-0 text-[14px] p-0 leading-relaxed"
                placeholder={t('chat.search_dots')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Group Name (Conditional) */}
        <AnimatePresence>
          {selectedUsers.length > 1 && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="px-6 py-2 border-b border-white/5 shrink-0 overflow-hidden"
            >
              <div className="flex items-center bg-[#262626] rounded-xl px-4 py-3 border border-white/10 focus-within:border-blue-500/50 transition-colors">
                <div className="bg-white/10 p-1.5 rounded-lg mr-3">
                  <Users size={16} className="text-white/70" />
                </div>
                <input
                  type="text"
                  placeholder={t('chat.name_group_optional')}
                  className="w-full bg-transparent border-none p-0 text-white placeholder-gray-500 focus:ring-0 text-sm"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Results List */}
        <div className="flex-1 overflow-y-auto p-2 custom-scrollbar min-h-[300px]">
          {isLoading ? (
            <div className="flex justify-center items-center h-full text-white/20">
              <div className="w-6 h-6 border-2 border-currentColor border-t-transparent rounded-full animate-spin" />
            </div>
          ) : displayedUsers?.length === 0 ? (
            debouncedSearch ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-500 space-y-4">
                <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center">
                  <Search className="w-8 h-8 opacity-20" />
                </div>
                <p className="text-sm">{t('chat.no_account_found')}</p>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-gray-500/50 space-y-2">
                <p className="text-xs uppercase tracking-widest font-bold">
                  {t('chat.no_following')}
                </p>
              </div>
            )
          ) : (
            <>
              {!debouncedSearch && (
                <div className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider sticky top-0 bg-[#1c1c1c]/95 backdrop-blur-sm z-10">
                  {t('chat.suggested')}
                </div>
              )}

              <div className="space-y-1 pb-4">
                {displayedUsers?.map((profile: Profile) => {
                  const isSelected = selectedUsers.some(
                    (u) => u.id === profile.id,
                  );
                  return (
                    <motion.button
                      type="button"
                      layout
                      key={profile.id}
                      onClick={() => handleUserToggle(profile)}
                      whileHover={{ backgroundColor: 'rgba(255,255,255,0.05)' }}
                      whileTap={{ scale: 0.98 }}
                      className="w-full flex items-center justify-between px-4 py-3 rounded-2xl transition-all group"
                    >
                      <div className="flex items-center gap-4">
                        <UserAvatar
                          src={profile.avatar || undefined}
                          thumbnailUrl={profile.thumbnailUrl || undefined}
                          standardUrl={profile.standardUrl || undefined}
                          alt={profile.username}
                          className="w-12 h-12"
                        />
                        <div className="text-left">
                          <div className="font-semibold text-white text-[15px]">
                            {profile.username}
                          </div>
                          <div className="text-xs text-gray-400 font-medium">
                            {profile.fullName}
                          </div>
                        </div>
                      </div>

                      <div
                        className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all duration-300 ${isSelected ? 'bg-[#3797f0] border-[#3797f0]' : 'border-white/20 group-hover:border-white/50'}`}
                      >
                        {isSelected && (
                          <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                          >
                            <Check
                              size={14}
                              className="text-white"
                              strokeWidth={4}
                            />
                          </motion.div>
                        )}
                      </div>
                    </motion.button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </motion.div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
