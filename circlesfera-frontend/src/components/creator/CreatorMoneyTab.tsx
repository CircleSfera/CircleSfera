import { clsx } from 'clsx';
import { lazy, Suspense, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import type { CreatorToastFn } from './creatorToast';

const CreatorMonetizationTab = lazy(() => import('./CreatorMonetizationTab'));
const MonetizationDashboard = lazy(
  () => import('../monetization/MonetizationDashboard'),
);

export type MoneySection = 'income' | 'wallet' | 'plans';

const SECTIONS: {
  id: MoneySection;
  labelKey: string;
  labelFallback: string;
}[] = [
  {
    id: 'income',
    labelKey: 'creator.money.income',
    labelFallback: 'Ingresos',
  },
  {
    id: 'wallet',
    labelKey: 'creator.money.wallet',
    labelFallback: 'Wallet',
  },
  {
    id: 'plans',
    labelKey: 'creator.money.plans',
    labelFallback: 'Planes',
  },
];

interface Props {
  onToast: CreatorToastFn;
}

function parseSection(raw: string | null): MoneySection {
  if (raw === 'wallet' || raw === 'plans' || raw === 'income') return raw;
  return 'income';
}

export default function CreatorMoneyTab({ onToast }: Props) {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const section = useMemo(
    () => parseSection(searchParams.get('section')),
    [searchParams],
  );

  const setSection = useCallback(
    (next: MoneySection) => {
      const params = new URLSearchParams(searchParams);
      if (next === 'income') params.delete('section');
      else params.set('section', next);
      setSearchParams(params, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  return (
    <div className="space-y-5">
      <div className="sticky top-[calc(env(safe-area-inset-top)+4.5rem)] sm:top-2 z-20 -mx-1 px-1 py-1 bg-black/70 backdrop-blur-xl rounded-xl border border-white/10">
        <div
          role="tablist"
          aria-label={t('creator.money.sections', 'Secciones de monetización')}
          className="flex gap-1 p-1 overflow-x-auto no-scrollbar"
        >
          {SECTIONS.map((item) => {
            const active = section === item.id;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setSection(item.id)}
                className={clsx(
                  'shrink-0 min-h-11 px-4 rounded-lg text-sm font-semibold transition-colors',
                  active
                    ? 'bg-brand-primary/20 text-white border border-brand-primary/40'
                    : 'text-gray-400 hover:text-white hover:bg-white/5 border border-transparent',
                )}
              >
                {t(item.labelKey, item.labelFallback)}
              </button>
            );
          })}
        </div>
      </div>

      <Suspense
        fallback={
          <div className="flex justify-center py-16 opacity-50">
            <div className="w-8 h-8 border-4 border-brand-primary border-t-transparent rounded-full animate-spin" />
          </div>
        }
      >
        {section === 'wallet' && (
          <div className="rounded-xl border border-white/10 bg-white/5 p-3 sm:p-4">
            <MonetizationDashboard />
          </div>
        )}
        {section === 'income' && (
          <CreatorMonetizationTab onToast={onToast} section="income" />
        )}
        {section === 'plans' && (
          <CreatorMonetizationTab onToast={onToast} section="plans" />
        )}
      </Suspense>
    </div>
  );
}
