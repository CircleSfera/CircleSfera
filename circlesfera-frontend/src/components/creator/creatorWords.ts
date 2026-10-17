import type { TFunction } from 'i18next';
import type { CreatorPost } from '../../services/creator.service';
import { formatNumber } from '../../utils/format';

// The facts of a post in words: who saw it and answered, then how it did
// against the profile's own average. A frame is named; a post is the default.
export function postFacts(
  post: CreatorPost,
  t: TFunction,
  language: string,
): string[] {
  const likes = post._count?.likes ?? 0;
  const comments = post._count?.comments ?? 0;
  const count = (key: string, value: number) =>
    t(key, { count: value, formatted: formatNumber(value, language) });
  return [
    [
      count('creator.post.views', post.views ?? 0),
      count('creator.post.likes', likes),
      count('creator.post.comments', comments),
    ].join(' · '),
    [
      post.type === 'FRAME' ? t('creator.post.frame') : '',
      againstAverage(post.performanceScore, t),
    ]
      .filter(Boolean)
      .join(' · '),
  ].filter(Boolean);
}

// The score is the interactions of the post as a percentage of the average of
// the profile: 100 is the average, so it is said as a distance from it.
export function againstAverage(score: number | undefined, t: TFunction) {
  if (score == null) return '';
  const distance = Math.round(score - 100);
  if (Math.abs(distance) < 5) return t('creator.post.at_average');
  return distance > 0
    ? t('creator.post.above_average', { value: distance })
    : t('creator.post.below_average', { value: -distance });
}

// The server names the day with a code. It is written here in the reader's
// language; a code it does not know is shown as it came.
const SERVER_DAYS = [
  'SUNDAY',
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
];

export function weekdayName(serverDay: string, language: string): string {
  const index = SERVER_DAYS.indexOf(serverDay);
  if (index < 0) return serverDay;
  // The 7th of January of 2024 was a Sunday.
  const name = new Date(Date.UTC(2024, 0, 7 + index)).toLocaleDateString(
    language,
    { weekday: 'long', timeZone: 'UTC' },
  );
  return name.charAt(0).toLocaleUpperCase(language) + name.slice(1);
}

// The server counts hours in universal time; the reader sees their own.
export function localHour(utcHour: number, language: string): string {
  const moment = new Date();
  moment.setUTCHours(utcHour, 0, 0, 0);
  return moment.toLocaleTimeString(language, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

// A day of a chart arrives as a date with no time, so it is written in
// universal time: in the reader's own, a day west of it would be the day before.
export function chartDay(value: string, long: boolean, language: string) {
  return new Date(value).toLocaleDateString(language, {
    day: 'numeric',
    month: long ? 'long' : 'short',
    timeZone: 'UTC',
  });
}

// A month of a chart arrives as year and month (2026-10).
export function chartMonth(value: string, long: boolean, language: string) {
  const moment = new Date(`${value}-01T00:00:00Z`);
  if (Number.isNaN(moment.getTime())) return value;
  return moment.toLocaleDateString(language, {
    month: long ? 'long' : 'short',
    year: long ? 'numeric' : undefined,
    timeZone: 'UTC',
  });
}
