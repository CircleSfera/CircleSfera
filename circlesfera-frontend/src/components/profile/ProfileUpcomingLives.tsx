import { LIVE_REMINDER_LEAD_MINUTES } from '@circlesfera/shared';
import { BellRing, CalendarClock, Check } from 'lucide-react';
import { useId, useState } from 'react';
import { toast } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import {
  useCancelScheduledLive,
  useLiveReminder,
  useScheduledLives,
} from '../../hooks/useScheduledLives';
import type { ScheduledLive } from '../../services/live';
import { apiErrorMessage } from '../../utils/apiErrorMessage';
import { formatLiveStart } from '../../utils/liveSchedule';
import {
  CREATE_PANEL,
  CREATE_PRIMARY,
  CREATE_SECONDARY,
} from '../create-post/createStyles';
import ConfirmModal from '../modals/ConfirmModal';

interface ProfileUpcomingLivesProps {
  profileId: string;
  isMe: boolean;
}

/**
 * The upcoming lives of a Profile, each a card of its own with its title,
 * date and time. A viewer asks to be reminded of one or takes it back; the
 * host sees how many asked and can cancel it. Nothing is shown when there
 * is none the viewer may see.
 */
export default function ProfileUpcomingLives({
  profileId,
  isMe,
}: ProfileUpcomingLivesProps) {
  const { t, i18n } = useTranslation();
  const headingId = useId();
  const { data: lives = [] } = useScheduledLives(profileId);
  const reminder = useLiveReminder();
  const cancel = useCancelScheduledLive();
  const [toCancel, setToCancel] = useState<ScheduledLive | null>(null);

  if (lives.length === 0) return null;

  const toggleReminder = (live: ScheduledLive) =>
    reminder.mutate(live, {
      onSuccess: (answer) => {
        if (answer.reminded) {
          toast.success(
            t('live.schedule.reminded_toast', {
              min: LIVE_REMINDER_LEAD_MINUTES,
            }),
          );
        }
      },
      onError: (error) =>
        toast.error(apiErrorMessage(error, t, 'live.schedule.remind_failed')),
    });

  const confirmCancel = () => {
    if (!toCancel) return;
    cancel.mutate(toCancel, {
      onSuccess: () => {
        setToCancel(null);
        toast.success(t('live.schedule.cancelled'));
      },
      onError: (error) =>
        toast.error(apiErrorMessage(error, t, 'live.schedule.cancel_failed')),
    });
  };

  return (
    <section aria-labelledby={headingId} className="mb-6 flex flex-col gap-3">
      <h2 id={headingId} className="px-1 text-base font-semibold text-white">
        {t('profile.upcoming_lives.title')}
      </h2>
      <ul className="flex flex-col gap-3">
        {lives.map((live) => (
          <li
            key={live.id}
            className={`${CREATE_PANEL} flex flex-col gap-4 p-4 md:flex-row md:items-center`}
          >
            <div className="flex min-w-0 flex-1 items-start gap-3">
              <span
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-primary/15 text-brand-primary-text"
                aria-hidden
              >
                <CalendarClock size={20} />
              </span>
              <div className="min-w-0">
                <p className="line-clamp-2 text-base font-semibold text-white">
                  {live.title}
                </p>
                <p className="mt-1 text-sm text-white/75">
                  <time dateTime={live.startsAt}>
                    {formatLiveStart(live.startsAt, i18n.language)}
                  </time>
                  {live.audience === 'CLOSE_FRIENDS'
                    ? ` · ${t('live.audience.CLOSE_FRIENDS')}`
                    : null}
                </p>
                {isMe && live.reminderCount !== undefined ? (
                  <p className="mt-1 text-xs text-white/70">
                    {t('live.schedule.reminders', {
                      count: live.reminderCount,
                    })}
                  </p>
                ) : null}
              </div>
            </div>
            {isMe ? (
              <button
                type="button"
                onClick={() => setToCancel(live)}
                className={`${CREATE_SECONDARY} w-full md:w-auto`}
              >
                {t('live.schedule.cancel')}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => toggleReminder(live)}
                disabled={reminder.isPending}
                className={`${
                  live.reminded ? CREATE_SECONDARY : CREATE_PRIMARY
                } w-full md:w-auto`}
              >
                {live.reminded ? (
                  <Check size={18} aria-hidden />
                ) : (
                  <BellRing size={18} aria-hidden />
                )}
                {live.reminded
                  ? t('live.schedule.reminded')
                  : t('live.schedule.remind')}
              </button>
            )}
          </li>
        ))}
      </ul>
      <ConfirmModal
        isOpen={!!toCancel}
        onClose={() => setToCancel(null)}
        onConfirm={confirmCancel}
        title={t('live.schedule.cancel_confirm_title')}
        message={t('live.schedule.cancel_confirm_message')}
        confirmText={t('live.schedule.cancel_confirm')}
        cancelText={t('live.schedule.keep')}
        isDestructive
        isLoading={cancel.isPending}
      />
    </section>
  );
}
