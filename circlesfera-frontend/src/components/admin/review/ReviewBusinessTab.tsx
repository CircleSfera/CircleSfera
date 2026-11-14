import { BadgeEuro, RotateCcw, ShieldAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ReviewSummary } from '../../../services/review.service';
import { formatCents } from '../../../utils/money';
import { AdminEmptyState } from '../AdminEmptyState';
import {
  ADMIN_PAGE_LIST_STATE,
  ADMIN_PAGE_ROW,
  AdminListRow,
} from '../AdminList';
import { AdminPageHeader } from '../AdminPageHeader';
import { AdminListSkeleton } from '../AdminSkeletons';
import {
  ReviewFigure,
  ReviewIntro,
  total,
  useReviewSummary,
} from './ReviewShared';

// The money a summary's payments moved, and gave back: the payments that
// were made, whatever happened after; not one still pending or that failed.
const MADE = ['COMPLETED', 'REFUNDED', 'DISPUTED'];
function moneyOf(summary: ReviewSummary) {
  const completed = summary.payments.filter((p) => MADE.includes(p.status));
  return {
    count: completed.reduce((sum, p) => sum + p.count, 0),
    amountCents: completed.reduce((sum, p) => sum + p.amountCents, 0),
    refundedCents: summary.payments.reduce(
      (sum, p) => sum + p.refundedCents,
      0,
    ),
  };
}

// A reviewer's view of the business, in the Backoffice: the money
// CircleSfera's sales moved. Read only.
export default function ReviewBusinessTab() {
  const { t, i18n } = useTranslation();
  const summary = useReviewSummary();
  const s = summary.data;
  const money = s && moneyOf(s);
  const euros = (cents: number) => formatCents(cents, i18n.language);

  return (
    <div className="space-y-2.5">
      <AdminPageHeader
        title={t('admin.review.business_title')}
        subtitle={t('admin.review.business_subtitle')}
      />
      <ReviewIntro />

      {s && money && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-white">
            {t('admin.review.last_days', { count: s.days })}
          </h2>
          <div className="grid grid-cols-2 gap-2 sm:gap-3">
            <ReviewFigure
              icon={BadgeEuro}
              label={t('admin.review.figure.payments')}
              value={euros(money.amountCents)}
              hint={t('admin.review.figure.payments_hint', {
                count: money.count,
              })}
            />
            <ReviewFigure
              icon={RotateCcw}
              label={t('admin.review.figure.refunds_disputes')}
              value={euros(money.refundedCents)}
              hint={t('admin.review.figure.disputes_hint', {
                count: total(s.disputes),
              })}
            />
          </div>
        </section>
      )}

      <Payments summary={s} isError={summary.isError} />
    </div>
  );
}

// The last weeks of payments by kind and state, in totals: no payer, no
// payment of anyone in particular.
function Payments({
  summary,
  isError,
}: {
  summary: ReviewSummary | undefined;
  isError: boolean;
}) {
  const { t, i18n } = useTranslation();
  const rows = summary?.payments ?? [];

  if (isError) {
    return (
      <div className={ADMIN_PAGE_LIST_STATE}>
        <AdminEmptyState
          icon={ShieldAlert}
          title={t('admin.review.load_failed')}
        />
      </div>
    );
  }
  if (!summary) {
    return (
      <div className={ADMIN_PAGE_LIST_STATE}>
        <AdminListSkeleton rows={4} />
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <div className={ADMIN_PAGE_LIST_STATE}>
        <AdminEmptyState icon={BadgeEuro} title={t('admin.review.empty')} />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <AdminListRow
          className={ADMIN_PAGE_ROW}
          key={`${row.type}-${row.status}`}
          title={t(`admin.review.payment_type.${row.type}`, {
            defaultValue: row.type,
          })}
          subtitle={t('admin.review.payments_count', { count: row.count })}
          badge={
            <div className="rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-xs font-bold text-white/80">
              {t(`admin.review.state.${row.status}`, {
                defaultValue: row.status,
              })}
            </div>
          }
          meta={
            <>
              <span className="font-semibold tabular-nums text-white">
                {formatCents(row.amountCents, i18n.language)}
              </span>
              {row.refundedCents > 0 && (
                <span className="text-white/60">
                  {t('admin.review.refunded', {
                    amount: formatCents(row.refundedCents, i18n.language),
                  })}
                </span>
              )}
            </>
          }
        />
      ))}
    </div>
  );
}
