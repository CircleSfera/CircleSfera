import { clsx } from 'clsx';
import { lazy, Suspense, useCallback, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import type { CreatorToastFn } from './creatorToast';

const CreatorMonetizationTab = lazy(() => import('./CreatorMonetizationTab'));

export type MoneySection = 'income' | 'plans';

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
    id: 'plans',
    labelKey: 'creator.money.plans',
    labelFallback: 'Planes',
  },
];

interface Props {
  onToast: CreatorToastFn;
}

function parseSection(raw: string | null): MoneySection {
  if (raw === 'plans') return 'plans';
  return 'income';
}

export { parseSection };

export default function CreatorMoneyTab({ onToast }: Props) {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const section = useMemo(
    () => parseSection(searchParams.get('section')),
    [searchParams],
  );

  useEffect(() => {
    if (searchParams.get('section') !== 'wallet') return;
    const params = new URLSearchParams(searchParams);
    params.delete('section');
    setSearchParams(params, { replace: true });
  }, [searchParams, setSearchParams]);

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
      <div className="sticky top-[calc(env(safe-area-inset-top)+4.25rem)] sm:top-2 z-20 p-1 rounded-xl border border-white/10 bg-surface-elevated">
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
                  'flex-1 min-h-11 px-4 rounded-lg text-sm font-medium transition-colors',
                  active
                    ? 'bg-brand-primary/15 text-white'
                    : 'text-white/60 hover:text-white hover:bg-white/5',
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
        <CreatorMonetizationTab onToast={onToast} section={section} />
      </Suspense>
    </div>
  );
}
