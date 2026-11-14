import { useQuery } from '@tanstack/react-query';
import type { TFunction } from 'i18next';
import { Flag, Gavel, Scale, ShieldAlert } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  type ReviewAppeal,
  type ReviewEnforcementKind,
  type ReviewNotice,
  type ReviewReport,
  type ReviewStrike,
  reviewApi,
} from '../../../services/review.service';
import { formatDay } from '../../../utils/format';
import { AdminEmptyState } from '../AdminEmptyState';
import {
  ADMIN_PAGE_LIST_STATE,
  ADMIN_PAGE_ROW,
  AdminListRow,
} from '../AdminList';
import { AdminPageHeader } from '../AdminPageHeader';
import { AdminSegmentedControl } from '../AdminSegmentedControl';
import { AdminListSkeleton } from '../AdminSkeletons';
import { Pagination } from '../AdminTable';
import {
  ReviewFigure,
  ReviewIntro,
  total,
  useReviewSummary,
} from './ReviewShared';

const PAGE_SIZE = 20;

// A reviewer's view of how the rules are enforced, in the Admin Panel: the
// last weeks in figures, then every report, strike, appeal and notice of
// illegal content with its outcome. Read only; nobody who reported or
// notified is named, nothing anyone wrote is shown.
export default function ReviewComplianceTab() {
  const { t, i18n } = useTranslation();
  const [kind, setKind] = useState<ReviewEnforcementKind>('reports');
  const [page, setPage] = useState(1);
  const summary = useReviewSummary();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin', 'review', 'enforcement', kind, page],
    queryFn: () =>
      reviewApi
        .enforcement({ kind, page, limit: PAGE_SIZE })
        .then((res) => res.data),
  });

  const day = (value: string | null) =>
    value ? formatDay(value, i18n.language) : null;
  const hasRows = !isLoading && !isError && !!data?.data.length;
  const s = summary.data;

  const row = (item: ReviewEnforcementRow) => {
    switch (kind) {
      case 'reports': {
        const report = item as ReviewReport;
        return (
          <AdminListRow
            className={ADMIN_PAGE_ROW}
            key={report.id}
            title={t(`admin.review.report_reason.${report.reason}`, {
              defaultValue: report.reason,
            })}
            subtitle={t(`admin.review.target.${report.targetType}`, {
              defaultValue: report.targetType,
            })}
            badge={<StateBadge label={stateLabel(t, report.status)} />}
            meta={
              <>
                <span className="text-white/60">
                  {t('admin.review.received_on', {
                    date: day(report.createdAt),
                  })}
                </span>
                {report.resolvedAt && (
                  <span className="text-white/60">
                    {t('admin.review.decided_on', {
                      date: day(report.resolvedAt),
                    })}
                  </span>
                )}
                {report.urgent && (
                  <span className="font-semibold text-amber-400">
                    {t('admin.review.urgent')}
                  </span>
                )}
              </>
            }
          />
        );
      }
      case 'strikes': {
        const strike = item as ReviewStrike;
        return (
          <AdminListRow
            className={ADMIN_PAGE_ROW}
            key={strike.id}
            title={`@${strike.username}`}
            subtitle={t(`admin.review.report_reason.${strike.reason}`, {
              defaultValue: strike.reason,
            })}
            badge={
              <StateBadge
                label={t(`admin.review.strike_kind.${strike.kind}`, {
                  defaultValue: strike.kind,
                })}
              />
            }
            meta={
              <>
                <span className="text-white/80">
                  {t(`admin.review.consequence.${strike.consequence}`, {
                    defaultValue: strike.consequence,
                  })}
                </span>
                <span className="text-white/60">
                  {t('admin.review.given_on', { date: day(strike.createdAt) })}
                </span>
                <span className="text-white/60">
                  {strike.revokedAt
                    ? t('admin.review.revoked_on', {
                        date: day(strike.revokedAt),
                      })
                    : t('admin.review.expires_on', {
                        date: day(strike.expiresAt),
                      })}
                </span>
              </>
            }
          />
        );
      }
      case 'appeals': {
        const appeal = item as ReviewAppeal;
        return (
          <AdminListRow
            className={ADMIN_PAGE_ROW}
            key={appeal.id}
            title={t(`admin.review.appeal_target.${appeal.targetType}`, {
              defaultValue: appeal.targetType,
            })}
            badge={<StateBadge label={stateLabel(t, appeal.status)} />}
            meta={
              <>
                <span className="text-white/60">
                  {t('admin.review.received_on', {
                    date: day(appeal.createdAt),
                  })}
                </span>
                {appeal.resolvedAt && (
                  <span className="text-white/60">
                    {t('admin.review.decided_on', {
                      date: day(appeal.resolvedAt),
                    })}
                  </span>
                )}
              </>
            }
          />
        );
      }
      case 'notices': {
        const notice = item as ReviewNotice;
        return (
          <AdminListRow
            className={ADMIN_PAGE_ROW}
            key={notice.id}
            title={t('admin.review.notice_title')}
            subtitle={
              notice.childAbuse
                ? t('admin.review.notice_child_abuse')
                : undefined
            }
            badge={<StateBadge label={stateLabel(t, notice.status)} />}
            meta={
              <>
                <span className="text-white/60">
                  {t('admin.review.received_on', {
                    date: day(notice.createdAt),
                  })}
                </span>
                {notice.decidedAt && (
                  <span className="text-white/60">
                    {t('admin.review.decided_on', {
                      date: day(notice.decidedAt),
                    })}
                  </span>
                )}
              </>
            }
          />
        );
      }
    }
  };

  return (
    <div className="space-y-2.5">
      <AdminPageHeader
        title={t('admin.review.compliance_title')}
        subtitle={t('admin.review.compliance_subtitle')}
      />
      <ReviewIntro />

      {s && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-white">
            {t('admin.review.last_days', { count: s.days })}
          </h2>
          <div className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4">
            <ReviewFigure
              icon={Flag}
              label={t('admin.review.figure.reports')}
              value={total(s.reports)}
              hint={t('admin.review.figure.reports_hint', {
                count: total(s.reports, ['RESOLVED', 'REJECTED']),
              })}
            />
            <ReviewFigure
              icon={ShieldAlert}
              label={t('admin.review.figure.strikes')}
              value={total(s.strikes)}
              hint={t('admin.review.figure.strikes_hint', {
                count: total(s.strikes, ['SUSPENDED', 'BANNED']),
              })}
            />
            <ReviewFigure
              icon={Scale}
              label={t('admin.review.figure.appeals')}
              value={total(s.appeals)}
              hint={t('admin.review.figure.appeals_hint', {
                count: total(s.appeals, ['APPROVED']),
              })}
            />
            <ReviewFigure
              icon={Gavel}
              label={t('admin.review.figure.notices')}
              value={total(s.illegalContentNotices)}
              hint={t('admin.review.figure.notices_hint', {
                count: total(s.illegalContentNotices, ['ACTIONED']),
              })}
            />
          </div>
        </section>
      )}

      <AdminSegmentedControl
        value={kind}
        onChange={(value) => {
          setKind(value as ReviewEnforcementKind);
          setPage(1);
        }}
        options={[
          { value: 'reports', label: t('admin.review.tab.reports') },
          { value: 'strikes', label: t('admin.review.tab.strikes') },
          { value: 'appeals', label: t('admin.review.tab.appeals') },
          { value: 'notices', label: t('admin.review.tab.notices') },
        ]}
      />

      {/* Each row is a card of its own; a state with no rows gets one card. */}
      <div className={hasRows ? undefined : ADMIN_PAGE_LIST_STATE}>
        {isLoading ? (
          <AdminListSkeleton rows={6} />
        ) : isError || !data ? (
          <AdminEmptyState
            icon={ShieldAlert}
            title={t('admin.review.load_failed')}
          />
        ) : data.data.length === 0 ? (
          <AdminEmptyState icon={ShieldAlert} title={t('admin.review.empty')} />
        ) : (
          <div className="space-y-3">
            {(data.data as ReviewEnforcementRow[]).map(row)}
          </div>
        )}
      </div>

      {data && <Pagination meta={data.meta} onPageChange={setPage} />}
    </div>
  );
}

type ReviewEnforcementRow =
  | ReviewReport
  | ReviewStrike
  | ReviewAppeal
  | ReviewNotice;

function stateLabel(t: TFunction, state: string) {
  return t(`admin.review.state.${state}`, { defaultValue: state });
}

function StateBadge({ label }: { label: string }) {
  return (
    <div className="rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-xs font-bold text-white/80">
      {label}
    </div>
  );
}
