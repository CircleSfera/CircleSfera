import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Star, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { creatorApi } from '../../services';
import UserAvatar from '../UserAvatar';

type CreatorSub = {
  id: string;
  creatorId: string;
  expiresAt: string;
  priceCents: number;
  creator?: {
    id: string;
    profile?: {
      username?: string;
      avatar?: string | null;
    } | null;
  };
};

export default function CreatorSubscriptionsList() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['my-creator-subscriptions'],
    queryFn: async () => {
      const res = await creatorApi.getMyCreatorSubscriptions();
      return (res.data || []) as CreatorSub[];
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (creatorId: string) =>
      creatorApi.cancelCreatorSubscription(creatorId),
    onSuccess: () => {
      toast.success(
        t('settings.billing.creator_cancel_success', 'Subscription cancelled'),
      );
      queryClient.invalidateQueries({ queryKey: ['my-creator-subscriptions'] });
    },
    onError: (e: any) => {
      toast.error(
        e.response?.data?.message ||
          t('settings.billing.creator_cancel_error', 'Could not cancel'),
      );
    },
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-6">
        <Loader2 className="animate-spin text-white/50" size={24} />
      </div>
    );
  }

  if (!data?.length) {
    return (
      <p className="text-sm text-gray-500 font-medium">
        {t(
          'settings.billing.no_creator_subs',
          'You are not subscribed to any creators yet.',
        )}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {data.map((sub) => (
        <div
          key={sub.id}
          className="flex items-center justify-between gap-3 bg-white/2 border border-white/5 rounded-xl p-3"
        >
          <Link
            to={`/${sub.creator?.profile?.username || ''}`}
            className="flex items-center gap-3 min-w-0"
          >
            <UserAvatar
              src={sub.creator?.profile?.avatar}
              alt={sub.creator?.profile?.username || 'creator'}
              size="sm"
            />
            <div className="min-w-0">
              <p className="text-sm font-bold text-white truncate flex items-center gap-1">
                <Star size={12} className="text-yellow-400" />@
                {sub.creator?.profile?.username || 'unknown'}
              </p>
              <p className="text-xs text-gray-500">
                ${(sub.priceCents / 100).toFixed(2)}/mo ·{' '}
                {t('settings.billing.expires', 'Expires')}{' '}
                {new Date(sub.expiresAt).toLocaleDateString()}
              </p>
            </div>
          </Link>
          <button
            type="button"
            onClick={() => {
              if (
                window.confirm(
                  t(
                    'settings.billing.confirm_cancel_creator',
                    'Cancel this creator subscription?',
                  ),
                )
              ) {
                cancelMutation.mutate(sub.creatorId);
              }
            }}
            disabled={cancelMutation.isPending}
            className="p-2 rounded-lg text-red-400 hover:bg-red-500/10 border border-red-500/20 disabled:opacity-50"
            aria-label={t('settings.billing.cancel', 'Cancel')}
          >
            <X size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}
