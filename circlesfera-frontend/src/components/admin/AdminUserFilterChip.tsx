import { useQuery } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import type { AdminUserDetail } from '../../services/admin.service';
import { adminApi } from '../../services/admin.service';

interface AdminUserFilterChipProps {
  username?: string | null;
  onClear: () => void;
}

/** Shows when a content queue is scoped to one platform user. */
export function AdminUserFilterChip({
  username,
  onClear,
}: AdminUserFilterChipProps) {
  const { t } = useTranslation();
  return (
    <div className="inline-flex items-center gap-1.5 pl-2.5 pr-1 py-1 rounded-lg bg-brand-primary/15 border border-brand-primary/25 text-xs font-semibold text-brand-primary shrink-0">
      <span className="truncate max-w-40">
        {t('admin.shared.filtered_by_user', {
          user: username ? `@${username}` : t('admin.shared.user'),
        })}
      </span>
      <button
        type="button"
        onClick={onClear}
        className="min-w-11 min-h-11 w-11 h-11 sm:min-w-9 sm:min-h-9 sm:w-9 sm:h-9 flex items-center justify-center rounded-md hover:bg-brand-primary/20 text-brand-primary"
        aria-label={t('admin.shared.clear_user_filter')}
      >
        <X size={14} />
      </button>
    </div>
  );
}

/** Reads `?userId=` from the queue URL and resolves username for the filter chip. */
export function useAdminQueueUserFilter() {
  const [searchParams, setSearchParams] = useSearchParams();
  const userId = searchParams.get('userId') || undefined;

  const clearUserFilter = useCallback(() => {
    const next = new URLSearchParams(searchParams);
    next.delete('userId');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const { data: user } = useQuery({
    queryKey: ['admin', 'user-detail', userId],
    queryFn: () =>
      adminApi
        .getUserDetail(userId!)
        .then((res) => res.data as AdminUserDetail),
    enabled: Boolean(userId),
  });

  return {
    userId,
    username: user?.profile?.username ?? null,
    clearUserFilter,
  };
}
