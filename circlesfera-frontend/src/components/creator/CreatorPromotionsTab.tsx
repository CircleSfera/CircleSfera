import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import {
  CheckCircle2,
  DollarSign,
  Image as ImageIcon,
  Pause,
  Play,
  Plus,
  RefreshCw,
  TrendingUp,
  XCircle,
  Zap,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  CancelPromotionResult,
  CreatorPromotion,
} from '../../services/creator.service';
import { creatorApi } from '../../services/creator.service';
import type { PaginatedResponse } from '../../types';
import { AdminListRow } from '../admin/AdminList';
import { AdminSplitView } from '../admin/AdminSplitView';
import { Button } from '../ui';
import NewPromoModal from './NewPromoModal';

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

function getProgressColor(pct: number): string {
  if (pct < 50) return 'from-emerald-500 to-emerald-400';
  if (pct < 80) return 'from-amber-500 to-orange-400';
  return 'from-rose-500 to-red-400';
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
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

function isCompletedStatus(status: string) {
  return ['COMPLETED', 'CANCELLED', 'completed', 'cancelled'].includes(status);
}

interface Props {
  onToast: (msg: string, type: 'success' | 'error' | 'info') => void;
}

export default function CreatorPromotionsTab({ onToast }: Props) {
  const { t } = useTranslation();
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
            amount: result.refund.amount.toFixed(2),
            currency: result.refund.currency,
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

  const activePromos = useMemo(
    () => data?.data?.filter((p) => isActiveStatus(p.status)) || [],
    [data],
  );
  const completedPromos = useMemo(
    () => data?.data?.filter((p) => isCompletedStatus(p.status)) || [],
    [data],
  );

  const listPromos = [...activePromos, ...completedPromos];
  const selected = selectedId
    ? listPromos.find((p) => p.id === selectedId) || null
    : null;

  const handleRepeat = (promo: CreatorPromotion) => {
    const remaining = promo.budget;
    if (remaining <= 0) {
      onToast(t('creator.promotions.error_repeat'), 'error');
      return;
    }

    creatorApi
      .createPromotion({
        targetType: promo.targetType,
        targetId: promo.targetId,
        budget: remaining,
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
    const active = isActiveStatus(promo.status);

    return (
      <div className="p-4 sm:p-6 space-y-5">
        <div className="flex gap-4 items-start">
          <div className="w-20 h-20 rounded-xl bg-zinc-900 overflow-hidden shrink-0 border border-white/10">
            {promo.target?.thumbnail ? (
              <img
                src={promo.target.thumbnail}
                alt=""
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <ImageIcon size={28} className="text-zinc-700" />
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-white font-semibold text-lg truncate">
              {promo.target?.caption ||
                t('creator.promotions.campaign', { type: promo.targetType })}
            </h3>
            <p className="text-gray-400 text-xs font-semibold mt-1">
              {t('creator.promotions.started_on', {
                date: formatDate(promo.startDate),
              })}
            </p>
            {(promo.status === 'PAUSED' || promo.status === 'paused') && (
              <span className="inline-block mt-2 text-amber-400 text-xs font-semibold">
                {t('creator.promotions.paused_badge')}
              </span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-white/10 bg-black/30 p-3">
            <p className="text-gray-400 text-xs font-semibold mb-1">
              {t('creator.promotions.investment')}
            </p>
            <p className="text-white font-bold text-lg">
              {promo.budget} {promo.currency}
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/30 p-3">
            <p className="text-gray-400 text-xs font-semibold mb-1">
              {t('creator.promotions.total_reach')}
            </p>
            <p className="text-brand-primary font-bold text-lg">
              +{promo.reach.toLocaleString()}
            </p>
          </div>
        </div>

        {active && (
          <div className="space-y-2">
            <div className="flex justify-between text-xs font-semibold text-gray-400">
              <span>{t('creator.promotions.plan_execution')}</span>
              <span className="text-white">
                {t('creator.promotions.days_left', { count: daysLeft })}
              </span>
            </div>
            <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                className={`h-full bg-linear-to-r ${getProgressColor(pct)}`}
              />
            </div>
          </div>
        )}

        {active ? (
          <div className="flex flex-col gap-2">
            {(promo.status === 'ACTIVE' ||
              promo.status === 'active' ||
              promo.status === 'PAUSED' ||
              promo.status === 'paused') && (
              <Button
                variant="secondary"
                className="min-h-11 w-full"
                onClick={() => extendPromo(promo)}
              >
                {t('creator.promotions.extend')}
              </Button>
            )}
            {(promo.status === 'ACTIVE' || promo.status === 'active') && (
              <Button
                variant="secondary"
                className="min-h-11 w-full"
                onClick={() => pauseMutation.mutate(promo.id)}
                isLoading={pauseMutation.isPending}
              >
                <Pause size={14} className="mr-2" />
                {t('creator.promotions.pause')}
              </Button>
            )}
            {(promo.status === 'PAUSED' || promo.status === 'paused') && (
              <Button
                variant="secondary"
                className="min-h-11 w-full"
                onClick={() => resumeMutation.mutate(promo.id)}
                isLoading={resumeMutation.isPending}
              >
                <Play size={14} className="mr-2" />
                {t('creator.promotions.resume')}
              </Button>
            )}
            {confirmCancel === promo.id ? (
              <div className="space-y-2">
                {promo.budget > 0 && (
                  <p className="text-zinc-400 text-xs leading-relaxed">
                    {t('creator.promotions.cancel_refund_hint', {
                      amount: promo.budget.toFixed(2),
                      currency: promo.currency,
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
                variant="danger"
                className="min-h-11 w-full bg-white/5 text-zinc-400 hover:text-rose-400 hover:bg-rose-400/10"
                onClick={() => setConfirmCancel(promo.id)}
              >
                <XCircle size={14} className="mr-2" />
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
            <RefreshCw size={14} className="mr-2" />
            {t('creator.promotions.repeat', 'Repetir')}
          </Button>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-white font-semibold text-xl tracking-tight">
            {t('creator.promotions.center')}
          </h3>
          <p className="text-zinc-400 text-xs font-semibold mt-1">
            {t('creator.promotions.marketing')}
          </p>
        </div>
        <Button
          variant="secondary"
          className="min-h-11"
          onClick={() => setShowNewPromo(true)}
        >
          <Plus size={16} className="mr-2" />
          {t('creator.promotions.new_campaign')}
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {['load-1', 'load-2', 'load-3'].map((id) => (
            <div
              key={id}
              className="h-20 rounded-xl animate-pulse bg-white/5 border border-white/5"
            />
          ))}
        </div>
      ) : !data?.data?.length ? (
        <div className="text-center py-16 rounded-xl border border-dashed border-white/10">
          <div className="inline-flex p-5 rounded-full bg-brand-primary/5 mb-5">
            <TrendingUp size={40} className="text-brand-primary/40" />
          </div>
          <h4 className="text-white font-semibold text-lg mb-2">
            {t('creator.promotions.no_active')}
          </h4>
          <p className="text-zinc-400 text-sm max-w-sm mx-auto mb-8">
            {t('creator.promotions.boost_desc')}
          </p>
          <Button
            variant="primary"
            className="min-h-11"
            onClick={() => setShowNewPromo(true)}
          >
            {t('creator.promotions.create_first')}
          </Button>
        </div>
      ) : (
        <AdminSplitView
          hasSelection={!!selected}
          onBack={() => setSelectedId(null)}
          listTitle={t('creator.promotions.campaigns', 'Campañas')}
          list={
            <div className="space-y-4">
              {activePromos.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 px-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    <h4 className="text-emerald-400 text-xs font-semibold">
                      {t('creator.promotions.in_progress', {
                        count: activePromos.length,
                      })}
                    </h4>
                  </div>
                  {activePromos.map((promo) => (
                    <AdminListRow
                      key={promo.id}
                      onClick={() => setSelectedId(promo.id)}
                      className={
                        selected?.id === promo.id
                          ? 'border-brand-primary/40 bg-brand-primary/10'
                          : undefined
                      }
                      avatar={
                        <div className="w-12 h-12 rounded-lg overflow-hidden bg-zinc-900 border border-white/10">
                          {promo.target?.thumbnail ? (
                            <img
                              src={promo.target.thumbnail}
                              alt=""
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <ImageIcon size={16} className="text-zinc-700" />
                            </div>
                          )}
                        </div>
                      }
                      title={
                        promo.target?.caption ||
                        t('creator.promotions.campaign', {
                          type: promo.targetType,
                        })
                      }
                      subtitle={t('creator.promotions.started_on', {
                        date: formatDate(promo.startDate),
                      })}
                      meta={
                        <>
                          <span>
                            {promo.budget} {promo.currency}
                          </span>
                          <span>+{promo.reach.toLocaleString()}</span>
                        </>
                      }
                      badge={
                        promo.status === 'PAUSED' ||
                        promo.status === 'paused' ? (
                          <span className="text-[10px] font-semibold text-amber-400">
                            {t('creator.promotions.paused_badge')}
                          </span>
                        ) : undefined
                      }
                    />
                  ))}
                </div>
              )}

              {completedPromos.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-white/5">
                  <h4 className="text-zinc-500 text-xs font-semibold flex items-center gap-2 px-1">
                    <CheckCircle2 size={12} />
                    {t('creator.promotions.completed_history', {
                      count: completedPromos.length,
                    })}
                  </h4>
                  {completedPromos.map((promo) => (
                    <AdminListRow
                      key={promo.id}
                      onClick={() => setSelectedId(promo.id)}
                      className={
                        selected?.id === promo.id
                          ? 'border-brand-primary/40 bg-brand-primary/10'
                          : 'opacity-80'
                      }
                      avatar={
                        <div className="w-12 h-12 rounded-lg overflow-hidden bg-zinc-900 border border-white/10 grayscale">
                          {promo.target?.thumbnail ? (
                            <img
                              src={promo.target.thumbnail}
                              alt=""
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <ImageIcon size={16} className="text-zinc-700" />
                            </div>
                          )}
                        </div>
                      }
                      title={
                        promo.target?.caption ||
                        t('creator.promotions.completed_campaign')
                      }
                      meta={
                        <>
                          <span className="inline-flex items-center gap-1">
                            <Zap size={10} className="text-brand-primary" />
                            {promo.reach.toLocaleString()}
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <DollarSign
                              size={10}
                              className="text-emerald-500"
                            />
                            €{promo.budget}
                          </span>
                        </>
                      }
                    />
                  ))}
                </div>
              )}
            </div>
          }
          detail={selected ? renderDetail(selected) : null}
          emptyDetail={
            <div className="h-full min-h-48 flex items-center justify-center p-6 text-center text-sm text-gray-500">
              {t(
                'creator.promotions.select_campaign',
                'Selecciona una campaña de la lista',
              )}
            </div>
          }
        />
      )}

      <AnimatePresence>
        {showNewPromo && (
          <NewPromoModal
            onClose={() => setShowNewPromo(false)}
            onToast={onToast}
          />
        )}
      </AnimatePresence>

      {data?.meta && data.meta.totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 flex-wrap">
          <Button
            variant="ghost"
            size="sm"
            className="min-h-11"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Anterior
          </Button>
          <span className="text-xs font-semibold text-gray-400 px-2">
            {page} / {data.meta.totalPages}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="min-h-11"
            disabled={page >= data.meta.totalPages}
            onClick={() =>
              setPage((p) => Math.min(data.meta.totalPages, p + 1))
            }
          >
            Siguiente
          </Button>
        </div>
      )}
    </div>
  );
}
