import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import {
  CheckCircle,
  ExternalLink,
  Eye,
  Ghost,
  ShieldAlert,
  Trash2,
} from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import type { AdminModerationItem } from '../../services/admin.service';
import { adminApi } from '../../services/admin.service';
import type { PaginatedResponse } from '../../types';
import ConfirmModal from '../modals/ConfirmModal';
import UserAvatar from '../UserAvatar';
import { Button } from '../ui';
import { AdminEmptyState } from './AdminEmptyState';
import { AdminFilterBar } from './AdminFilterBar';
import { AdminListRow } from './AdminList';
import { AdminPageHeader } from './AdminPageHeader';
import { AdminDetailSkeleton, AdminListSkeleton } from './AdminSkeletons';
import { AdminSplitView } from './AdminSplitView';
import {
  ActionButton,
  FilterDropdown,
  Pagination,
  SearchInput,
} from './AdminTable';
import AppealsList from './AppealsList';

type ModerationEntityType = AdminModerationItem['entityType'];

function itemKey(item: Pick<AdminModerationItem, 'id' | 'entityType'>) {
  return `${item.entityType}:${item.id}`;
}

interface Props {
  onToast: (msg: string, type: 'success' | 'error') => void;
}

export default function ModerationTab({ onToast }: Props) {
  const { t } = useTranslation();
  const [viewMode, setViewMode] = useState<'queue' | 'appeals'>('queue');
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const debouncedSearch = useDebouncedValue(search, 400);
  const queryClient = useQueryClient();

  const [selectedItemKey, setSelectedItemKey] = useState<string | null>(null);
  const [actionItem, setActionItem] = useState<{
    id: string;
    entityType: ModerationEntityType;
    status: 'VISIBLE' | 'HIDDEN' | 'REMOVED';
  } | null>(null);

  const { data, isLoading } = useQuery<PaginatedResponse<AdminModerationItem>>({
    queryKey: ['admin', 'moderation', page, typeFilter, debouncedSearch],
    queryFn: () =>
      adminApi
        .getModerationQueue(
          page,
          20,
          typeFilter || undefined,
          debouncedSearch || undefined,
        )
        .then((res) => res.data as PaginatedResponse<AdminModerationItem>),
  });

  const items = data?.data || [];
  const selectedItem = items.find((i) => itemKey(i) === selectedItemKey);

  const moderationMutation = useMutation({
    mutationFn: ({
      id,
      entityType,
      status,
      note,
    }: {
      id: string;
      entityType: ModerationEntityType;
      status: 'VISIBLE' | 'HIDDEN' | 'REMOVED';
      note?: string;
    }) => adminApi.updateModerationStatus(entityType, id, status, note),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'moderation'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'posts'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] });
      setActionItem(null);

      if (selectedItemKey) {
        const currentIndex = items.findIndex(
          (i) => itemKey(i) === selectedItemKey,
        );
        if (currentIndex !== -1 && currentIndex + 1 < items.length) {
          setSelectedItemKey(itemKey(items[currentIndex + 1]));
        } else {
          setSelectedItemKey(null);
        }
      }

      const toastKey =
        variables.status === 'VISIBLE'
          ? 'admin.moderation.toast_approved'
          : variables.status === 'HIDDEN'
            ? 'admin.moderation.toast_hidden'
            : 'admin.moderation.toast_removed';
      onToast(t(toastKey), 'success');
    },
    onError: () => onToast(t('admin.moderation.toast_error'), 'error'),
  });

  const batchModerationMutation = useMutation({
    mutationFn: async ({
      status,
      note,
    }: {
      status: 'VISIBLE' | 'HIDDEN' | 'REMOVED';
      note?: string;
    }) => {
      const promises = Array.from(selectedKeys).map((key) => {
        const item = items.find((i) => itemKey(i) === key);
        if (!item) return Promise.resolve();
        return adminApi.updateModerationStatus(
          item.entityType,
          item.id,
          status,
          note,
        );
      });
      return Promise.all(promises);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'moderation'] });
      const count = selectedKeys.size;
      setSelectedKeys(new Set());
      const toastKey =
        variables.status === 'VISIBLE'
          ? 'admin.moderation.toast_batch_approved'
          : 'admin.moderation.toast_batch_hidden';
      onToast(t(toastKey, { count }), 'success');
    },
    onError: () => onToast(t('admin.moderation.toast_batch_error'), 'error'),
  });

  const toggleSelect = (key: string, e: React.SyntheticEvent) => {
    e.stopPropagation();
    const next = new Set(selectedKeys);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setSelectedKeys(next);
  };

  const toggleSelectAll = () => {
    if (selectedKeys.size === items.length && items.length > 0) {
      setSelectedKeys(new Set());
    } else {
      setSelectedKeys(new Set(items.map((i) => itemKey(i))));
    }
  };

  return (
    <div className="flex flex-col min-h-0 space-y-4">
      <AdminPageHeader
        title={t('admin.moderation.title')}
        subtitle={t('admin.moderation.subtitle')}
        actions={
          <div className="flex flex-col xs:flex-row gap-1.5 xs:gap-2 bg-white/5 p-1 rounded-lg w-full sm:w-auto">
            <button
              type="button"
              onClick={() => setViewMode('queue')}
              className={`px-3 sm:px-4 py-2.5 min-h-11 rounded-md text-sm font-semibold transition-colors w-full xs:w-auto ${viewMode === 'queue' ? 'bg-brand-primary text-white' : 'text-gray-400 hover:text-white'}`}
            >
              {t('admin.moderation.tab_queue')}
            </button>
            <button
              type="button"
              onClick={() => setViewMode('appeals')}
              className={`px-3 sm:px-4 py-2.5 min-h-11 rounded-md text-sm font-semibold transition-colors w-full xs:w-auto ${viewMode === 'appeals' ? 'bg-brand-primary text-white' : 'text-gray-400 hover:text-white'}`}
            >
              {t('admin.moderation.tab_appeals')}
            </button>
          </div>
        }
      />

      {viewMode === 'queue' && (
        <AdminFilterBar>
          <div className="flex-1 min-w-0">
            <SearchInput
              value={search}
              onChange={(val) => {
                setSearch(val);
                setPage(1);
              }}
              placeholder={t('admin.moderation.search_placeholder')}
            />
          </div>
          <FilterDropdown
            label={t('admin.moderation.filter_type')}
            value={typeFilter}
            onChange={(v) => {
              setTypeFilter(v);
              setPage(1);
            }}
            options={[
              { value: '', label: t('admin.moderation.type_all') },
              { value: 'POST', label: t('admin.moderation.type_post') },
              { value: 'STORY', label: t('admin.moderation.type_story') },
              { value: 'COMMENT', label: t('admin.moderation.type_comment') },
            ]}
          />
        </AdminFilterBar>
      )}

      {viewMode === 'appeals' ? (
        <div className="rounded-xl border border-white/10 bg-black/20 p-2 space-y-2">
          <div className="flex justify-end px-1">
            <Link
              to="/admin/appeals"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-primary hover:text-brand-primary/80 transition-colors"
            >
              {t('admin.shared.view_full_panel')}
              <ExternalLink size={12} />
            </Link>
          </div>
          <AppealsList
            statusFilter="PENDING"
            limit={5}
            showPagination={false}
          />
        </div>
      ) : (
        <>
          {/* Batch Actions Bar */}
          <AnimatePresence>
            {selectedKeys.size > 0 && (
              <motion.div
                initial={{ opacity: 0, height: 0, marginBottom: 0 }}
                animate={{ opacity: 1, height: 'auto', marginBottom: 16 }}
                exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                className="flex flex-wrap items-center gap-2 p-2 bg-white/5 border border-white/10 rounded-lg shrink-0"
              >
                <span className="px-2 sm:px-3 text-sm font-semibold text-white">
                  {t('admin.shared.selected_count', {
                    count: selectedKeys.size,
                  })}
                </span>
                <ActionButton
                  onClick={() =>
                    batchModerationMutation.mutate({
                      status: 'VISIBLE',
                      note: 'Batch Approved',
                    })
                  }
                  label={t('admin.moderation.approve_false_positive')}
                  variant="success"
                  icon={CheckCircle}
                  disabled={batchModerationMutation.isPending}
                />
                <ActionButton
                  onClick={() =>
                    batchModerationMutation.mutate({
                      status: 'HIDDEN',
                      note: 'Batch Hidden',
                    })
                  }
                  label={t('admin.moderation.hide_shadowban')}
                  variant="warning"
                  icon={Eye}
                  disabled={batchModerationMutation.isPending}
                />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Split Pane Layout */}
          <AdminSplitView
            hasSelection={!!selectedItemKey}
            onBack={() => setSelectedItemKey(null)}
            listTitle={t('admin.moderation.list_title')}
            list={
              <div className="flex flex-col h-full min-h-0">
                <div className="p-3 border-b border-white/5 shrink-0 flex items-center gap-3">
                  <input
                    type="checkbox"
                    className="rounded border-white/20 bg-white/5 text-brand-primary focus:ring-brand-primary/50"
                    checked={
                      selectedKeys.size === items.length && items.length > 0
                    }
                    onChange={toggleSelectAll}
                  />
                  <h3 className="font-semibold text-white text-sm">
                    {t('admin.shared.select_all')}
                  </h3>
                </div>

                <div className="flex-1 overflow-y-auto p-2 space-y-2">
                  {isLoading ? (
                    <AdminListSkeleton rows={5} />
                  ) : items.length === 0 ? (
                    <AdminEmptyState
                      icon={ShieldAlert}
                      title={t('admin.moderation.empty_title')}
                      description={t('admin.moderation.empty_description')}
                      compact
                    />
                  ) : (
                    items.map((item) => {
                      const key = itemKey(item);
                      return (
                        <AdminListRow
                          key={key}
                          onClick={() => setSelectedItemKey(key)}
                          className={
                            selectedItemKey === key
                              ? 'border-brand-primary/30 bg-brand-primary/10'
                              : undefined
                          }
                          title={item.caption || t('admin.shared.no_text')}
                          subtitle={`@${item.user?.profile?.username || '—'}`}
                          meta={
                            <span className="text-red-400 truncate">
                              {item.moderationNote?.replace(
                                '[AI Automated Flag]: ',
                                '',
                              ) || 'Flagged'}
                            </span>
                          }
                          badge={
                            <span className="text-xs font-semibold uppercase text-amber-500">
                              {item.entityType}
                            </span>
                          }
                          avatar={
                            <div className="flex items-start gap-2">
                              <input
                                type="checkbox"
                                className="mt-1 rounded border-white/20 bg-white/5 text-brand-primary focus:ring-brand-primary/50"
                                checked={selectedKeys.has(key)}
                                onChange={(e) => toggleSelect(key, e)}
                                onClick={(e) => e.stopPropagation()}
                              />
                              <div className="w-12 h-12 rounded-lg bg-zinc-900 border border-white/10 overflow-hidden shrink-0">
                                {item.media?.[0]?.url ? (
                                  <img
                                    src={
                                      item.media[0].thumbnailUrl ||
                                      item.media[0].url
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
                            </div>
                          }
                        />
                      );
                    })
                  )}
                </div>

                <div className="p-2 border-t border-white/5 shrink-0">
                  <Pagination meta={data?.meta} onPageChange={setPage} />
                </div>
              </div>
            }
            detail={
              <AnimatePresence mode="wait">
                {isLoading && selectedItemKey && !selectedItem ? (
                  <AdminDetailSkeleton />
                ) : selectedItem ? (
                  <motion.div
                    key={itemKey(selectedItem)}
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.98 }}
                    transition={{ duration: 0.15 }}
                    className="flex flex-col h-full"
                  >
                    <div className="p-3 sm:p-4 border-b border-white/5 flex flex-col sm:flex-row sm:items-center justify-between shrink-0 gap-2 sm:gap-3">
                      <div className="flex items-center gap-3">
                        <UserAvatar
                          src={selectedItem.user?.profile?.avatar || undefined}
                          alt={selectedItem.user?.profile?.username || 'User'}
                          size="sm"
                        />
                        <div>
                          <h3 className="text-sm font-semibold text-white">
                            @{selectedItem.user?.profile?.username}
                          </h3>
                          <p className="text-xs text-gray-300">
                            {selectedItem.entityType} ·{' '}
                            {new Date(selectedItem.createdAt).toLocaleString()}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-col xs:flex-row gap-2 w-full sm:w-auto">
                        <Button
                          onClick={() =>
                            moderationMutation.mutate({
                              id: selectedItem.id,
                              entityType: selectedItem.entityType,
                              status: 'VISIBLE',
                              note: 'Aprobado (Falso Positivo)',
                            })
                          }
                          isLoading={moderationMutation.isPending}
                          variant="success"
                          className="min-h-11 text-sm font-semibold border-green-500/20 w-full sm:w-auto"
                        >
                          <CheckCircle size={16} className="mr-2" />
                          {t('admin.moderation.approve_safe')}
                        </Button>
                        <Button
                          onClick={() =>
                            setActionItem({
                              id: selectedItem.id,
                              entityType: selectedItem.entityType,
                              status: 'REMOVED',
                            })
                          }
                          variant="danger"
                          className="min-h-11 text-sm font-semibold border-red-500/20 w-full sm:w-auto"
                        >
                          <Trash2 size={16} className="mr-2" />
                          {t('admin.moderation.delete')}
                        </Button>
                      </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-3 sm:p-4 flex flex-col items-center">
                      <div className="w-full max-w-2xl p-3 sm:p-4 bg-red-500/10 border border-red-500/20 rounded-lg mb-4 flex items-start gap-3">
                        <ShieldAlert
                          className="text-red-500 shrink-0 mt-0.5"
                          size={20}
                        />
                        <div className="min-w-0">
                          <h4 className="text-red-500 font-semibold text-sm mb-1">
                            {t('admin.moderation.ai_detection_title')}
                          </h4>
                          <p className="text-xs sm:text-sm text-red-200">
                            {selectedItem.moderationNote ||
                              t('admin.moderation.ai_detection_fallback')}
                          </p>
                        </div>
                      </div>

                      <div className="w-full bg-zinc-900 border border-white/10 rounded-lg overflow-hidden shadow-2xl">
                        {selectedItem.media &&
                          selectedItem.media.length > 0 && (
                            <div className="relative aspect-4/5 bg-black">
                              {selectedItem.media[0].type?.includes('video') ? (
                                <video
                                  src={selectedItem.media[0].url}
                                  className="w-full h-full object-cover"
                                  controls
                                  muted
                                  playsInline
                                />
                              ) : (
                                <img
                                  src={selectedItem.media[0].url}
                                  alt=""
                                  className="w-full h-full object-cover"
                                />
                              )}
                              {selectedItem.media.length > 1 && (
                                <div className="absolute top-2 right-2 bg-black/60 text-white text-xs px-2 py-1 rounded-full backdrop-blur-md">
                                  1/{selectedItem.media.length}
                                </div>
                              )}
                            </div>
                          )}

                        <div className="p-4">
                          {selectedItem.caption ? (
                            <p className="text-white text-sm whitespace-pre-wrap leading-relaxed">
                              {selectedItem.caption}
                            </p>
                          ) : (
                            <p className="text-gray-500 text-sm italic">
                              {t('admin.shared.no_text')}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex-1 flex items-center justify-center p-6"
                  >
                    <AdminEmptyState
                      icon={ShieldAlert}
                      title={t('admin.moderation.detail_empty_title')}
                      description={t(
                        'admin.moderation.detail_empty_description',
                      )}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            }
          />

          {/* Action Confirm Modal */}
          <ConfirmModal
            isOpen={actionItem !== null}
            onClose={() => setActionItem(null)}
            onConfirm={() => {
              if (actionItem) {
                moderationMutation.mutate({
                  id: actionItem.id,
                  entityType: actionItem.entityType,
                  status: actionItem.status,
                  note: 'Eliminado permanentemente por moderación',
                });
              }
            }}
            title={t('admin.moderation.confirm_title')}
            message={t('admin.moderation.confirm_message')}
            confirmText={t('admin.moderation.confirm_delete')}
            cancelText={t('admin.shared.cancel')}
            isDestructive={true}
            isLoading={moderationMutation.isPending}
          />
        </>
      )}
    </div>
  );
}
