import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import {
  CheckCircle,
  ExternalLink,
  Ghost,
  Megaphone,
  Target,
  TrendingUp,
  XCircle,
} from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { adminApi } from '../../services/admin.service';
import type { PaginatedResponse } from '../../types';
import ConfirmModal from '../modals/ConfirmModal';
import UserAvatar from '../UserAvatar';
import { Button } from '../ui';
import { AdminEmptyState } from './AdminEmptyState';
import { AdminFilterBar } from './AdminFilterBar';
import { AdminListRow } from './AdminList';
import { AdminPageHeader } from './AdminPageHeader';
import { AdminListSkeleton } from './AdminSkeletons';
import { AdminSplitView } from './AdminSplitView';
import {
  FilterDropdown,
  Pagination,
  SearchInput,
  StatusBadge,
} from './AdminTable';

interface AdminPromotion {
  id: string;
  userId: string;
  targetType: string;
  targetId: string;
  budget: number;
  currency: string;
  status: string;
  startDate: string;
  endDate: string;
  reach: number;
  createdAt: string;
  user: {
    email: string;
    profile: {
      username: string;
      avatar: string;
    };
  };
  target?: any;
}

interface Props {
  onToast: (msg: string, type: 'success' | 'error') => void;
}

export default function PromotionsTab({ onToast }: Props) {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const debouncedSearch = useDebouncedValue(search, 400);
  const queryClient = useQueryClient();

  const [selectedPromoId, setSelectedPromoId] = useState<string | null>(null);
  const [confirmRejectOpen, setConfirmRejectOpen] = useState(false);

  const { data, isLoading } = useQuery<PaginatedResponse<AdminPromotion>>({
    queryKey: ['admin', 'promotions', page, debouncedSearch, statusFilter],
    queryFn: () =>
      adminApi
        .getPromotions(
          page,
          20,
          statusFilter || undefined,
          debouncedSearch || undefined,
        )
        .then((res) => res.data as PaginatedResponse<AdminPromotion>),
  });

  const promos = data?.data || [];
  const selectedPromo = promos.find((p) => p.id === selectedPromoId);

  const isFiltered = debouncedSearch.length > 0 || statusFilter.length > 0;

  const clearFilters = () => {
    setSearch('');
    setStatusFilter('');
    setPage(1);
    setSelectedPromoId(null);
  };

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      status,
      note,
    }: {
      id: string;
      status: string;
      note?: string;
    }) => adminApi.updatePromotion(id, status, note),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'promotions'] });

      // Auto-advance
      if (
        selectedPromoId &&
        (variables.status === 'ACTIVE' || variables.status === 'REJECTED')
      ) {
        const currentIndex = promos.findIndex((p) => p.id === selectedPromoId);
        if (currentIndex !== -1 && currentIndex + 1 < promos.length) {
          setSelectedPromoId(promos[currentIndex + 1].id);
        } else {
          setSelectedPromoId(null);
        }
      }

      const msg =
        variables.status === 'ACTIVE'
          ? t('admin.promotions.toast_approved')
          : t('admin.promotions.toast_rejected');
      onToast(msg, 'success');
    },
    onError: () => onToast(t('admin.promotions.toast_error'), 'error'),
  });

  return (
    <div className="flex flex-col min-h-0 space-y-4">
      <AdminPageHeader
        title={t('admin.promotions.title')}
        subtitle={t('admin.promotions.subtitle')}
      />

      <AdminFilterBar>
        <div className="flex-1 min-w-0">
          <SearchInput
            value={search}
            onChange={(val) => {
              setSearch(val);
              setPage(1);
            }}
            placeholder={t('admin.promotions.search_placeholder')}
          />
        </div>
        <FilterDropdown
          label={t('admin.promotions.filter_status')}
          value={statusFilter}
          onChange={(v) => {
            setStatusFilter(v);
            setPage(1);
          }}
          options={[
            { value: '', label: t('admin.promotions.status_all') },
            { value: 'PENDING', label: t('admin.promotions.status_pending') },
            { value: 'ACTIVE', label: t('admin.promotions.status_active') },
            {
              value: 'COMPLETED',
              label: t('admin.promotions.status_completed'),
            },
            { value: 'REJECTED', label: t('admin.promotions.status_rejected') },
          ]}
        />
      </AdminFilterBar>

      <AdminSplitView
        hasSelection={!!selectedPromoId}
        onBack={() => setSelectedPromoId(null)}
        listTitle={t('admin.promotions.list_title', {
          count: data?.meta.total || 0,
        })}
        list={
          <div className="flex flex-col h-full min-h-0">
            <div className="p-3 border-b border-white/5 shrink-0 flex justify-between items-center lg:hidden">
              <h3 className="font-semibold text-white text-sm flex items-center gap-2">
                <Target size={16} className="text-brand-primary" />
                {t('admin.promotions.list_title', {
                  count: data?.meta.total || 0,
                })}
              </h3>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-2">
              {isLoading ? (
                <AdminListSkeleton rows={5} />
              ) : promos.length === 0 ? (
                <AdminEmptyState
                  icon={Megaphone}
                  title={
                    isFiltered
                      ? t('admin.promotions.empty_filtered_title')
                      : t('admin.promotions.empty_title')
                  }
                  description={
                    isFiltered
                      ? t('admin.promotions.empty_filtered_description')
                      : t('admin.promotions.empty_description')
                  }
                  action={
                    isFiltered ? (
                      <Button
                        onClick={clearFilters}
                        variant="secondary"
                        className="min-h-11"
                      >
                        {t('admin.shared.clear_filters')}
                      </Button>
                    ) : undefined
                  }
                  compact
                />
              ) : (
                promos.map((promo) => (
                  <AdminListRow
                    key={promo.id}
                    onClick={() => setSelectedPromoId(promo.id)}
                    className={
                      selectedPromoId === promo.id
                        ? 'border-brand-primary/30 bg-brand-primary/10'
                        : undefined
                    }
                    title={`@${promo.user.profile.username}`}
                    subtitle={t('admin.promotions.reach_estimate', {
                      budget: promo.budget,
                      currency: promo.currency,
                      reach: promo.reach.toLocaleString(),
                    })}
                    badge={<StatusBadge status={promo.status} />}
                    avatar={
                      <div className="w-12 h-12 rounded-lg bg-zinc-900 border border-white/10 overflow-hidden shrink-0">
                        {promo.target?.media?.[0]?.url || promo.target?.url ? (
                          <img
                            src={
                              promo.target?.media?.[0]?.thumbnailUrl ||
                              promo.target?.media?.[0]?.url ||
                              promo.target?.url
                            }
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-zinc-700">
                            <Ghost size={16} />
                          </div>
                        )}
                      </div>
                    }
                  />
                ))
              )}
            </div>

            <div className="p-2 border-t border-white/5 shrink-0">
              <Pagination meta={data?.meta} onPageChange={setPage} />
            </div>
          </div>
        }
        detail={
          <AnimatePresence mode="wait">
            {selectedPromo ? (
              <motion.div
                key={selectedPromo.id}
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.15 }}
                className="flex flex-col h-full"
              >
                <div className="p-3 sm:p-4 border-b border-white/5 flex flex-col sm:flex-row sm:items-center justify-between shrink-0 gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <UserAvatar
                      src={selectedPromo.user.profile.avatar || undefined}
                      alt={selectedPromo.user.profile.username}
                      size="sm"
                    />
                    <div>
                      <h3 className="text-sm font-semibold text-white">
                        @{selectedPromo.user.profile.username}
                      </h3>
                      <p className="text-xs text-gray-300">
                        {selectedPromo.user.email}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
                    {selectedPromo.status === 'PENDING' && (
                      <>
                        <Button
                          onClick={() => setConfirmRejectOpen(true)}
                          isLoading={updateMutation.isPending}
                          variant="danger"
                          className="min-h-11 px-3 md:px-4 py-2 text-sm font-semibold border-red-500/20"
                        >
                          <XCircle size={16} className="mr-2 hidden md:block" />{' '}
                          <span className="hidden md:inline">
                            {t('admin.promotions.action_reject')}
                          </span>
                          <XCircle size={16} className="md:hidden" />
                        </Button>
                        <Button
                          onClick={() =>
                            updateMutation.mutate({
                              id: selectedPromo.id,
                              status: 'ACTIVE',
                            })
                          }
                          isLoading={updateMutation.isPending}
                          variant="success"
                          className="min-h-11 px-3 md:px-4 py-2 text-sm font-semibold border-green-500/20"
                        >
                          <CheckCircle
                            size={16}
                            className="mr-2 hidden md:block"
                          />{' '}
                          <span className="hidden md:inline">
                            {t('admin.promotions.action_approve')}
                          </span>
                          <CheckCircle size={16} className="md:hidden" />
                        </Button>
                      </>
                    )}
                    <a
                      href={`/post/${selectedPromo.targetId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center w-11 h-11 rounded-xl bg-white/5 hover:bg-white/10 text-white transition-colors shrink-0"
                      title={t('admin.promotions.open_new_tab')}
                    >
                      <ExternalLink size={18} />
                    </a>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-3 sm:p-4 flex flex-col items-center">
                  <div className="w-full max-w-2xl bg-white/5 border border-white/10 rounded-lg p-3 sm:p-4 mb-4 grid grid-cols-2 sm:grid-cols-4 gap-3 sm:divide-x sm:divide-white/5">
                    <div className="px-1 sm:px-2">
                      <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide mb-1">
                        {t('admin.promotions.budget_label')}
                      </p>
                      <p className="text-lg font-semibold text-white">
                        {selectedPromo.budget}{' '}
                        <span className="text-sm text-gray-300">
                          {selectedPromo.currency}
                        </span>
                      </p>
                    </div>
                    <div className="px-2 sm:px-4">
                      <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide mb-1">
                        {t('admin.promotions.reach_label')}
                      </p>
                      <p className="text-base sm:text-lg font-semibold text-emerald-400 flex items-center gap-1.5">
                        <TrendingUp size={14} />
                        {selectedPromo.reach.toLocaleString()}
                      </p>
                    </div>
                    <div className="px-2 sm:px-4">
                      <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide mb-1">
                        {t('admin.promotions.start_date_label')}
                      </p>
                      <p className="text-sm font-semibold text-white">
                        {new Date(selectedPromo.startDate).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="px-2 sm:px-4">
                      <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide mb-1">
                        {t('admin.promotions.status_label')}
                      </p>
                      <StatusBadge status={selectedPromo.status} />
                    </div>
                  </div>

                  <div className="w-full max-w-md bg-zinc-900 border border-white/10 rounded-lg overflow-hidden shadow-2xl">
                    <div className="p-3 bg-white/5 border-b border-white/10 flex items-center justify-between">
                      <span className="text-xs font-semibold uppercase tracking-wide text-brand-primary">
                        {t('admin.promotions.promoted_type', {
                          type: selectedPromo.targetType,
                        })}
                      </span>
                    </div>

                    {selectedPromo.target?.media &&
                      selectedPromo.target.media.length > 0 && (
                        <div className="relative aspect-4/5 bg-black">
                          {selectedPromo.target.media[0].type?.includes(
                            'video',
                          ) ? (
                            <video
                              src={selectedPromo.target.media[0].url}
                              className="w-full h-full object-cover"
                              controls
                              muted
                              playsInline
                            />
                          ) : (
                            <img
                              src={selectedPromo.target.media[0].url}
                              alt=""
                              className="w-full h-full object-cover"
                            />
                          )}
                          {selectedPromo.target.media.length > 1 && (
                            <div className="absolute top-2 right-2 bg-black/60 text-white text-xs px-2 py-1 rounded-full backdrop-blur-md">
                              1/{selectedPromo.target.media.length}
                            </div>
                          )}
                        </div>
                      )}

                    <div className="p-3 sm:p-4">
                      {selectedPromo.target?.caption ||
                      selectedPromo.target?.text ? (
                        <p className="text-white text-sm whitespace-pre-wrap leading-relaxed">
                          {selectedPromo.target.caption ||
                            selectedPromo.target.text}
                        </p>
                      ) : (
                        <p className="text-gray-500 text-sm italic">
                          {t('admin.promotions.no_description')}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            ) : (
              <div className="flex-1 flex items-center justify-center p-6">
                <AdminEmptyState
                  icon={Megaphone}
                  title={t('admin.promotions.detail_select_title')}
                  description={t('admin.promotions.detail_select_description')}
                />
              </div>
            )}
          </AnimatePresence>
        }
      />

      <ConfirmModal
        isOpen={confirmRejectOpen}
        onClose={() => setConfirmRejectOpen(false)}
        onConfirm={(reason) => {
          if (selectedPromo) {
            updateMutation.mutate({
              id: selectedPromo.id,
              status: 'REJECTED',
              note: reason || '',
            });
          }
          setConfirmRejectOpen(false);
        }}
        title={t('admin.promotions.confirm_reject_title')}
        message={t('admin.promotions.confirm_reject_message')}
        confirmText={t('admin.promotions.confirm_reject')}
        cancelText={t('admin.shared.cancel')}
        isDestructive={true}
        showInput={true}
        inputLabel={t('admin.promotions.reject_reason_label')}
        inputPlaceholder={t('admin.promotions.reject_reason_placeholder')}
        inputRequired={false}
      />
    </div>
  );
}
