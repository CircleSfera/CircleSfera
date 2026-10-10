import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, ChevronDown, ChevronUp, UserPlus, X } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { followsApi } from '../../services/follows.service';
import UserAvatar from '../UserAvatar';

export default function PendingFollowRequests() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [isExpanded, setIsExpanded] = useState(false);

  const { data: requests, isLoading } = useQuery({
    queryKey: ['pendingFollowRequests'],
    queryFn: () => followsApi.getPending(),
  });

  const acceptMutation = useMutation({
    mutationFn: (username: string) => followsApi.acceptRequest(username),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pendingFollowRequests'] });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (username: string) => followsApi.rejectRequest(username),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pendingFollowRequests'] });
    },
  });

  const pendingUsers = requests?.data || [];

  if (isLoading || pendingUsers.length === 0) {
    return null;
  }

  return (
    <div className="mb-4 mx-4 bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        aria-expanded={isExpanded}
        className="w-full flex items-center justify-between p-4 bg-black/20 hover:bg-black/40 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400">
            <UserPlus size={20} />
          </div>
          <div className="text-left">
            <h3 className="text-white font-bold text-sm">
              {t('settings.requests.title')}
            </h3>
            <p className="text-zinc-400 text-xs">
              {t('notifications.pending_requests', {
                count: pendingUsers.length,
              })}
            </p>
          </div>
        </div>
        {isExpanded ? (
          <ChevronUp className="text-zinc-400 w-5 h-5" />
        ) : (
          <ChevronDown className="text-zinc-400 w-5 h-5" />
        )}
      </button>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="p-2 space-y-1">
              {pendingUsers.map((user: any) => (
                <div
                  key={user.id}
                  className="flex items-center justify-between p-2 rounded-xl hover:bg-white/5 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <UserAvatar
                      src={user.avatar}
                      alt={user.username}
                      size="md"
                    />
                    <div>
                      <p className="text-white text-sm font-bold">
                        {user.fullName || user.username}
                      </p>
                      <p className="text-zinc-400 text-xs">@{user.username}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => acceptMutation.mutate(user.username)}
                      disabled={acceptMutation.isPending}
                      aria-label={t('notifications.accept_request', {
                        username: user.username,
                      })}
                      className="w-11 h-11 rounded-full bg-blue-500 hover:bg-blue-600 flex items-center justify-center text-white transition-colors"
                    >
                      <Check size={16} aria-hidden />
                    </button>
                    <button
                      type="button"
                      onClick={() => rejectMutation.mutate(user.username)}
                      disabled={rejectMutation.isPending}
                      aria-label={t('notifications.reject_request', {
                        username: user.username,
                      })}
                      className="w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
                    >
                      <X size={16} aria-hidden />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
