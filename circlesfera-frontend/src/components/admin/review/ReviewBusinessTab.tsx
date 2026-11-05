import { useQuery } from '@tanstack/react-query';
import {
  BadgeEuro,
  ImageIcon,
  RotateCcw,
  ShieldAlert,
  Users,
} from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  type ReviewCreator,
  type ReviewPaidItem,
  type ReviewSummary,
  reviewApi,
} from '../../../services/review.service';
import { formatDay } from '../../../utils/format';
import { formatCents } from '../../../utils/money';
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

type View = 'posts' | 'stories' | 'creators' | 'payments';

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

// A reviewer's view of the business, in the Backoffice: what is sold, who
// sells it and the money it moved. Read only. A paid post or story is shown
// with its files, unbought; creators by public username only.
export default function ReviewBusinessTab() {
  const { t, i18n } = useTranslation();
  const [view, setView] = useState<View>('posts');
  const [page, setPage] = useState(1);
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
            {t('admin.review.on_sale_and_last_days', { count: s.days })}
          </h2>
          <div className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4">
            <ReviewFigure
              icon={ImageIcon}
              label={t('admin.review.figure.on_sale')}
              value={s.paidPostsOnSale + s.paidStoriesOnSale}
              hint={t('admin.review.figure.on_sale_hint', {
                posts: s.paidPostsOnSale,
                stories: s.paidStoriesOnSale,
              })}
            />
            <ReviewFigure
              icon={Users}
              label={t('admin.review.figure.charging_accounts')}
              value={s.chargingAccounts}
            />
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

      <AdminSegmentedControl
        value={view}
        onChange={(value) => {
          setView(value as View);
          setPage(1);
        }}
        options={[
          { value: 'posts', label: t('admin.review.tab.paid_posts') },
          { value: 'stories', label: t('admin.review.tab.paid_stories') },
          { value: 'creators', label: t('admin.review.tab.creators') },
          { value: 'payments', label: t('admin.review.tab.payments') },
        ]}
      />

      {view === 'posts' || view === 'stories' ? (
        <PaidContent
          kind={view === 'posts' ? 'post' : 'story'}
          page={page}
          onPage={setPage}
        />
      ) : view === 'creators' ? (
        <Creators page={page} onPage={setPage} />
      ) : (
        <Payments summary={s} isError={summary.isError} />
      )}
    </div>
  );
}

function PaidContent({
  kind,
  page,
  onPage,
}: {
  kind: 'post' | 'story';
  page: number;
  onPage: (page: number) => void;
}) {
  const { t, i18n } = useTranslation();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin', 'review', 'paid-content', kind, page],
    queryFn: () =>
      reviewApi
        .paidContent({ kind, page, limit: PAGE_SIZE })
        .then((res) => res.data),
  });
  const hasRows = !isLoading && !isError && !!data?.data.length;

  return (
    <>
      <div className={hasRows ? undefined : ADMIN_PAGE_LIST_STATE}>
        {isLoading ? (
          <AdminListSkeleton rows={4} />
        ) : isError || !data ? (
          <AdminEmptyState
            icon={ShieldAlert}
            title={t('admin.review.load_failed')}
          />
        ) : data.data.length === 0 ? (
          <AdminEmptyState
            icon={ImageIcon}
            title={t('admin.review.empty_paid')}
          />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {data.data.map((item) => (
              <PaidCard key={item.id} item={item} language={i18n.language} />
            ))}
          </ul>
        )}
      </div>
      {data && <Pagination meta={data.meta} onPageChange={onPage} />}
    </>
  );
}

