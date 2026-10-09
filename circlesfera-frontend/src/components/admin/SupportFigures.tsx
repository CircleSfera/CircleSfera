import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AdminServiceFigures } from '../../services/admin.service';
import { adminApi } from '../../services/admin.service';
import { shortDuration } from '../../utils/ticketTarget';
import { Button, Dialog } from '../ui';
import { AdminSegmentedControl } from './AdminSegmentedControl';

// A share with nothing to measure is a dash, not a zero.
const NONE = '–';
const percent = (share: number | null) =>
  share === null ? NONE : `${Math.round(share * 100)} %`;
const duration = (minutes: number | null) =>
  minutes === null ? NONE : shortDuration(minutes * 60_000);

/**
 * How fast and how well support answered in the last 7 or 30 days, for who
 * leads the team: numbers only, in total and for each service level.
 */
export function SupportFigures() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [days, setDays] = useState<7 | 30>(7);

  const { data, isError } = useQuery({
    queryKey: ['admin', 'support-figures', days],
    queryFn: () => adminApi.getSupportFigures(days).then((res) => res.data),
    enabled: open,
  });

  const rows: [string, (figures: AdminServiceFigures) => string][] = [
    ['opened', (f) => String(f.opened)],
    ['solved', (f) => String(f.solved)],
    ['first_answered', (f) => String(f.firstResponse.answered)],
    ['first_within', (f) => percent(f.firstResponse.withinTarget)],
    ['first_median', (f) => duration(f.firstResponse.medianMinutes)],
    ['resolution_within', (f) => percent(f.resolution.withinTarget)],
    ['resolution_median', (f) => duration(f.resolution.medianMinutes)],
    ['ratings', (f) => String(f.ratings.count)],
    ['ratings_good', (f) => percent(f.ratings.good)],
  ];
  const columns = ['total', 'priority', 'standard'] as const;

  return (
    <>
      <Button
        variant="secondary"
        className="min-h-11 text-sm"
        onClick={() => setOpen(true)}
      >
        {t('admin.support.figures.open')}
      </Button>
      <Dialog
        isOpen={open}
        onClose={() => setOpen(false)}
        title={t('admin.support.figures.title')}
        maxWidth="xl"
      >
        <div className="space-y-4">
          <AdminSegmentedControl
            value={String(days)}
            onChange={(value) => setDays(value === '30' ? 30 : 7)}
            options={[
              { value: '7', label: t('admin.support.figures.days_7') },
              { value: '30', label: t('admin.support.figures.days_30') },
            ]}
          />
          {isError && (
            <p role="alert" className="text-sm text-red-400">
              {t('admin.support.toast_error')}
            </p>
          )}
          {data && (
            <>
              <p className="text-sm text-white/80">
                {t('admin.support.figures.past_target', {
                  count: data.pastTarget,
                })}
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-white/60">
                      <th scope="col" className="py-2 pr-3 font-medium">
                        {t('admin.support.figures.measure')}
                      </th>
                      {columns.map((column) => (
                        <th
                          key={column}
                          scope="col"
                          className="py-2 pl-3 text-right font-medium"
                        >
                          {t(`admin.support.figures.${column}`)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(([key, value]) => (
                      <tr key={key} className="border-t border-white/5">
                        <th
                          scope="row"
                          className="py-2 pr-3 text-left font-normal text-white/80"
                        >
                          {t(`admin.support.figures.${key}`)}
                        </th>
                        {columns.map((column) => (
                          <td
                            key={column}
                            className="py-2 pl-3 text-right font-semibold text-white tabular-nums whitespace-nowrap"
                          >
                            {value(data[column])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-white/60">
                {t('admin.support.figures.note')}
              </p>
            </>
          )}
        </div>
      </Dialog>
    </>
  );
}
