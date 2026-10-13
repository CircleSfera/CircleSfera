import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence } from 'framer-motion';
import {
  Image as ImageIcon,
  Megaphone,
  Pause,
  Play,
  Plus,
  RefreshCw,
  XCircle,
} from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  CancelPromotionResult,
  CreatorPromotion,
} from '../../services/creator.service';
import { creatorApi } from '../../services/creator.service';
import type { PaginatedResponse } from '../../types';
import { formatDate, formatNumber } from '../../utils/format';
import { formatCents } from '../../utils/money';
import { Button, Dialog } from '../ui';
import CreatorEmpty from './CreatorEmpty';
import { CreatorBadge, CreatorPager, CreatorRow } from './CreatorPieces';
import PromoteModal from './PromoteModal';

function computeProgress(startDate: string, endDate: string): number {
  const start = new Date(startDate).getTime();
  const end = new Date(endDate).getTime();
  const now = Date.now();
  if (now >= end) return 100;
  if (now <= start) return 0;
  return Math.round(((now - start) / (end - start)) * 100);
}

function computeDaysLeft(endDate: string): number {
  return Math.max(
    0,
    Math.ceil((new Date(endDate).getTime() - Date.now()) / 86_400_000),
  );
}

function redirectToCheckout(url: string | null | undefined) {
  if (!url) {
    throw new Error('Missing checkout URL');
  }
  window.location.href = url;
}

function isActiveStatus(status: string) {
  return [
    'ACTIVE',
    'PENDING',
    'PAUSED',
    'active',
    'pending',
    'paused',
  ].includes(status);
}

// The states the server keeps, each with its words. A state it does not know
// is shown as finished: it is not running.
const STATES = [
  'PENDING',
  'ACTIVE',
  'PAUSED',
  'COMPLETED',
  'CANCELLED',
  'REJECTED',
  'FAILED',
];

function stateOf(status: string): string {
  const upper = status.toUpperCase();
  return STATES.includes(upper) ? upper : 'COMPLETED';
}

interface Props {
  onToast: (msg: string, type: 'success' | 'error' | 'info') => void;
}

