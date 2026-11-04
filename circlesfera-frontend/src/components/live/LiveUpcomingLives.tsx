import { CalendarClock } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import {
  useCancelScheduledLive,
  useScheduledLives,
} from '../../hooks/useScheduledLives';
import type { ScheduledLive } from '../../services/live';
import { apiErrorMessage } from '../../utils/apiErrorMessage';
import { formatLiveStart } from '../../utils/liveSchedule';
import { CREATE_PRIMARY, CREATE_SECONDARY } from '../create-post/createStyles';
import ConfirmModal from '../modals/ConfirmModal';
import { LiveSheet } from './LivePieces';

/**
 * The host's upcoming lives, on the setup: a button under the host's name
 * says how many there are, and opens them in a sheet. Each one goes live
 * now, with its own title and audience, or is cancelled after a
 * confirmation. Shown only on the setup, so nothing is asked once on air.
 */
export default function LiveUpcomingLives({
  profileId,
  isOpen,
  onOpen,
  onClose,
  onStart,
  startingId,
}: {
  profileId?: string | null;
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
  onStart: (live: ScheduledLive) => void;
  // The live being started, while the server answers.
  startingId: string | null;
}) {
  const { t, i18n } = useTranslation();
  const [toCancel, setToCancel] = useState<ScheduledLive | null>(null);
  const { data: lives = [] } = useScheduledLives(profileId);
  const cancel = useCancelScheduledLive();

  if (lives.length === 0) return null;

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
    <>
      {/* Under the host's name, clear of the controls on the right. */}
      <div className="pointer-events-none absolute top-[calc(var(--live-top)+2.75rem)] right-[calc(var(--live-side)+3.5rem)] left-(--live-side) z-50 flex">
        <button
          type="button"
          onClick={onOpen}
          aria-expanded={isOpen}
          className="live-glass pointer-events-auto flex min-h-11 min-w-0 items-center gap-2 rounded-full px-4 text-sm font-semibold text-white hover:bg-white/15"
        >
          <CalendarClock size={18} className="shrink-0" aria-hidden />
          <span className="truncate">
            {t('live.schedule.upcoming_button', { count: lives.length })}
          </span>
        </button>
      </div>
      <LiveSheet
        isOpen={isOpen && !toCancel}
        onClose={onClose}
        title={t('live.schedule.upcoming_title')}
        icon={<CalendarClock size={20} className="shrink-0" aria-hidden />}
      >
        {/* The sheet is the one surface: its lives are rows, not boxes. */}
        <ul className="flex flex-col divide-y divide-white/10 pb-2">
          {lives.map((live) => (
            <li key={live.id} className="flex flex-col gap-3 py-4 first:pt-1">
              <div className="min-w-0">
                <p className="line-clamp-2 text-base font-semibold text-white">
                  {live.title}
                </p>
                <p className="mt-1 text-sm text-white/75">
                  <time dateTime={live.startsAt}>
                    {formatLiveStart(live.startsAt, i18n.language)}
                  </time>
                  {' · '}
                  {t(`live.audience.${live.audience}`)}
                </p>
                {live.reminderCount !== undefined ? (
                  <p className="mt-1 text-xs text-white/70">
                    {t('live.schedule.reminders', {
                      count: live.reminderCount,
                    })}
                  </p>
                ) : null}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => onStart(live)}
                  disabled={startingId !== null}
                  className={`${CREATE_PRIMARY} flex-1 px-4`}
                >
                  {startingId === live.id
                    ? t('live.starting')
                    : t('live.schedule.start_now')}
                </button>
                <button
                  type="button"
                  onClick={() => setToCancel(live)}
                  disabled={startingId !== null}
                  className={`${CREATE_SECONDARY} flex-1 px-4`}
                >
                  {t('live.schedule.cancel')}
                </button>
              </div>
            </li>
          ))}
        </ul>
      </LiveSheet>
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
    </>
  );
}