// One paid post or story: its first file, as large as the card, then what
// it costs, who sells it, for whom, and how often it sold.
function PaidCard({
  item,
  language,
}: {
  item: ReviewPaidItem;
  language: string;
}) {
  const { t } = useTranslation();
  const first = item.media[0];
  const more = item.media.length - 1;

  return (
    <li className="glass-panel overflow-hidden rounded-lg">
      <div className="relative aspect-4/5 w-full bg-black/40">
        {!first ? null : first.type === 'video' ? (
          <video
            src={first.url}
            poster={first.thumbnailUrl ?? undefined}
            controls
            preload="none"
            className="h-full w-full object-contain"
          >
            <track kind="captions" />
          </video>
        ) : (
          <img
            src={first.thumbnailUrl ?? first.url}
            alt={item.caption ?? t('admin.review.paid_media_alt')}
            loading="lazy"
            className="h-full w-full object-contain"
          />
        )}
        {more > 0 && (
          <span className="absolute right-2 top-2 rounded-full bg-black/70 px-2 py-0.5 text-xs font-semibold text-white">
            {t('admin.review.more_files', { count: more })}
          </span>
        )}
      </div>
      <div className="space-y-1 p-3 text-sm">
        <p className="flex items-center justify-between gap-2">
          <span className="text-base font-bold tabular-nums text-white">
            {formatCents(item.priceCents, language)}
          </span>
          <span className="rounded-full border border-white/20 bg-white/10 px-2.5 py-0.5 text-xs font-bold text-white/80">
            {t(`admin.review.audience.${item.audience}`, {
              defaultValue: item.audience,
            })}
          </span>
        </p>
        <p className="font-semibold text-white">@{item.creator.username}</p>
        {item.caption && (
          <p className="line-clamp-2 text-white/70">{item.caption}</p>
        )}
        <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-white/60">
          <span>{t('admin.review.sales', { count: item.sales })}</span>
          <span>{formatDay(item.createdAt, language)}</span>
          {item.moderationStatus === 'FLAGGED' && (
            <span className="font-semibold text-amber-400">
              {t('admin.review.state.FLAGGED')}
            </span>
          )}
        </p>
      </div>
    </li>
  );
}

function Creators({
  page,
  onPage,
}: {
  page: number;
  onPage: (page: number) => void;
}) {
  const { t, i18n } = useTranslation();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin', 'review', 'creators', page],
    queryFn: () =>
      reviewApi.creators({ page, limit: PAGE_SIZE }).then((res) => res.data),
  });
  const hasRows = !isLoading && !isError && !!data?.data.length;

  const standing = (creator: ReviewCreator) =>
    creator.standing === 'ACTIVE'
      ? 'border-white/20 bg-white/10 text-white/80'
      : 'border-amber-400/20 bg-amber-400/10 text-amber-400';

  return (
    <>
      <div className={hasRows ? undefined : ADMIN_PAGE_LIST_STATE}>
        {isLoading ? (
          <AdminListSkeleton rows={6} />
        ) : isError || !data ? (
          <AdminEmptyState
            icon={ShieldAlert}
            title={t('admin.review.load_failed')}
          />
        ) : data.data.length === 0 ? (
          <AdminEmptyState icon={Users} title={t('admin.review.empty')} />
        ) : (
          <div className="space-y-3">
            {data.data.map((creator) => (
              <AdminListRow
                className={ADMIN_PAGE_ROW}
                key={creator.username}
                title={`@${creator.username}`}
                subtitle={t(
                  `admin.review.account_type.${creator.accountType}`,
                  {
                    defaultValue: creator.accountType,
                  },
                )}
                badge={
                  <div
                    className={`rounded-full border px-2.5 py-1 text-xs font-bold ${standing(creator)}`}
                  >
                    {t(`admin.review.standing.${creator.standing}`)}
                  </div>
                }
                meta={
                  <>
                    <span className="text-white/80">
                      {t('admin.review.creator_paid', {
                        count: creator.completedPayments,
                        amount: formatCents(creator.grossCents, i18n.language),
                      })}
                    </span>
                    <span className="text-white/60">
                      {t('admin.review.creator_on_sale', {
                        count: creator.paidPostsOnSale,
                      })}
                    </span>
                    <span
                      className={
                        creator.activeStrikes > 0
                          ? 'font-semibold text-amber-400'
                          : 'text-white/60'
                      }
                    >
                      {t('admin.review.active_strikes', {
                        count: creator.activeStrikes,
                      })}
                    </span>
                  </>
                }
              />
            ))}
          </div>
        )}
      </div>
      {data && <Pagination meta={data.meta} onPageChange={onPage} />}
    </>
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