export default function CreatorPromotionsTab({ onToast }: Props) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [showNewPromo, setShowNewPromo] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data, isLoading } = useQuery<PaginatedResponse<CreatorPromotion>>({
    queryKey: ['creator', 'promotions', page],
    queryFn: () => creatorApi.getPromotions(page, 10).then((r) => r.data),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) =>
      creatorApi.cancelPromotion(id).then((r) => r.data),
    onSuccess: (result: CancelPromotionResult) => {
      queryClient.invalidateQueries({ queryKey: ['creator', 'promotions'] });
      if (result.refund?.status === 'succeeded' && result.refund.amount > 0) {
        onToast(
          t('creator.promotions.finished_refund', {
            amount: money(
              Math.round(result.refund.amount * 100),
              result.refund.currency,
            ),
          }),
          'success',
        );
      } else {
        onToast(t('creator.promotions.finished'), 'success');
      }
      setConfirmCancel(null);
    },
    onError: () => onToast(t('creator.promotions.error_cancel'), 'error'),
  });

  const pauseMutation = useMutation({
    mutationFn: (id: string) => creatorApi.pausePromotion(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['creator', 'promotions'] });
      onToast(t('creator.promotions.paused'), 'success');
    },
    onError: () => onToast(t('creator.promotions.error_pause'), 'error'),
  });

  const resumeMutation = useMutation({
    mutationFn: (id: string) => creatorApi.resumePromotion(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['creator', 'promotions'] });
      onToast(t('creator.promotions.resumed'), 'success');
    },
    onError: () => onToast(t('creator.promotions.error_resume'), 'error'),
  });

  const promos = data?.data ?? [];
  const selected = selectedId
    ? promos.find((p) => p.id === selectedId) || null
    : null;
  const money = (cents: number, currency?: string) =>
    formatCents(cents, i18n.language, currency || 'EUR');
  const nameOf = (promo: CreatorPromotion) =>
    promo.target?.caption ||
    t('creator.promotions.campaign', {
      type: t(
        promo.targetType === 'FRAME'
          ? 'creator.promotions.kind_frame'
          : 'creator.promotions.kind_post',
      ),
    });

  const handleRepeat = (promo: CreatorPromotion) => {
    const remainingEuros = (promo.budgetCents || 0) / 100;
    if (remainingEuros <= 0) {
      onToast(t('creator.promotions.error_repeat'), 'error');
      return;
    }

    creatorApi
      .createPromotion({
        targetType: promo.targetType,
        targetId: promo.targetId,
        budget: remainingEuros,
        durationDays: 7,
        currency: promo.currency || 'EUR',
      })
      .then((response) => {
        queryClient.invalidateQueries({ queryKey: ['creator', 'promotions'] });
        const url = response.data?.url;
        if (!url) {
          onToast(t('creator.promotions.error_repeat'), 'error');
          return;
        }
        onToast(t('creator.promotions.redirecting'), 'success');
        redirectToCheckout(url);
      })
      .catch(() => onToast(t('creator.promotions.error_repeat'), 'error'));
  };

  const extendPromo = (promo: CreatorPromotion) => {
    const next = new Date(promo.endDate);
    next.setDate(next.getDate() + 1);
    creatorApi
      .updatePromotion(promo.id, { endDate: next.toISOString() })
      .then(() => {
        queryClient.invalidateQueries({ queryKey: ['creator', 'promotions'] });
        onToast(t('creator.promotions.extended'), 'success');
      })
      .catch(() => onToast(t('creator.promotions.error_edit'), 'error'));
  };

  const renderDetail = (promo: CreatorPromotion) => {
    const pct = computeProgress(promo.startDate, promo.endDate);
    const daysLeft = computeDaysLeft(promo.endDate);
    const state = stateOf(promo.status);
    const active = isActiveStatus(promo.status);
    const running = state === 'ACTIVE' || state === 'PAUSED';
    const clickRate =
      promo.reach > 0 ? ((promo.clicks || 0) / promo.reach) * 100 : 0;

    return (
      <div className="space-y-5">
        <div className="flex items-center gap-2 flex-wrap">
          <CreatorBadge on={state === 'ACTIVE'}>
            {t(`creator.promotions.state.${state}`)}
          </CreatorBadge>
          <span className="text-xs text-white/60">
            {t('creator.promotions.started_on', {
              date: formatDate(promo.startDate, i18n.language),
            })}
          </span>
        </div>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-4">
          {(
            [
              [
                'creator.promotions.investment',
                money(promo.budgetCents, promo.currency),
              ],
              [
                'creator.promotions.total_reach',
                formatNumber(promo.reach ?? 0, i18n.language),
              ],
              [
                'creator.promotions.clicks',
                formatNumber(promo.clicks ?? 0, i18n.language),
              ],
              [
                'creator.promotions.ctr',
                `${clickRate.toLocaleString(i18n.language, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })} %`,
              ],
            ] as const
          ).map(([key, value]) => (
            <div key={key}>
              <dt className="text-xs text-white/60">{t(key)}</dt>
              <dd className="mt-0.5 text-lg font-semibold text-white tabular-nums">
                {value}
              </dd>
            </div>
          ))}
        </dl>

        {active && (
          <div className="space-y-2">
            <p className="text-xs text-white/60">
              {t('creator.promotions.days_left', { count: daysLeft })}
            </p>
            <div
              className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={pct}
              aria-label={t('creator.promotions.plan_execution')}
            >
              <div
                className="h-full bg-brand-primary rounded-full"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        )}

        {active ? (
          <div className="flex flex-col gap-2">
            {running && (
              <Button
                variant="secondary"
                className="min-h-11 w-full"
                onClick={() => extendPromo(promo)}
              >
                {t('creator.promotions.extend')}
              </Button>
            )}
            {state === 'ACTIVE' && (
              <Button
                variant="secondary"
                className="min-h-11 w-full"
                onClick={() => pauseMutation.mutate(promo.id)}
                isLoading={pauseMutation.isPending}
              >
                <Pause size={14} className="mr-2" aria-hidden />
                {t('creator.promotions.pause')}
              </Button>
            )}
            {state === 'PAUSED' && (
              <Button
                variant="secondary"
                className="min-h-11 w-full"
                onClick={() => resumeMutation.mutate(promo.id)}
                isLoading={resumeMutation.isPending}
              >
                <Play size={14} className="mr-2" aria-hidden />
                {t('creator.promotions.resume')}
              </Button>
            )}
            {confirmCancel === promo.id ? (
              <div className="space-y-2">
                {promo.budgetCents > 0 && (
                  <p className="text-white/60 text-xs leading-relaxed">
                    {t('creator.promotions.cancel_refund_hint', {
                      amount: money(promo.budgetCents, promo.currency),
                    })}
                  </p>
                )}
                <div className="flex gap-2">
                  <Button
                    variant="danger"
                    className="min-h-11 flex-1"
                    onClick={() => cancelMutation.mutate(promo.id)}
                    isLoading={cancelMutation.isPending}
                  >
                    {t('creator.promotions.confirm')}
                  </Button>
                  <Button
                    variant="ghost"
                    className="min-h-11"
                    onClick={() => setConfirmCancel(null)}
                  >
                    {t('creator.promotions.no')}
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                variant="ghost"
                className="min-h-11 w-full text-brand-secondary"
                onClick={() => setConfirmCancel(promo.id)}
              >
                <XCircle size={14} className="mr-2" aria-hidden />
                {t('creator.promotions.stop')}
              </Button>
            )}
          </div>
        ) : (
          <Button
            variant="secondary"
            className="min-h-11 w-full"
            onClick={() => handleRepeat(promo)}
          >
            <RefreshCw size={14} className="mr-2" aria-hidden />
            {t('creator.promotions.repeat')}
          </Button>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4 pb-8">
      {promos.length > 0 && (
        <div className="flex justify-end">
          <Button
            variant="primary"
            className="min-h-11 w-full sm:w-auto px-5"
            onClick={() => setShowNewPromo(true)}
          >
            <Plus size={16} className="mr-2" aria-hidden />
            {t('creator.promotions.new_campaign')}
          </Button>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {['load-1', 'load-2', 'load-3'].map((id) => (
            <div
              key={id}
              className="h-20 md:h-15 rounded-xl animate-pulse bg-white/5 border border-white/5"
            />
          ))}
        </div>
      ) : promos.length === 0 ? (
        <CreatorEmpty
          icon={Megaphone}
          title={t('creator.promotions.no_active')}
          message={t('creator.promotions.boost_desc')}
          action={{
            label: t('creator.promotions.create_first'),
            onClick: () => setShowNewPromo(true),
          }}
        />
      ) : (
        <div className="space-y-2">
          {promos.map((promo) => {
            const state = stateOf(promo.status);
            const name = nameOf(promo);
            const started = t('creator.promotions.started_on', {
              date: formatDate(promo.startDate, i18n.language),
            });
            return (
              <CreatorRow
                key={promo.id}
                media={
                  promo.target?.thumbnail ? (
                    <img
                      src={promo.target.thumbnail}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <ImageIcon size={20} aria-hidden />
                  )
                }
                title={name}
                facts={[
                  [
                    t('creator.promotions.left', {
                      amount: money(promo.budgetCents, promo.currency),
                    }),
                    t('creator.promotions.reached', {
                      count: promo.reach ?? 0,
                      formatted: formatNumber(promo.reach ?? 0, i18n.language),
                    }),
                  ].join(' · '),
                  isActiveStatus(promo.status)
                    ? `${started} · ${t('creator.promotions.days_left', {
                        count: computeDaysLeft(promo.endDate),
                      })}`
                    : started,
                ]}
                state={
                  <CreatorBadge on={state === 'ACTIVE'}>
                    {t(`creator.promotions.state.${state}`)}
                  </CreatorBadge>
                }
                onOpen={() => {
                  setConfirmCancel(null);
                  setSelectedId(promo.id);
                }}
                openLabel={t('creator.promotions.open_this', { name })}
              />
            );
          })}
        </div>
      )}

      <Dialog
        isOpen={!!selected}
        onClose={() => setSelectedId(null)}
        title={
          selected ? (
            <span className="line-clamp-2">{nameOf(selected)}</span>
          ) : undefined
        }
        maxWidth="md"
      >
        {selected ? renderDetail(selected) : null}
      </Dialog>

      <AnimatePresence>
        {showNewPromo && (
          <PromoteModal
            onClose={() => setShowNewPromo(false)}
            onToast={onToast}
          />
        )}
      </AnimatePresence>

      <CreatorPager
        page={page}
        totalPages={data?.meta?.totalPages ?? 1}
        onChange={setPage}
      />
    </div>
  );
}
