import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

/** Days, hours, minutes and seconds left until a moment, never below zero. */
export function timeLeft(endsAt: string, now: number) {
  const ms = Math.max(0, new Date(endsAt).getTime() - now);
  const s = Math.floor(ms / 1000);
  return {
    done: ms === 0,
    days: Math.floor(s / 86_400),
    hours: Math.floor((s % 86_400) / 3600),
    minutes: Math.floor((s % 3600) / 60),
    seconds: s % 60,
  };
}

/** The time now, again every second. */
export function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

/** The time left of a countdown, counting down live, or that it has ended. */
export function CountdownClock({ endsAt }: { endsAt: string }) {
  const { t } = useTranslation();
  const left = timeLeft(endsAt, useNow());

  if (left.done) {
    return (
      <p className="text-center text-sm font-bold text-white">
        {t('interactive.countdown.ended')}
      </p>
    );
  }
  const parts = [
    [left.days, t('interactive.countdown.days')],
    [left.hours, t('interactive.countdown.hours')],
    [left.minutes, t('interactive.countdown.minutes')],
    [left.seconds, t('interactive.countdown.seconds')],
  ] as const;
  return (
    <div className="grid grid-cols-4 gap-1.5" role="timer">
      {parts.map(([value, unit]) => (
        <div
          key={unit}
          className="rounded-xl border border-white/15 bg-surface-high py-1.5 text-center"
        >
          <span className="block text-lg font-black tabular-nums leading-tight text-white">
            {String(value).padStart(2, '0')}
          </span>
          <span className="block text-[10px] font-semibold uppercase tracking-wider text-white/55">
            {unit}
          </span>
        </div>
      ))}
    </div>
  );
}
