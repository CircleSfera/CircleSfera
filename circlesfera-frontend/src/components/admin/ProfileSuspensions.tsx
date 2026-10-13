import { useMutation, useQueryClient } from '@tanstack/react-query';
import { UserX } from 'lucide-react';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  AdminProfileStanding,
  SuspensionCause,
} from '../../services/admin.service';
import { adminApi, SUSPENSION_CAUSES } from '../../services/admin.service';
import { useAdminAuthStore } from '../../stores/adminAuthStore';
import { formatDay } from '../../utils/format';
import ConfirmModal from '../modals/ConfirmModal';
import { Button } from '../ui';
import { adminToast } from './adminToast';

const MIN_DAYS = 1;
const MAX_DAYS = 30;
const MIN_NOTE = 10;

// The causes whose outcome is a ban once the case is reviewed: the
// suspension only stops the Profile meanwhile.
const BAN_FOLLOWS: SuspensionCause[] = ['CHILD_EXPLOITATION', 'ILLEGAL'];

const FIELD =
  'mt-1 w-full min-h-12 rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white focus:outline-none focus:border-brand-primary/60';

// Each Profile of the person with its own standing, and the direct
// suspension of one of them for a serious cause. The other Profiles of the
// person are not touched.
export default function ProfileSuspensions({
  userId,
  profiles,
}: {
  userId: string;
  profiles: AdminProfileStanding[];
}) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const fieldId = useId();
  const canSanction = useAdminAuthStore((s) => s.hasPermission('users.ban'));
  const [target, setTarget] = useState<AdminProfileStanding | null>(null);
  const [lifting, setLifting] = useState<AdminProfileStanding | null>(null);
  const [cause, setCause] = useState<SuspensionCause | ''>('');
  const [days, setDays] = useState('7');
  const [note, setNote] = useState('');

  const refresh = () =>
    queryClient.invalidateQueries({
      queryKey: ['admin', 'user-detail', userId],
    });
  const close = () => {
    setTarget(null);
    setCause('');
    setDays('7');
    setNote('');
  };

  const dayCount = Number(days);
  const valid =
    cause !== '' &&
    Number.isInteger(dayCount) &&
    dayCount >= MIN_DAYS &&
    dayCount <= MAX_DAYS &&
    note.trim().length >= MIN_NOTE;

  const suspend = useMutation({
    mutationFn: () =>
      adminApi.suspendProfile((target as AdminProfileStanding).id, {
        cause: cause as SuspensionCause,
        days: dayCount,
        note: note.trim(),
      }),
    onSuccess: () => {
      adminToast(t('admin.profile_suspension.done'), 'success');
      close();
      void refresh();
    },
    onError: () => adminToast(t('admin.profile_suspension.error'), 'error'),
  });
  const lift = useMutation({
    mutationFn: () =>
      adminApi.liftProfileSuspension((lifting as AdminProfileStanding).id),
    onSuccess: () => {
      adminToast(t('admin.profile_suspension.lifted'), 'success');
      setLifting(null);
      void refresh();
    },
    onError: () =>
      adminToast(t('admin.profile_suspension.lift_error'), 'error'),
  });

  const standing = (profile: AdminProfileStanding) => {
    if (profile.isAccountBanned) return t('admin.profile_suspension.banned');
    if (!profile.suspendedUntil) return t('admin.profile_suspension.active');
    const until = t('admin.users.suspended_until', {
      date: formatDay(profile.suspendedUntil, i18n.language),
    });
    return profile.suspensionCause
      ? `${until} · ${t(`admin.profile_suspension.cause.${profile.suspensionCause}`)}`
      : until;
  };

  return (
    <section className="space-y-2" data-testid="user-profiles">
      <h4 className="text-[11px] font-semibold text-white/50 uppercase tracking-wide flex items-center gap-1.5">
        <UserX size={12} />
        {t('admin.profile_suspension.title')}
      </h4>
      <ul className="divide-y divide-white/5">
        {profiles.map((profile) => (
          <li
            key={profile.id}
            className="py-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-2"
          >
            <div className="min-w-0">
              <p className="text-sm text-white truncate">@{profile.username}</p>
              <p
                className={`text-xs ${
                  profile.isAccountBanned || profile.suspendedUntil
                    ? 'text-amber-300'
                    : 'text-white/50'
                }`}
              >
                {standing(profile)}
              </p>
            </div>
            {canSanction &&
              !profile.isAccountBanned &&
              (profile.suspendedUntil ? (
                <Button
                  variant="secondary"
                  size="sm"
                  className="min-h-11 sm:min-h-9 text-xs shrink-0"
                  onClick={() => setLifting(profile)}
                >
                  {t('admin.profile_suspension.lift')}
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  size="sm"
                  className="min-h-11 sm:min-h-9 text-xs shrink-0"
                  onClick={() => setTarget(profile)}
                >
                  {t('admin.profile_suspension.suspend')}
                </Button>
              ))}
          </li>
        ))}
      </ul>

      <ConfirmModal
        isOpen={target !== null}
        onClose={close}
        onConfirm={() => {
          if (valid) suspend.mutate();
        }}
        title={t('admin.profile_suspension.form_title')}
        message={t('admin.profile_suspension.form_message', {
          username: target?.username ?? '',
        })}
        confirmText={t('admin.profile_suspension.suspend')}
        cancelText={t('admin.shared.cancel')}
        isLoading={suspend.isPending}
        isDestructive
      >
        <div className="space-y-3 w-full text-left">
          <label
            htmlFor={`${fieldId}-cause`}
            className="block text-xs text-white/60"
          >
            {t('admin.profile_suspension.cause_label')}
            <select
              id={`${fieldId}-cause`}
              value={cause}
              onChange={(e) => setCause(e.target.value as SuspensionCause | '')}
              className={FIELD}
            >
              <option value="">
                {t('admin.profile_suspension.cause_choose')}
              </option>
              {SUSPENSION_CAUSES.map((value) => (
                <option key={value} value={value}>
                  {t(`admin.profile_suspension.cause.${value}`)}
                </option>
              ))}
            </select>
          </label>
          {cause !== '' && BAN_FOLLOWS.includes(cause) && (
            <p className="text-xs text-amber-300 leading-snug">
              {t('admin.profile_suspension.ban_follows')}
            </p>
          )}
          {cause === 'COMPROMISED' && (
            <p className="text-xs text-white/60 leading-snug">
              {t('admin.profile_suspension.compromised_hint')}
            </p>
          )}
          <label
            htmlFor={`${fieldId}-days`}
            className="block text-xs text-white/60"
          >
            {t('admin.profile_suspension.days_label', {
              min: MIN_DAYS,
              max: MAX_DAYS,
            })}
            <input
              id={`${fieldId}-days`}
              type="number"
              inputMode="numeric"
              min={MIN_DAYS}
              max={MAX_DAYS}
              value={days}
              onChange={(e) => setDays(e.target.value)}
              className={FIELD}
            />
          </label>
          <label
            htmlFor={`${fieldId}-note`}
            className="block text-xs text-white/60"
          >
            {t('admin.profile_suspension.note_label')}
            <textarea
              id={`${fieldId}-note`}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={1000}
              rows={3}
              className={`${FIELD} py-2 resize-y`}
            />
          </label>
          {!valid && (
            <p className="text-xs text-white/50">
              {t('admin.profile_suspension.incomplete', { min: MIN_NOTE })}
            </p>
          )}
        </div>
      </ConfirmModal>

      <ConfirmModal
        isOpen={lifting !== null}
        onClose={() => setLifting(null)}
        onConfirm={() => lift.mutate()}
        title={t('admin.profile_suspension.lift_title')}
        message={t('admin.profile_suspension.lift_message', {
          username: lifting?.username ?? '',
        })}
        confirmText={t('admin.profile_suspension.lift')}
        cancelText={t('admin.shared.cancel')}
        isLoading={lift.isPending}
        isDestructive={false}
      />
    </section>
  );
}
