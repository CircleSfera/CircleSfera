import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { creatorApi } from '../../services/creator.service';
import { formatNumber } from '../../utils/format';
import CreatorTrendChart from '../creator/CreatorTrendChart';
import { chartDay } from '../creator/creatorWords';
import { Dialog } from '../ui/Dialog';

interface Props {
  postId: string;
  onClose: () => void;
}

// A length of time in the largest two units that say something.
function duration(seconds: number): string {
  const whole = Math.round(seconds);
  if (whole < 60) return `${whole} s`;
  const minutes = Math.floor(whole / 60);
  if (minutes < 60) return `${minutes} min ${whole % 60} s`;
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

// What one post has been seen and answered: its figures and its views by day.
export default function PostInsightsModal({ postId, onClose }: Props) {
  const { t, i18n } = useTranslation();
  const language = i18n.language;
  const {
    data: insights,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['post-insights', postId],
    queryFn: () => creatorApi.getPostInsights(postId).then((r) => r.data),
  });

  const post = insights?.post;
  const number = (value: number | undefined) =>
    formatNumber(value ?? 0, language);
  const figures: [string, string][] = post
    ? [
        ['modals.insights.views', number(post.views)],
        ['modals.insights.impressions', number(post.impressions)],
        ['modals.insights.likes', number(post._count?.likes)],
        ['modals.insights.comments', number(post._count?.comments)],
        ['modals.insights.saves', number(post._count?.bookmarks)],
        ['modals.insights.shares', number(post.shares)],
        ['modals.insights.watched', duration(post.totalDwellTime ?? 0)],
        [
          'modals.insights.interaction',
          `${(post.conversionRate ?? 0).toLocaleString(language, {
            maximumFractionDigits: 1,
          })} %`,
        ],
      ]
    : [];

  return (
    <Dialog
      isOpen
      onClose={onClose}
      title={t('modals.insights.title')}
      maxWidth="xl"
      className="max-h-[90vh]"
    >
      {isLoading ? (
        <div className="space-y-4 animate-pulse" data-testid="insights-loading">
          <div className="h-32 rounded-xl bg-white/5" />
          <div className="h-52 rounded-xl bg-white/5" />
        </div>
      ) : isError || !post ? (
        <p className="py-8 text-center text-sm text-white/60">
          {t('modals.insights.error')}
        </p>
      ) : (
        <div className="space-y-6">
          {post.caption ? (
            <p className="text-sm text-white/70 line-clamp-2">{post.caption}</p>
          ) : null}

          <div className="space-y-3">
            <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-4">
              {figures.map(([key, value]) => (
                <div key={key}>
                  <dt className="text-xs text-white/60">{t(key)}</dt>
                  <dd className="mt-0.5 text-lg font-semibold text-white tabular-nums">
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="text-xs text-white/50 leading-relaxed">
              {t('modals.insights.interaction_hint')}
            </p>
          </div>

          <section className="pt-4 border-t border-white/10">
            <h3 className="mb-3 text-sm font-semibold text-white">
              {t('modals.insights.by_day')}
            </h3>
            <CreatorTrendChart
              bare
              data={insights?.chart ?? []}
              xKey="date"
              series={[
                {
                  key: 'views',
                  name: t('modals.insights.views'),
                  color: 'var(--color-brand-primary)',
                },
              ]}
              formatX={(value, long) => chartDay(value, long, language)}
              fewText={t('modals.insights.not_enough_data')}
            />
          </section>
        </div>
      )}
    </Dialog>
  );
}
