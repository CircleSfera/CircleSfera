import { ChevronLeft, DollarSign } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Switch } from '../ui';

interface MonetizationSubScreenProps {
  isPremium: boolean;
  setIsPremium: (val: boolean) => void;
  price: number;
  setPrice: (val: number) => void;
  onClose: () => void;
}

export default function MonetizationSubScreen({
  isPremium,
  setIsPremium,
  price,
  setPrice,
  onClose,
}: MonetizationSubScreenProps) {
  const { t } = useTranslation();

  return (
    <div className="absolute inset-0 z-50 bg-surface-base flex flex-col">
      <div className="sticky top-0 z-10 flex items-center gap-2 px-2 h-(--nav-top-height,52px) bg-surface-elevated border-b border-white/10 shrink-0">
        <button
          type="button"
          onClick={onClose}
          className="min-h-11 min-w-11 flex items-center justify-center text-white hover:bg-white/8 rounded-xl transition-colors outline-none focus-visible:ring-2 focus-visible:ring-white/20"
          aria-label={t('createPost.header.back')}
        >
          <ChevronLeft size={22} strokeWidth={2} />
        </button>
        <h2 className="font-bold text-base text-white">
          {t('createPost.caption.monetization')}
        </h2>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-brand-primary/15 border border-brand-primary/25 flex items-center justify-center shrink-0 mt-0.5">
            <DollarSign size={18} className="text-brand-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <Switch
              role="switch"
              checked={isPremium}
              onChange={(e) => setIsPremium(e.target.checked)}
              label={t('createPost.caption.premium_content')}
              description={t('createPost.caption.premium_desc')}
              aria-label={t('createPost.caption.premium_content')}
            />
          </div>
        </div>

        {isPremium && (
          <div className="space-y-3">
            <label
              htmlFor="premium-price"
              className="block text-sm font-medium text-white"
            >
              {t('createPost.caption.price_usd')}
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <span className="text-white/40 font-medium">$</span>
              </div>
              <input
                id="premium-price"
                type="number"
                min="1"
                max="500"
                step="0.50"
                value={price || ''}
                onChange={(e) =>
                  setPrice(Number.parseFloat(e.target.value) || 0)
                }
                placeholder="5.00"
                className="w-full min-h-12 bg-surface-raised border border-white/10 rounded-xl py-3 pl-8 pr-4 text-white text-base focus:ring-2 focus:ring-brand-primary/40 outline-none"
              />
            </div>

            {price > 0 && price < 1 && (
              <p className="text-xs text-brand-accent font-medium">
                {t('createPost.caption.min_price_warning')}
              </p>
            )}
            {price > 500 && (
              <p className="text-xs text-brand-accent font-medium">
                {t('createPost.caption.max_price_warning')}
              </p>
            )}

            {price >= 1 && price <= 500 && (
              <div className="p-3 rounded-xl bg-brand-primary/10 border border-brand-primary/20 text-xs text-white/80 space-y-1">
                <div className="flex justify-between font-semibold">
                  <span>{t('createPost.caption.creator_earning')}</span>
                  <span>${(price * 0.8).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-white/40">
                  <span>{t('createPost.caption.platform_fee')}</span>
                  <span>${(price * 0.2).toFixed(2)}</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
