import { DollarSign } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Switch } from '../ui';
import { SUBSCREEN_BODY, SUBSCREEN_SHELL } from './ComposerChrome';
import SubScreenHeader from './SubScreenHeader';

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
    <div className={SUBSCREEN_SHELL}>
      <SubScreenHeader
        title={t('createPost.caption.monetization')}
        onClose={onClose}
      />

      <div className={SUBSCREEN_BODY}>
        <div className="rounded-xl border border-white/8 bg-white/2 px-3 py-2.5 flex items-start gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-brand-primary/15 border border-brand-primary/25 flex items-center justify-center shrink-0 mt-0.5">
            <DollarSign size={14} className="text-brand-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <Switch
              compact
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
          <div className="rounded-xl border border-white/8 bg-white/2 px-3 py-2.5 space-y-2">
            <label
              htmlFor="premium-price"
              className="block text-[13px] font-medium text-white"
            >
              {t('createPost.caption.price_eur')}
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <span className="text-white/40 text-sm font-medium">€</span>
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
                className="w-full min-h-10 h-10 bg-surface-raised border border-white/10 rounded-lg py-2 pl-7 pr-3 text-white text-sm focus:ring-2 focus:ring-brand-primary/40 outline-none"
              />
            </div>

            {price > 0 && price < 1 && (
              <p className="text-[11px] text-brand-accent font-medium">
                {t('createPost.caption.min_price_warning')}
              </p>
            )}
            {price > 500 && (
              <p className="text-[11px] text-brand-accent font-medium">
                {t('createPost.caption.max_price_warning')}
              </p>
            )}

            {price >= 1 && price <= 500 && (
              <div className="p-2.5 rounded-lg bg-brand-primary/10 border border-brand-primary/20 text-[11px] text-white/80 space-y-0.5">
                <div className="flex justify-between font-semibold">
                  <span>{t('createPost.caption.creator_earning')}</span>
                  <span>€{(price * 0.8).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-white/40">
                  <span>{t('createPost.caption.platform_fee')}</span>
                  <span>€{(price * 0.2).toFixed(2)}</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
