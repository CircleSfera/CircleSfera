import { lazy, Suspense, useCallback, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { CreatorViewChoice } from './CreatorPieces';
import type { CreatorToastFn } from './creatorToast';

const CreatorMonetizationTab = lazy(() => import('./CreatorMonetizationTab'));

export type MoneySection = 'income' | 'plans';

const SECTIONS: {
  id: MoneySection;
  labelKey: string;
}[] = [
  {
    id: 'income',
    labelKey: 'creator.money.income',
  },
  {
    id: 'plans',
    labelKey: 'creator.money.plans',
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
      <CreatorViewChoice<MoneySection>
        label={t('creator.money.sections')}
        items={SECTIONS.map((item) => ({
          value: item.id,
          label: t(item.labelKey),
        }))}
        value={section}
        onChange={setSection}
      />

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
