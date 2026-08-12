import { DollarSign } from 'lucide-react';
import { useTranslation } from 'react-i18next';

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-surface-elevated border border-white/10 w-full max-w-md rounded-lg overflow-hidden shadow-2xl flex flex-col">
        <div className="p-4 border-b border-white/10 flex items-center gap-4">
          <button
            type="button"
            onClick={onClose}
            className="text-white hover:text-gray-300"
            aria-label="Go back"
          >
            <svg
              aria-hidden="true"
              className="w-6 h-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
          </button>
          <h2 className="font-bold text-lg">
            {t('createPost.caption.monetization', 'Monetization')}
          </h2>
        </div>
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium text-white flex items-center gap-2">
                <DollarSign size={18} className="text-emerald-500" />
                {t(
                  'createPost.caption.premium_content',
                  'Premium Content (Pay-Per-View)',
                )}
              </div>
              <div className="text-xs text-gray-300 mt-1 max-w-70">
                {t(
                  'createPost.caption.premium_desc',
                  'Require users to pay to unlock and view this post.',
                )}
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={isPremium}
              onClick={() => setIsPremium(!isPremium)}
              className={`w-12 h-6 rounded-full relative cursor-pointer transition-colors shrink-0 ${isPremium ? 'bg-emerald-500' : 'bg-neutral-700'}`}
              aria-label="Toggle premium content"
            >
              <div
                className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${isPremium ? 'left-7' : 'left-1'}`}
              />
            </button>
          </div>

          {isPremium && (
            <div className="space-y-3 animate-in slide-in-from-top-2 fade-in duration-200">
              <label
                htmlFor="premium-price"
                className="block text-sm font-medium text-white"
              >
                {t('createPost.caption.price_usd', 'Price (EUR / USD)')}
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <span className="text-gray-300 font-medium">$</span>
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
                  className="w-full bg-black/50 border border-white/10 rounded-xl py-3 pl-8 pr-4 text-white focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 outline-none transition-all"
                />
              </div>

              {price > 0 && price < 1 && (
                <p className="text-xs text-amber-400 font-medium">
                  {t(
                    'createPost.caption.min_price_warning',
                    'Minimum price is $1.00',
                  )}
                </p>
              )}
              {price > 500 && (
                <p className="text-xs text-amber-400 font-medium">
                  {t(
                    'createPost.caption.max_price_warning',
                    'Maximum price is $500.00',
                  )}
                </p>
              )}

              {price >= 1 && price <= 500 && (
                <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-300 space-y-1">
                  <div className="flex justify-between font-semibold">
                    <span>
                      {t(
                        'createPost.caption.creator_earning',
                        'Your earnings (80%):',
                      )}
                    </span>
                    <span>${(price * 0.8).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-gray-400">
                    <span>
                      {t(
                        'createPost.caption.platform_fee',
                        'Platform fee (20%):',
                      )}
                    </span>
                    <span>${(price * 0.2).toFixed(2)}</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
