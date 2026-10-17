import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Image as ImageIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { CreatorPost } from '../../services/creator.service';
import { creatorApi } from '../../services/creator.service';
import type { PaginatedResponse, Post } from '../../types';
import { formatWholeEuros } from '../../utils/money';
import { WithdrawalConsentBox } from '../payments/WithdrawalConsent';
import { Button } from '../ui';
import { Dialog } from '../ui/Dialog';
import CountryPicker from './CountryPicker';
import { CreatorViewChoice } from './CreatorPieces';
import { postFacts } from './creatorWords';

// What can be spent each day and for how long: fixed choices, in euros.
const DAILY_BUDGETS = [5, 10, 25, 50] as const;
const DURATIONS = [3, 7, 14, 30] as const;

interface Props {
  // The post to promote. Without one, choosing it is the first step.
  post?: CreatorPost | Post;
  onClose: () => void;
  onToast: (msg: string, type: 'success' | 'error') => void;
}

function Thumbnail({ url }: { url?: string }) {
  return (
    <span className="w-14 h-14 rounded-lg overflow-hidden shrink-0 bg-surface-raised border border-white/10 text-white/40 flex items-center justify-center">
      {url ? (
        <img src={url} alt="" className="w-full h-full object-cover" />
      ) : (
        <ImageIcon size={18} aria-hidden />
      )}
    </span>
  );
}

// A campaign for one post: which post, how much each day, for how long and,
// if wanted, where. Paying happens at the checkout it leads to.
export default function PromoteModal({ post, onClose, onToast }: Props) {
  const { t, i18n } = useTranslation();
  const language = i18n.language;
  const queryClient = useQueryClient();

  const [chosen, setChosen] = useState<CreatorPost | Post | null>(post ?? null);
  const [dailyBudget, setDailyBudget] = useState<number>(DAILY_BUDGETS[0]);
  const [durationDays, setDurationDays] = useState<number>(DURATIONS[1]);
  const [countries, setCountries] = useState<string[]>([]);

  const { data: posts, isLoading: loadingPosts } = useQuery<
    PaginatedResponse<CreatorPost>
  >({
    queryKey: ['creator', 'posts', 'promo-select'],
    queryFn: () => creatorApi.getPosts(1, 20).then((r) => r.data),
    enabled: !post,
  });

  // Paying needs the consent to start at once and the acknowledgement of
  // losing the withdrawal right; the button waits for the box.
  const [withdrawalConsent, setWithdrawalConsent] = useState(false);
  const mutation = useMutation({
    mutationFn: (target: CreatorPost | Post) =>
      creatorApi.createPromotion({
        withdrawalConsent: true,
        targetType: target.type?.toLowerCase() === 'frame' ? 'frame' : 'post',
        targetId: target.id,
        dailyBudget,
        durationDays,
        currency: 'EUR',
        countries: countries.length ? countries : undefined,
      }),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['creator', 'promotions'] });
      const url = response.data?.url;
      if (!url) {
        onToast(t('creator.promotions.error_create'), 'error');
        return;
      }
      onToast(t('creator.promotions.redirecting'), 'success');
      window.location.href = url;
    },
    onError: () => onToast(t('creator.promotions.error_create'), 'error'),
  });

  const total = formatWholeEuros(dailyBudget * durationDays, language);
  const titleOf = (item: CreatorPost | Post) =>
    item.caption || t('creator.post.untitled');

  return (
    <Dialog
      isOpen
      onClose={onClose}
      title={
        chosen ? t('creator.promote.title') : t('creator.promote.choose_title')
      }
      maxWidth="md"
      className="max-h-[90vh]"
    >
      {chosen ? (
        <div className="space-y-5">
          <div className="flex items-center gap-3">
            <Thumbnail url={chosen.media?.[0]?.url} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">
                {titleOf(chosen)}
              </p>
              {post ? null : (
                <button
                  type="button"
                  onClick={() => setChosen(null)}
                  className="min-h-11 -my-2 text-sm text-brand-primary-text hover:text-white transition-colors"
                >
                  {t('creator.promote.change_post')}
                </button>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm text-white/70">
              {t('creator.promote.daily_budget')}
            </p>
            <CreatorViewChoice
              wrap
              label={t('creator.promote.daily_budget')}
              items={DAILY_BUDGETS.map((value) => ({
                value: String(value),
                label: formatWholeEuros(value, language),
              }))}
              value={String(dailyBudget)}
              onChange={(value) => setDailyBudget(Number(value))}
            />
          </div>

          <div className="space-y-2">
            <p className="text-sm text-white/70">
              {t('creator.promote.duration')}
            </p>
            <CreatorViewChoice
              wrap
              label={t('creator.promote.duration')}
              items={DURATIONS.map((value) => ({
                value: String(value),
                label: t('creator.promote.days', { count: value }),
              }))}
              value={String(durationDays)}
              onChange={(value) => setDurationDays(Number(value))}
            />
          </div>

          <div className="space-y-2">
            <label
              htmlFor="promote-countries"
              className="text-sm text-white/70"
            >
              {t('creator.promote.countries')}
            </label>
            <CountryPicker
              id="promote-countries"
              value={countries}
              onChange={setCountries}
              describedBy="promote-countries-hint"
            />
            <p
              id="promote-countries-hint"
              className="text-xs text-white/50 leading-relaxed"
            >
              {t('creator.promote.countries_hint')}
            </p>
          </div>

          <div className="pt-4 border-t border-white/10 space-y-3">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm text-white/70">
                {t('creator.promote.total')}
              </span>
              <span className="text-2xl font-semibold text-white tabular-nums tracking-tight">
                {total}
              </span>
            </div>
            <p className="text-xs text-white/50 leading-relaxed">
              {t('creator.promote.total_hint', { count: durationDays })}
            </p>
            <WithdrawalConsentBox
              checked={withdrawalConsent}
              onChange={setWithdrawalConsent}
            />
            <Button
              variant="primary"
              size="lg"
              className="button-alone min-h-12"
              disabled={!withdrawalConsent}
              onClick={() => {
                if (withdrawalConsent) mutation.mutate(chosen);
              }}
              isLoading={mutation.isPending}
            >
              {t('creator.promote.pay', { total })}
            </Button>
            <p className="text-center text-xs text-white/50">
              {t('creator.promote.terms')}
            </p>
          </div>
        </div>
      ) : loadingPosts ? (
        <div className="space-y-2" data-testid="promote-loading">
          {['a', 'b', 'c'].map((id) => (
            <div
              key={id}
              className="h-16 rounded-lg bg-white/5 animate-pulse"
            />
          ))}
        </div>
      ) : posts?.data?.length ? (
        <ul className="-mx-2 space-y-1">
          {posts.data.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => setChosen(item)}
                className="w-full flex items-center gap-3 p-2 rounded-xl text-left hover:bg-white/5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/50"
              >
                <Thumbnail url={item.media?.[0]?.url} />
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-medium text-white truncate">
                    {titleOf(item)}
                  </span>
                  <span className="block mt-0.5 text-xs text-white/60 truncate">
                    {postFacts(item, t, language)[0]}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="py-8 text-center text-sm text-white/60">
          {t('creator.promote.no_posts')}
        </p>
      )}
    </Dialog>
  );
}
