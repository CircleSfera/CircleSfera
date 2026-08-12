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
    <div className="space-y-4">
      {/* Sticky Tab Navigation Bar */}
      <div className="sticky top-[calc(env(safe-area-inset-top)+4.25rem)] sm:top-2 z-20 bg-zinc-950/90 backdrop-blur-xl p-1 rounded-xl border border-white/8 shadow-lg">
        <div
          role="tablist"
          aria-label={t('creator.money.sections', 'Secciones de monetización')}
          className="flex gap-1 overflow-x-auto no-scrollbar"
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
                  'flex-1 min-h-10 px-4 rounded-lg text-xs font-bold transition-all uppercase tracking-wider',
                  active
                    ? 'bg-brand-primary text-white shadow-md shadow-brand-primary/20'
                    : 'text-gray-400 hover:text-white hover:bg-white/5',
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
          <div className="flex justify-center py-12 opacity-50">
            <div className="w-6 h-6 border-2 border-brand-primary border-t-transparent rounded-full animate-spin" />
          </div>
        }
      >
        {section === 'wallet' && (
          <div className="rounded-2xl border border-white/8 bg-zinc-950/80 p-3 sm:p-4 backdrop-blur-xl">
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
