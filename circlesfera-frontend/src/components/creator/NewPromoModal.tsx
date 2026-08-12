import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Image as ImageIcon, Megaphone } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { CreatorPost } from '../../services/creator.service';
import { creatorApi } from '../../services/creator.service';
import type { PaginatedResponse } from '../../types';
import { Button } from '../ui';
import { Dialog } from '../ui/Dialog';

function redirectToCheckout(url: string | null | undefined) {
  if (!url) {
    throw new Error('Missing checkout URL');
  }
  window.location.href = url;
}

interface NewPromoModalProps {
  onClose: () => void;
  onToast: (msg: string, type: 'success' | 'error') => void;
}

export default function NewPromoModal({
  onClose,
  onToast,
}: NewPromoModalProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<'select' | 'configure'>('select');
  const [selectedPost, setSelectedPost] = useState<CreatorPost | null>(null);
  const [budget, setBudget] = useState(5);
  const [duration, setDuration] = useState(7);
  const [objective, setObjective] = useState('PROFILE_VISITS');
  const [countries, setCountries] = useState('');
  const [interests, setInterests] = useState('');

  const totalBudget = budget * duration;
  const minReach = totalBudget * 300;
  const maxReach = totalBudget * 700;

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
        dailyBudget: budget,
        durationDays: duration,
        currency: 'EUR',
        objective,
        countries: countries.trim() || undefined,
        interests: interests.trim() || undefined,
      }),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['creator', 'promotions'] });
      const url = response.data?.url;
      if (!url) {
        onToast(t('creator.promotions.error_create'), 'error');
        return;
      }
      onToast(t('creator.promotions.redirecting'), 'success');
      redirectToCheckout(url);
    },
    onError: () => onToast(t('creator.promotions.error_create'), 'error'),
  });

  return (
    <Dialog
      isOpen
      onClose={onClose}
      title={
        step === 'select'
          ? t('creator.promotions.select_content')
          : t('creator.promotions.configure_reach')
      }
      maxWidth="xl"
      className="max-h-[90vh]"
    >
      <p className="text-white/50 text-xs font-semibold uppercase tracking-wide -mt-1 mb-4">
        {t('creator.promotions.boost_best')}
      </p>

      <div className="max-h-[55vh] overflow-y-auto no-scrollbar">
        {step === 'select' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
                      <ImageIcon size={32} className="text-white/30" />
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
              <p className="text-center text-white/40 py-8 col-span-2">
                {t('creator.promotions.no_posts')}
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            {/* Selected post preview */}
            <div className="flex items-center gap-4 p-4 rounded-xl bg-white/5 border border-white/5">
              <div className="w-14 h-14 rounded-lg bg-surface-raised overflow-hidden shrink-0 border border-white/5">
                {selectedPost?.media?.[0]?.url ? (
                  <img
                    src={selectedPost.media[0].url}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <ImageIcon size={20} className="text-white/30" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white text-sm font-bold truncate mb-1">
                  {selectedPost?.caption ||
                    t('creator.promotions.selected_post')}
                </p>
                <Button
                  variant="ghost"
                  size="compact"
                  onClick={() => setStep('select')}
                  className="text-brand-primary hover:text-white mt-1 px-0"
                >
                  {t('creator.promotions.change_post')}
                </Button>
              </div>
            </div>

            {/* Budget */}
            <fieldset className="space-y-3 border-none p-0 m-0">
              <legend className="block text-xs font-bold uppercase tracking-wide text-white/50 mb-3">
                {t('creator.promotions.daily_budget', { currency: 'EUR' })}
              </legend>
              <div className="grid grid-cols-4 gap-2">
                {[5, 10, 25, 50].map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setBudget(v)}
                    className={`py-3 min-h-11 rounded-lg text-xs font-bold transition-all border ${
                      budget === v
                        ? 'bg-white text-black border-white shadow-xl shadow-white/5'
                        : 'bg-white/5 text-white/50 border-white/5 hover:bg-white/10'
                    }`}
                  >
                    €{v}
                  </button>
                ))}
              </div>
            </fieldset>

            <fieldset className="space-y-3 border-none p-0 m-0">
              <legend className="block text-xs font-black uppercase tracking-wide text-zinc-400 mb-2">
                {t('creator.promotions.objective', 'Objective')}
              </legend>
              <select
                value={objective}
                onChange={(e) => setObjective(e.target.value)}
                className="w-full rounded-xl bg-white/5 border border-white/10 px-4 py-3 text-white text-sm"
              >
                <option value="PROFILE_VISITS">
                  {t('creator.promotions.objective_profile', 'Profile Visits')}
                </option>
                <option value="FOLLOWS">
                  {t('creator.promotions.objective_follows', 'Get Followers')}
                </option>
                <option value="TIER_CONVERSIONS">
                  {t(
                    'creator.promotions.objective_conversions',
                    'Subscription Conversions',
                  )}
                </option>
              </select>
              <input
                type="text"
                value={countries}
                onChange={(e) => setCountries(e.target.value)}
                placeholder={t(
                  'creator.promotions.countries_placeholder',
                  'Countries (comma-separated, optional)',
                )}
                className="w-full rounded-xl bg-white/5 border border-white/10 px-4 py-3 text-white text-sm"
              />
              <input
                type="text"
                value={interests}
                onChange={(e) => setInterests(e.target.value)}
                placeholder={t(
                  'creator.promotions.interests_placeholder',
                  'Interests (comma-separated, optional)',
                )}
                className="w-full rounded-xl bg-white/5 border border-white/10 px-4 py-3 text-white text-sm"
              />
            </fieldset>

            {/* Duration */}
            <fieldset className="space-y-3 border-none p-0 m-0">
              <legend className="block text-xs font-bold uppercase tracking-wide text-white/50 mb-3">
                {t('creator.promotions.campaign_duration')}
              </legend>
              <div className="grid grid-cols-4 gap-2">
                {[3, 7, 14, 30].map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDuration(d)}
                    className={`py-3 min-h-11 rounded-lg text-xs font-bold transition-all border ${
                      duration === d
                        ? 'bg-brand-primary text-white border-brand-primary shadow-xl shadow-brand-primary/20'
                        : 'bg-white/5 text-white/50 border-white/5 hover:bg-white/10'
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

      {step === 'configure' && (
        <div className="pt-4 mt-4 border-t border-white/5">
          <div className="mb-3 bg-white/5 border border-white/10 rounded-xl p-3 flex items-center justify-between">
            <span className="text-white/60 text-sm font-bold flex items-center gap-2">
              <Megaphone size={16} className="text-brand-accent" />
              {t('creator.promotions.estimated_reach', 'Alcance estimado')}
            </span>
            <span className="text-white font-bold text-sm">
              {minReach.toLocaleString()} - {maxReach.toLocaleString()}
            </span>
          </div>

          <Button
            variant="primary"
            size="lg"
            className="w-full font-bold uppercase tracking-wide"
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
    </Dialog>
  );
}
