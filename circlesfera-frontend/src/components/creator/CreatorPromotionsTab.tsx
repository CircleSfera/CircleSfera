import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import {
  CheckCircle2,
  DollarSign,
  Image as ImageIcon,
  Megaphone,
  Plus,
  RefreshCw,
  TrendingUp,
  X,
  XCircle,
  Zap,
} from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  CreatorPost,
  CreatorPromotion,
} from '../../services/creator.service';
import { creatorApi } from '../../services/creator.service';
import type { PaginatedResponse } from '../../types';
import { Button } from '../ui';

// ─── Helpers ────────────────────────────────────────────────────

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

// ─── New Promotion Modal ────────────────────────────────────────

interface NewPromoModalProps {
  onClose: () => void;
  onToast: (msg: string, type: 'success' | 'error') => void;
}

function NewPromoModal({ onClose, onToast }: NewPromoModalProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<'select' | 'configure'>('select');
  const [selectedPost, setSelectedPost] = useState<CreatorPost | null>(null);
  const [budget, setBudget] = useState(5);
  const [duration, setDuration] = useState(7);

  const { data: postsData, isLoading: loadingPosts } = useQuery<
    PaginatedResponse<CreatorPost>
  >({
    queryKey: ['creator', 'posts', 'promo-select'],
    queryFn: () => creatorApi.getPosts(1, 20).then((r) => r.data),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      creatorApi.createPromotion({
        targetType:
          selectedPost?.type?.toLowerCase() === 'frame' ? 'frame' : 'post',
        targetId: selectedPost!.id,
        budget,
        durationDays: duration,
        currency: 'EUR',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['creator', 'promotions'] });
      onToast(t('creator.promotions.created'), 'success');
      onClose();
    },
    onError: () => onToast(t('creator.promotions.error_create'), 'error'),
  });

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4"
    >
      <motion.div
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        className="w-full max-w-xl bg-zinc-950 rounded-[2.5rem] border border-white/10 overflow-hidden shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-8 border-b border-white/5">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-brand-primary/10 rounded-lg border border-brand-primary/20">
              <Megaphone size={24} className="text-brand-primary" />
            </div>
            <div>
              <h3 className="font-black text-white text-xl uppercase tracking-tight">
                {step === 'select'
                  ? t('creator.promotions.select_content')
                  : t('creator.promotions.configure_reach')}
              </h3>
              <p className="text-zinc-500 text-xs font-black uppercase tracking-wide mt-1">
                {t('creator.promotions.boost_best')}
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
          >
            <X size={20} className="text-zinc-500 hover:text-white" />
          </Button>
        </div>

        {/* Content */}
        <div className="p-8 max-h-[60vh] overflow-y-auto no-scrollbar">
          {step === 'select' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {loadingPosts ? (
                ['promo-sk-1', 'promo-sk-2', 'promo-sk-3', 'promo-sk-4'].map(
                  (id) => (
                    <div
                      key={id}
                      className="aspect-4/5 rounded-lg bg-white/5 animate-pulse"
                    />
                  ),
                )
              ) : postsData?.data?.length ? (
                postsData.data.map((post) => (
                  <button
                    key={post.id}
                    type="button"
                    onClick={() => {
                      setSelectedPost(post);
                      setStep('configure');
                    }}
                    className="relative aspect-9/16 rounded-xl overflow-hidden border border-white/5 hover:border-brand-primary/30 transition-all group cursor-pointer"
                  >
                    {post.media?.[0]?.url ? (
                      <img
                        src={post.media[0].url}
                        alt=""
                        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <ImageIcon size={32} className="text-zinc-800" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-linear-to-t from-black/80 via-transparent to-transparent opacity-60" />
                    <div className="absolute bottom-3 left-3 right-3 text-left">
                      <p className="text-white text-xs font-bold truncate">
                        {post.caption || t('creator.promotions.untitled')}
                      </p>
                    </div>
                  </button>
                ))
              ) : (
                <p className="text-center text-zinc-600 py-12 col-span-2">
                  {t('creator.promotions.no_posts')}
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-10">
              {/* Selected post preview */}
              <div className="flex items-center gap-5 p-5 rounded-xl bg-white/5 border border-white/5">
                <div className="w-16 h-16 rounded-lg bg-zinc-900 overflow-hidden shrink-0 border border-white/5">
                  {selectedPost?.media?.[0]?.url ? (
                    <img
                      src={selectedPost.media[0].url}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <ImageIcon size={20} className="text-zinc-800" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-black truncate mb-1">
                    {selectedPost?.caption ||
                      t('creator.promotions.selected_post')}
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setStep('select')}
                    className="text-brand-primary hover:text-white mt-1 px-0"
                  >
                    {t('creator.promotions.change_post')}
                  </Button>
                </div>
              </div>

              {/* Budget */}
              <fieldset className="space-y-4 border-none p-0 m-0">
                <legend className="block text-xs font-black uppercase tracking-wide text-zinc-500 mb-4">
                  {t('creator.promotions.daily_budget', { currency: 'EUR' })}
                </legend>
                <div className="grid grid-cols-4 gap-3">
                  {[5, 10, 25, 50].map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setBudget(v)}
                      className={`py-4 rounded-lg text-xs font-black transition-all border ${
                        budget === v
                          ? 'bg-white text-black border-white shadow-xl shadow-white/5'
                          : 'bg-white/5 text-zinc-500 border-white/5 hover:bg-white/10'
                      }`}
                    >
                      €{v}
                    </button>
                  ))}
                </div>
              </fieldset>

              {/* Duration */}
              <fieldset className="space-y-4 border-none p-0 m-0">
                <legend className="block text-xs font-black uppercase tracking-wide text-zinc-500 mb-4">
                  {t('creator.promotions.campaign_duration')}
                </legend>
                <div className="grid grid-cols-4 gap-3">
                  {[3, 7, 14, 30].map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setDuration(d)}
                      className={`py-4 rounded-lg text-xs font-black transition-all border ${
                        duration === d
                          ? 'bg-brand-primary text-white border-brand-primary shadow-xl shadow-brand-primary/20'
                          : 'bg-white/5 text-zinc-500 border-white/5 hover:bg-white/10'
                      }`}
                    >
                      {t('creator.promotions.days', { count: d })}
                    </button>
                  ))}
                </div>
              </fieldset>
            </div>
          )}
        </div>

        {/* Footer */}
        {step === 'configure' && (
          <div className="p-8 border-t border-white/5 bg-black/40">
            <Button
              variant="primary"
              size="lg"
              className="w-full rounded-full font-black uppercase tracking-wide shadow-2xl shadow-brand-primary/20 hover:scale-[1.02] active:scale-100"
              onClick={() => createMutation.mutate()}
              isLoading={createMutation.isPending}
            >
              {t('creator.promotions.boost_total', {
                currency: '€',
                total: budget * duration,
              })}
            </Button>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

// ─── Main Component ─────────────────────────────────────────────

interface Props {
  onToast: (msg: string, type: 'success' | 'error') => void;
}

export default function CreatorPromotionsTab({ onToast }: Props) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [showNewPromo, setShowNewPromo] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState<string | null>(null);

  const { data, isLoading } = useQuery<PaginatedResponse<CreatorPromotion>>({
    queryKey: ['creator', 'promotions', page],
    queryFn: () => creatorApi.getPromotions(page, 10).then((r) => r.data),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => creatorApi.cancelPromotion(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['creator', 'promotions'] });
      onToast(t('creator.promotions.finished'), 'success');
      setConfirmCancel(null);
    },
    onError: () => onToast(t('creator.promotions.error_cancel'), 'error'),
  });

  const activePromos = data?.data?.filter((p) => p.status === 'active') || [];
  const completedPromos =
    data?.data?.filter((p) => p.status === 'completed') || [];

  const handleRepeat = (promo: CreatorPromotion) => {
    creatorApi
      .createPromotion({
        targetType: promo.targetType,
        targetId: promo.targetId,
        budget: promo.budget,
        durationDays: 7,
        currency: promo.currency,
      })
      .then(() => {
        queryClient.invalidateQueries({ queryKey: ['creator', 'promotions'] });
        onToast(t('creator.promotions.restarted'), 'success');
      })
      .catch(() => onToast(t('creator.promotions.error_repeat'), 'error'));
  };

  return (
    <div className="space-y-12 pb-20">
      {/* Header + Action */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h3 className="text-white font-black text-2xl uppercase tracking-tight">
            {t('creator.promotions.center')}
          </h3>
          <p className="text-zinc-500 text-xs font-black uppercase tracking-wide mt-1 italic">
            {t('creator.promotions.marketing')}
          </p>
        </div>
        <Button
          variant="secondary"
          onClick={() => setShowNewPromo(true)}
          className="shadow-2xl hover:scale-[1.03] transition-transform"
        >
          <Plus size={16} className="mr-2" />
          {t('creator.promotions.new_campaign')}
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {['load-promo-1', 'load-promo-2', 'load-promo-3'].map((id) => (
            <div
              key={id}
              className="aspect-9/16 rounded-xl animate-pulse bg-zinc-900 border border-white/5"
            />
          ))}
        </div>
      ) : !data?.data?.length ? (
        <div className="text-center py-20 glass-panel rounded-lg border border-dashed border-white/5">
          <div className="inline-flex p-6 rounded-full bg-brand-primary/5 mb-6">
            <TrendingUp size={48} className="text-brand-primary/40" />
          </div>
          <h4 className="text-white font-bold text-xl uppercase mb-2">
            {t('creator.promotions.no_active')}
          </h4>
          <p className="text-zinc-500 text-sm max-w-sm mx-auto mb-10 leading-relaxed">
            {t('creator.promotions.boost_desc')}
          </p>
          <Button
            variant="primary"
            onClick={() => setShowNewPromo(true)}
            className="shadow-xl shadow-brand-primary/20 px-10"
          >
            {t('creator.promotions.create_first')}
          </Button>
        </div>
      ) : (
        <div className="space-y-16">
          {/* Active Campaigns */}
          {activePromos.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                <h4 className="text-emerald-400 text-xs font-black uppercase tracking-wide">
                  {t('creator.promotions.in_progress', {
                    count: activePromos.length,
                  })}
                </h4>
              </div>
              <div className="grid grid-cols-1 gap-4">
                {activePromos.map((promo) => {
                  const pct = computeProgress(promo.startDate, promo.endDate);
                  const daysLeft = computeDaysLeft(promo.endDate);

                  return (
                    <motion.div
                      layout
                      key={promo.id}
                      className="glass-panel p-4 md:p-8 rounded-xl border border-white/5 hover:border-white/10 transition-all group"
                    >
                      <div className="flex flex-col lg:flex-row gap-8">
                        {/* Visual Preview */}
                        <div className="w-full lg:w-32 lg:h-32 rounded-xl bg-zinc-900 overflow-hidden shrink-0 border border-white/5 shadow-xl">
                          {promo.target?.thumbnail ? (
                            <img
                              src={promo.target.thumbnail}
                              alt=""
                              className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
                            />
                          ) : (
                            <ImageIcon size={32} className="text-zinc-800" />
                          )}
                        </div>

                        {/* Core Data */}
                        <div className="flex-1 space-y-4">
                          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div>
                              <p className="text-white font-black text-lg tracking-tight mb-1">
                                {promo.target?.caption ||
                                  t('creator.promotions.campaign', {
                                    type: promo.targetType,
                                  })}
                              </p>
                              <p className="text-zinc-500 text-xs font-black uppercase tracking-wide">
                                {t('creator.promotions.started_on', {
                                  date: formatDate(promo.startDate),
                                })}
                              </p>
                            </div>

                            <div className="flex items-center gap-3">
                              <div className="text-right">
                                <p className="text-zinc-500 text-xs font-black uppercase tracking-wide mb-1 italic text-right">
                                  {t('creator.promotions.investment')}
                                </p>
                                <p className="text-white font-black text-xl italic leading-none">
                                  {promo.budget} {promo.currency}
                                </p>
                              </div>
                              <div className="w-px h-8 bg-white/5" />
                              <div className="text-right">
                                <p className="text-zinc-500 text-xs font-black uppercase tracking-wide mb-1 italic text-right">
                                  {t('creator.promotions.total_reach')}
                                </p>
                                <p className="text-brand-primary font-black text-xl italic leading-none">
                                  +{promo.reach.toLocaleString()}
                                </p>
                              </div>
                            </div>
                          </div>

                          {/* Dynamic Progress */}
                          <div className="space-y-3">
                            <div className="flex justify-between items-end">
                              <span className="text-zinc-400 text-xs font-black uppercase tracking-wide">
                                {t('creator.promotions.plan_execution')}
                              </span>
                              <span className="text-white text-xs font-black italic">
                                {t('creator.promotions.days_left', {
                                  count: daysLeft,
                                })}
                              </span>
                            </div>
                            <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
                              <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${pct}%` }}
                                className={`h-full bg-linear-to-r ${getProgressColor(pct)} shadow-[0_0_15px_rgba(255,255,255,0.1)]`}
                              />
                            </div>
                          </div>
                        </div>

                        {/* Admin Action */}
                        <div className="shrink-0 flex items-center md:justify-end">
                          {confirmCancel === promo.id ? (
                            <div className="flex items-center gap-2 w-full md:w-auto">
                              <Button
                                variant="danger"
                                onClick={() => cancelMutation.mutate(promo.id)}
                                isLoading={cancelMutation.isPending}
                                className="flex-1 md:flex-none"
                              >
                                {t('creator.promotions.confirm')}
                              </Button>
                              <Button
                                variant="ghost"
                                onClick={() => setConfirmCancel(null)}
                              >
                                {t('creator.promotions.no')}
                              </Button>
                            </div>
                          ) : (
                            <Button
                              variant="danger"
                              size="sm"
                              onClick={() => setConfirmCancel(promo.id)}
                              className="w-full md:w-auto bg-white/5 text-zinc-500 hover:text-rose-400 hover:bg-rose-400/10 border-transparent hover:border-rose-400/20"
                            >
                              <XCircle size={14} className="mr-2" />
                              {t('creator.promotions.stop')}
                            </Button>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Completed History */}
          {completedPromos.length > 0 && (
            <div className="space-y-4 pt-8 border-t border-white/5">
              <h4 className="text-zinc-600 text-xs font-black uppercase tracking-wide flex items-center gap-3">
                <CheckCircle2 size={12} />
                {t('creator.promotions.completed_history', {
                  count: completedPromos.length,
                })}
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {completedPromos.map((promo) => (
                  <div
                    key={promo.id}
                    className="glass-panel p-4 rounded-xl border border-white/5 opacity-60 hover:opacity-100 transition-all flex items-center gap-5 group"
                  >
                    <div className="w-16 h-16 rounded-lg bg-zinc-900 border border-white/5 overflow-hidden shrink-0 grayscale group-hover:grayscale-0 transition-all duration-700">
                      {promo.target?.thumbnail ? (
                        <img
                          src={promo.target.thumbnail}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <ImageIcon size={20} className="text-zinc-800" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-bold text-sm truncate mb-1">
                        {promo.target?.caption ||
                          t('creator.promotions.completed_campaign')}
                      </p>
                      <div className="flex items-center gap-3 text-xs font-black uppercase tracking-wide text-zinc-500">
                        <span className="flex items-center gap-1">
                          <Zap size={10} className="text-brand-primary" />{' '}
                          {promo.reach.toLocaleString()}{' '}
                          {t('creator.promotions.total')}
                        </span>
                        <span className="flex items-center gap-1">
                          <DollarSign size={10} className="text-emerald-500" />{' '}
                          €{promo.budget}{' '}
                        </span>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRepeat(promo)}
                      className="text-zinc-400 hover:text-white border-white/5"
                    >
                      <RefreshCw size={14} />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* New Promotion Drawer/Modal Integration... */}
      <AnimatePresence>
        {showNewPromo && (
          <NewPromoModal
            onClose={() => setShowNewPromo(false)}
            onToast={onToast}
          />
        )}
      </AnimatePresence>

      {/* Pagination */}
      {data?.meta && data.meta.totalPages > 1 && (
        <div className="flex justify-center gap-2 mt-12 pb-10">
          {Array.from({ length: data.meta.totalPages }, (_, i) => i + 1).map(
            (p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPage(p)}
                className={`w-10 h-10 rounded-xl text-xs font-black uppercase transition-all ${
                  page === p
                    ? 'bg-white text-black shadow-xl shadow-white/5'
                    : 'bg-white/5 text-zinc-500 hover:text-white border border-white/5'
                }`}
              >
                {p}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}
