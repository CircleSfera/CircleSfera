import {
  LIVE_SCHEDULE_MAX_DAYS,
  LIVE_SCHEDULE_MIN_MINUTES,
  type LiveAudience,
  type LiveScheduleAudience,
} from '@circlesfera/shared';
import { CalendarClock } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useScheduleLive } from '../../hooks/useScheduledLives';
import type { ScheduledLive } from '../../services/live';
import { apiErrorMessage } from '../../utils/apiErrorMessage';
import {
  fromLocalInputValue,
  type LiveScheduleProblem,
  liveScheduleBounds,
  liveScheduleProblem,
  offeredLiveStart,
  toLocalInputValue,
} from '../../utils/liveSchedule';
import { CREATE_PRIMARY } from '../create-post/createStyles';
import { LiveSheet } from './LivePieces';

const PROBLEM_KEYS: Record<LiveScheduleProblem, string> = {
  missing: 'live.schedule.error_missing',
  too_soon: 'live.schedule.error_too_soon',
  too_far: 'live.schedule.error_too_far',
};

/**
 * Scheduling the live being set up: a date and time between the earliest
 * and the furthest allowed, with the title and the audience chosen on the
 * setup. A practice has no audience, so it is never scheduled: the sheet
 * says so instead.
 */
export default function LiveScheduleSheet({
  isOpen,
  onClose,
  title,
  audience,
  onScheduled,
}: {
  isOpen: boolean;
  onClose: () => void;
  // The title as it will be used: the setup's own, or the default one.
  title: string;
  audience: LiveAudience;
  onScheduled: (live: ScheduledLive) => void;
}) {
  const { t } = useTranslation();
  const fieldId = useId();
  const hintId = useId();
  const [value, setValue] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  // The limits are read again each time the sheet opens.
  const [bounds, setBounds] = useState(() => liveScheduleBounds());
  const schedule = useScheduleLive();

  useEffect(() => {
    if (!isOpen) return;
    setBounds(liveScheduleBounds());
    setValue(toLocalInputValue(offeredLiveStart()));
    setProblem(null);
  }, [isOpen]);

  const practice = audience === 'PRACTICE';

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (practice) return;
    const startsAt = fromLocalInputValue(value);
    const found = liveScheduleProblem(startsAt);
    if (found || !startsAt) {
      setProblem(
        t(PROBLEM_KEYS[found ?? 'missing'], {
          min: LIVE_SCHEDULE_MIN_MINUTES,
          days: LIVE_SCHEDULE_MAX_DAYS,
        }),
      );
      return;
    }
    setProblem(null);
    schedule.mutate(
      {
        title,
        audience: audience as LiveScheduleAudience,
        startsAt: startsAt.toISOString(),
      },
      {
        onSuccess: onScheduled,
        onError: (error) =>
          setProblem(apiErrorMessage(error, t, 'live.schedule.failed')),
      },
    );
  };

  return (
    <LiveSheet
      isOpen={isOpen}
      onClose={onClose}
      title={t('live.schedule.sheet_title')}
      icon={<CalendarClock size={20} className="shrink-0" aria-hidden />}
    >
      {practice ? (
        <p className="pb-2 text-sm text-white/80">
          {t('live.schedule.practice_hint')}
        </p>
      ) : (
        // The limits are told in the app's own words, not the browser's.
        <form
          onSubmit={handleSubmit}
          noValidate
          className="flex flex-col gap-3 pb-2"
        >
          <p className="text-sm text-white/80">
            {t(`live.schedule.summary_${audience}`, { title })}
          </p>
          <div className="flex flex-col gap-2">
            <label
              htmlFor={fieldId}
              className="text-sm font-semibold text-white"
            >
              {t('live.schedule.when_label')}
            </label>
            <input
              id={fieldId}
              type="datetime-local"
              required
              value={value}
              min={toLocalInputValue(bounds.min)}
              max={toLocalInputValue(bounds.max)}
              onChange={(event) => {
                setValue(event.target.value);
                setProblem(null);
              }}
              aria-describedby={hintId}
              aria-invalid={problem ? true : undefined}
              className="min-h-12 w-full rounded-2xl border border-white/15 bg-white/10 px-4 text-base text-white outline-none focus:border-white/40"
            />
            <p id={hintId} className="text-xs text-white/70">
              {t('live.schedule.limits_hint', {
                min: LIVE_SCHEDULE_MIN_MINUTES,
                days: LIVE_SCHEDULE_MAX_DAYS,
              })}
            </p>
          </div>
          {problem ? (
            <p role="alert" className="text-sm font-semibold text-red-300">
              {problem}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={schedule.isPending}
            className={`${CREATE_PRIMARY} w-full`}
          >
            {schedule.isPending
              ? t('live.schedule.submitting')
              : t('live.schedule.submit')}
          </button>
        </form>
      )}
    </LiveSheet>
  );
}
