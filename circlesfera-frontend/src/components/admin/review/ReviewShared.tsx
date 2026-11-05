import { useQuery } from '@tanstack/react-query';
import { Eye, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { reviewApi } from '../../../services/review.service';
import { useAdminAuthStore } from '../../../stores/adminAuthStore';
import { platformOrigin } from '../../../utils/adminPanel';
import { formatDay } from '../../../utils/format';

// The public rules the review area points to, on the participant site.
const POLICY_LINKS = [
  { key: 'terms', path: '/terms' },
  { key: 'guidelines', path: '/guidelines' },
  { key: 'illegal_content', path: '/report-illegal-content' },
] as const;

// The summary both review sections start from.
export function useReviewSummary() {
  return useQuery({
    queryKey: ['admin', 'review', 'summary'],
    queryFn: () => reviewApi.summary().then((res) => res.data),
  });
}

// The sum of a set of counts by state, or of the states named.
export function total(
  counts: Record<string, number> | undefined,
  states?: readonly string[],
): number {
  return Object.entries(counts ?? {})
    .filter(([state]) => !states || states.includes(state))
    .reduce((sum, [, count]) => sum + count, 0);
}

// One figure of the review: what it counts, the number, and what it means.
export function ReviewFigure({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  hint?: string;
}) {
  return (
    <div className="glass-panel flex min-h-20 flex-col justify-between gap-1.5 rounded-lg p-3">
      <span className="flex min-w-0 items-start gap-2 text-sm font-medium text-white/70">
        <Icon
          size={16}
          className="mt-0.5 shrink-0 text-brand-primary-text"
          aria-hidden="true"
        />
        <span className="leading-tight">{label}</span>
      </span>
      <span className="block text-xl font-bold tabular-nums leading-tight text-white">
        {value}
      </span>
      {hint && <span className="text-xs text-white/50">{hint}</span>}
    </div>
  );
}

// What the reviewer reads first: the area is read only, it names nobody
// beyond a public username, every page opened is written down, and when the
// access ends. Then the public rules being checked.
export function ReviewIntro() {
  const { t, i18n } = useTranslation();
  const admin = useAdminAuthStore((s) => s.admin);
  const origin = platformOrigin();

  return (
    <section
      aria-label={t('admin.review.intro_label')}
      className="glass-panel space-y-2 rounded-lg p-3 text-sm text-white/70"
    >
      <p className="flex items-start gap-2">
        <Eye
          size={16}
          className="mt-0.5 shrink-0 text-brand-primary-text"
          aria-hidden="true"
        />
        <span>{t('admin.review.read_only')}</span>
      </p>
      {admin?.externalReviewer && admin.accessExpiresAt && (
        <p className="text-white/60">
          {t('admin.review.access_until', {
            date: formatDay(admin.accessExpiresAt, i18n.language),
          })}
        </p>
      )}
      <ul className="flex flex-wrap gap-x-4 gap-y-1">
        {POLICY_LINKS.map((link) => (
          <li key={link.key}>
            <a
              href={`${origin}${link.path}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center font-semibold text-white/80 underline-offset-2 hover:text-white hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30 sm:min-h-9"
            >
              {t(`admin.review.policy.${link.key}`)}
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
