import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Check,
  CheckCircle2,
  Clock,
  RefreshCw,
  ShieldCheck,
  UserX,
} from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { adminApi } from '../../services/admin.service';
import ConfirmModal from '../modals/ConfirmModal';
import UserAvatar from '../UserAvatar';
import { Button, Select } from '../ui';
import VerificationBadge, {
  type VerificationLevel,
} from '../VerificationBadge';
import { AdminEmptyState } from './AdminEmptyState';
import { AdminFilterBar } from './AdminFilterBar';
import { AdminListRow } from './AdminList';
import { AdminPageHeader } from './AdminPageHeader';
import { AdminListSkeleton } from './AdminSkeletons';
import { AdminSplitView } from './AdminSplitView';
import { Pagination, SearchInput } from './AdminTable';

function timeAgo(
  date: string | Date,
  t: (key: string, opts?: Record<string, unknown>) => string,
): string {
  const now = Date.now();
  const d = new Date(date).getTime();
  const diff = Math.max(0, now - d);
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return t('admin.shared.time_ago_now');
  if (mins < 60) return t('admin.shared.time_ago_minutes', { count: mins });
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return t('admin.shared.time_ago_hours', { count: hrs });
  const days = Math.floor(hrs / 24);
  return t('admin.shared.time_ago_days', { count: days });
}

export default function UserVerificationTab({
  onToast,
}: {
  onToast: (msg: string, type: 'success' | 'error') => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearch = useDebouncedValue(searchTerm, 400);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [confirmRevokeOpen, setConfirmRevokeOpen] = useState(false);

  const { data: usersData, isLoading } = useQuery({
    queryKey: ['admin-users', page, debouncedSearch],
    queryFn: () => adminApi.getUsers(page, 20, debouncedSearch),
  });

  const updateVerificationMutation = useMutation({
    mutationFn: ({
      userId,
      level,
      accountType,
    }: {
      userId: string;
      level: VerificationLevel;
      accountType: string;
    }) =>
      adminApi.updateUserStatus(userId, {
        verificationLevel: level,
        accountType,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      onToast(t('admin.verification.toast_updated'), 'success');
    },
    onError: () => onToast(t('admin.verification.toast_update_error'), 'error'),
  });

  const revokeKycMutation = useMutation({
    mutationFn: (userId: string) => adminApi.revokeUserKYC(userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      onToast(t('admin.verification.toast_kyc_revoked'), 'success');
    },
    onError: () =>
      onToast(t('admin.verification.toast_kyc_revoke_error'), 'error'),
  });

  const syncKycMutation = useMutation({
    mutationFn: (userId: string) => adminApi.syncUserKYC(userId),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      const status = res.data?.status;
      if (status === 'verified' || status === 'already_verified') {
        onToast(t('admin.verification.toast_kyc_synced_verified'), 'success');
      } else {
        onToast(
          t('admin.verification.toast_kyc_synced', {
            status: status || 'ok',
          }),
          'success',
        );
      }
    },
    onError: () =>
      onToast(t('admin.verification.toast_kyc_sync_error'), 'error'),
  });

  const users = usersData?.data?.data || [];
  const selectedUser = users.find((u) => u.id === selectedUserId);

  // Local state for the right pane form
  const [draftLevel, setDraftLevel] = useState<VerificationLevel | null>(null);
  const [draftType, setDraftType] = useState<string | null>(null);

  // Reset drafts when selection changes
  if (selectedUser && draftLevel === null && draftType === null) {
    setDraftLevel(
      (selectedUser.verificationLevel as VerificationLevel) || 'BASIC',
    );
    setDraftType(selectedUser.accountType || 'PERSONAL');
  } else if (!selectedUser && draftLevel !== null) {
    setDraftLevel(null);
    setDraftType(null);
  }

  const hasChanges =
    selectedUser &&
    (draftLevel !== selectedUser.verificationLevel ||
      draftType !== selectedUser.accountType);

  const handleSave = () => {
    if (!selectedUser || !draftLevel || !draftType) return;
    updateVerificationMutation.mutate({
      userId: selectedUser.id,
      level: draftLevel,
      accountType: draftType,
    });
  };

  const handleSelectUser = (user: (typeof users)[number]) => {
    setSelectedUserId(user.id);
    setDraftLevel((user.verificationLevel as VerificationLevel) || 'BASIC');
    setDraftType(user.accountType || 'PERSONAL');
  };

  return (
    <div className="flex flex-col min-h-0 space-y-4">
      <AdminPageHeader
        title={t('admin.verification.title')}
        subtitle={t('admin.verification.subtitle')}
      />

      <AdminFilterBar>
        <div className="flex-1 min-w-0">
          <SearchInput
            value={searchTerm}
            onChange={(v) => {
              setSearchTerm(v);
              setPage(1);
            }}
            placeholder={t('admin.verification.search_placeholder')}
          />
        </div>
      </AdminFilterBar>

      <AdminSplitView
        hasSelection={!!selectedUserId}
        onBack={() => setSelectedUserId(null)}
        onClearSelection={() => setSelectedUserId(null)}
        listTitle={t('admin.verification.list_title')}
        list={
          <div className="flex flex-col h-full min-h-0">
            <div className="flex-1 overflow-y-auto space-y-2 pb-2">
              {isLoading ? (
                <AdminListSkeleton rows={5} />
              ) : users.length === 0 ? (
                <AdminEmptyState
                  icon={UserX}
                  title={t('admin.verification.empty_title')}
                  description={t('admin.verification.empty_description')}
                  compact
                />
              ) : (
                users.map((user) => {
                  const isVerified = !!user.identityVerifiedAt;
                  const isPending =
                    !isVerified && !!user.stripeIdentitySessionId;

                  return (
                    <AdminListRow
                      key={user.id}
                      onClick={() => handleSelectUser(user)}
                      className={
                        selectedUserId === user.id
                          ? 'border-brand-primary/30 bg-brand-primary/10'
                          : undefined
                      }
                      title={
                        <span className="flex items-center gap-1">
                          @{user.profile?.username || t('admin.shared.unknown')}
                          <VerificationBadge
                            level={user.verificationLevel as VerificationLevel}
                            size={14}
                          />
                        </span>
                      }
                      subtitle={
                        <span className="uppercase tracking-wide">
                          {user.accountType}
                        </span>
                      }
                      badge={
                        <span
                          className={`text-xs font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded ${
                            isVerified
                              ? 'text-green-400 bg-green-400/10'
                              : isPending
                                ? 'text-yellow-400 bg-yellow-400/10'
                                : 'text-zinc-400 bg-zinc-400/10'
                          }`}
                        >
                          {isVerified
                            ? t('admin.verification.kyc_completed')
                            : isPending
                              ? t('admin.verification.kyc_pending')
                              : t('admin.verification.kyc_not_started')}
                        </span>
                      }
                      meta={timeAgo(user.createdAt, t)}
                      avatar={
                        <UserAvatar
                          src={user.profile?.avatar || undefined}
                          thumbnailUrl={user.profile?.thumbnailUrl || undefined}
                          standardUrl={user.profile?.standardUrl || undefined}
                          alt={
                            user.profile?.username || t('admin.shared.unknown')
                          }
                          size="sm"
                        />
                      }
                    />
                  );
                })
              )}
            </div>

            <div className="shrink-0 pt-2 border-t border-white/5">
              <Pagination meta={usersData?.data?.meta} onPageChange={setPage} />
            </div>
          </div>
        }
        detail={
          <AnimatePresence mode="wait">
            {selectedUser ? (
              <motion.div
                key={selectedUser.id}
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.15 }}
                className="flex flex-col h-full"
              >
                {/* Header Action Bar */}
                <div className="p-4 border-b border-white/5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shrink-0">
                  <div className="flex items-center gap-3 min-w-0">
                    <UserAvatar
                      src={selectedUser.profile?.avatar || undefined}
                      thumbnailUrl={
                        selectedUser.profile?.thumbnailUrl || undefined
                      }
                      standardUrl={
                        selectedUser.profile?.standardUrl || undefined
                      }
                      alt={
                        selectedUser.profile?.username ||
                        t('admin.shared.unknown')
                      }
                      size="md"
                    />
                    <div className="min-w-0">
                      <h3 className="text-base sm:text-lg font-semibold text-white flex items-center gap-2">
                        <span className="truncate">
                          @{selectedUser.profile?.username}
                        </span>
                        <VerificationBadge
                          level={
                            selectedUser.verificationLevel as VerificationLevel
                          }
                          size={18}
                        />
                      </h3>
                      <p className="text-xs text-gray-400 truncate">
                        ID: {selectedUser.id}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    {hasChanges && (
                      <Button
                        onClick={handleSave}
                        isLoading={updateVerificationMutation.isPending}
                        variant="primary"
                        className="text-sm font-semibold min-h-11 w-full sm:w-auto"
                      >
                        <Check size={16} className="mr-2" />{' '}
                        {t('admin.verification.save_changes')}
                      </Button>
                    )}
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-6">
                  <section>
                    <h4 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-3">
                      {t('admin.verification.kyc_status_title')}
                    </h4>

                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        {selectedUser.identityVerifiedAt ? (
                          <>
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-green-500/10 text-green-400 text-[11px] font-semibold uppercase tracking-wide">
                              <CheckCircle2 size={13} />
                              {t('admin.verification.kyc_verified_title')}
                            </span>
                            <span className="text-xs text-gray-400">
                              {t(
                                'admin.verification.kyc_verified_description',
                                {
                                  date: new Date(
                                    selectedUser.identityVerifiedAt,
                                  ).toLocaleDateString(),
                                },
                              )}
                            </span>
                          </>
                        ) : selectedUser.stripeIdentitySessionId ? (
                          <>
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-yellow-500/10 text-yellow-400 text-[11px] font-semibold uppercase tracking-wide">
                              <Clock size={13} />
                              {t('admin.verification.kyc_session_title')}
                            </span>
                            <span className="text-xs text-gray-400">
                              {t('admin.verification.kyc_session_description')}
                            </span>
                          </>
                        ) : (
                          <>
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/5 text-gray-300 text-[11px] font-semibold uppercase tracking-wide">
                              <UserX size={13} />
                              {t('admin.verification.kyc_not_started_title')}
                            </span>
                            <span className="text-xs text-gray-500">
                              {t(
                                'admin.verification.kyc_not_started_description',
                              )}
                            </span>
                          </>
                        )}
                      </div>

                      <dl className="text-sm">
                        <div className="py-2.5 border-b border-white/5">
                          <dt className="text-xs font-medium text-gray-500 mb-1">
                            {t('admin.verification.session_id_label')}
                          </dt>
                          <dd className="text-white text-xs font-mono break-all">
                            {selectedUser.stripeIdentitySessionId ||
                              t('admin.verification.session_na')}
                          </dd>
                        </div>
                      </dl>

                      {selectedUser.stripeIdentitySessionId &&
                        !selectedUser.identityVerifiedAt && (
                          <Button
                            onClick={() =>
                              syncKycMutation.mutate(selectedUser.id)
                            }
                            isLoading={syncKycMutation.isPending}
                            variant="secondary"
                            className="w-full sm:w-auto text-sm font-semibold min-h-11"
                          >
                            <RefreshCw size={16} className="mr-2" />{' '}
                            {t('admin.verification.sync_stripe')}
                          </Button>
                        )}

                      {(selectedUser.identityVerifiedAt ||
                        selectedUser.stripeIdentitySessionId) && (
                        <div className="pt-1 space-y-2">
                          <Button
                            onClick={() => setConfirmRevokeOpen(true)}
                            isLoading={revokeKycMutation.isPending}
                            variant="danger"
                            className="w-full sm:w-auto text-sm font-semibold border-red-500/30 min-h-11"
                          >
                            <RefreshCw size={16} className="mr-2" />{' '}
                            {t('admin.verification.revoke_kyc')}
                          </Button>
                          <p className="text-xs text-gray-500">
                            {t('admin.verification.revoke_hint')}
                          </p>
                        </div>
                      )}
                    </div>
                  </section>

                  <section>
                    <h4 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-3">
                      {t('admin.verification.level_controls_title')}
                    </h4>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Select
                          label={t('admin.verification.level_label')}
                          value={draftLevel || 'BASIC'}
                          onChange={(e) =>
                            setDraftLevel(e.target.value as VerificationLevel)
                          }
                        >
                          <option value="BASIC">
                            {t('admin.verification.level_basic')}
                          </option>
                          <option value="VERIFIED">
                            {t('admin.verification.level_verified')}
                          </option>
                          <option value="BUSINESS">
                            {t('admin.verification.level_business')}
                          </option>
                          <option value="ELITE">
                            {t('admin.verification.level_elite')}
                          </option>
                        </Select>
                        <p className="text-xs text-gray-500">
                          {t('admin.verification.level_hint')}
                        </p>
                      </div>

                      <div className="space-y-2">
                        <Select
                          label={t('admin.verification.account_type_label')}
                          value={draftType || 'PERSONAL'}
                          onChange={(e) => setDraftType(e.target.value)}
                        >
                          <option value="PERSONAL">
                            {t('admin.verification.account_personal')}
                          </option>
                          <option value="CREATOR">
                            {t('admin.verification.account_creator')}
                          </option>
                          <option value="BUSINESS">
                            {t('admin.verification.account_business')}
                          </option>
                        </Select>
                        <p className="text-xs text-gray-500">
                          {t('admin.verification.account_type_hint')}
                        </p>
                      </div>
                    </div>
                  </section>
                </div>
              </motion.div>
            ) : (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex-1 flex items-center justify-center p-6"
              >
                <AdminEmptyState
                  icon={ShieldCheck}
                  title={t('admin.verification.detail_select_title')}
                  description={t(
                    'admin.verification.detail_select_description',
                  )}
                />
              </motion.div>
            )}
          </AnimatePresence>
        }
      />

      <ConfirmModal
        isOpen={confirmRevokeOpen}
        onClose={() => setConfirmRevokeOpen(false)}
        onConfirm={() => {
          if (selectedUser) {
            revokeKycMutation.mutate(selectedUser.id);
          }
          setConfirmRevokeOpen(false);
        }}
        title={t('admin.verification.confirm_revoke_title')}
        message={t('admin.verification.confirm_revoke_message')}
        confirmText={t('admin.verification.confirm_revoke')}
        cancelText={t('admin.shared.cancel')}
        isDestructive={true}
      />
    </div>
  );
}
