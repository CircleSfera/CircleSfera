import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adminApi } from '../../services/admin.service';
import { renderWithProviders } from '../../test/test-utils';
import { SupportFigures } from './SupportFigures';

vi.mock('../../services/admin.service', () => ({
  adminApi: { getSupportFigures: vi.fn() },
}));

const group = (overrides: Record<string, unknown> = {}) => ({
  opened: 12,
  solved: 9,
  firstResponse: { answered: 10, withinTarget: 0.8, medianMinutes: 95 },
  resolution: { withinTarget: 2 / 3, medianMinutes: 60 * 50 },
  ratings: { count: 4, good: 0.75 },
  ...overrides,
});
const empty = group({
  opened: 0,
  solved: 0,
  firstResponse: { answered: 0, withinTarget: null, medianMinutes: null },
  resolution: { withinTarget: null, medianMinutes: null },
  ratings: { count: 0, good: null },
});

describe('SupportFigures', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(adminApi.getSupportFigures).mockResolvedValue({
      data: {
        days: 7,
        pastTarget: 3,
        total: group(),
        priority: empty,
        standard: group(),
      },
    } as never);
  });

  const openPanel = async () => {
    const { i18n } = renderWithProviders(<SupportFigures />);
    const t = (key: string, values?: Record<string, unknown>) =>
      i18n!.t(`admin.support.figures.${key}`, values);
    fireEvent.click(screen.getByRole('button', { name: t('open') }));
    return { t, panel: within(await screen.findByRole('dialog')) };
  };
  const row = (panel: ReturnType<typeof within>, name: string) =>
    within(
      panel.getByRole('row', {
        name: (accessible: string) => accessible.startsWith(name),
      }),
    )
      .getAllByRole('cell')
      .map((cell) => cell.textContent);

  it('asks for nothing until it is opened', () => {
    renderWithProviders(<SupportFigures />);

    expect(adminApi.getSupportFigures).not.toHaveBeenCalled();
  });

  it('shows each measure in total and per service level, with a dash where there is nothing to measure', async () => {
    const { t, panel } = await openPanel();

    await panel.findByText(t('past_target', { count: 3 }));
    expect(adminApi.getSupportFigures).toHaveBeenCalledWith(7);
    expect(row(panel, t('opened'))).toEqual(['12', '0', '12']);
    expect(row(panel, t('first_within'))).toEqual(['80 %', '–', '80 %']);
    expect(row(panel, t('first_median'))).toEqual(['1 h', '–', '1 h']);
    expect(row(panel, t('resolution_within'))).toEqual(['67 %', '–', '67 %']);
    expect(row(panel, t('resolution_median'))).toEqual(['2 d', '–', '2 d']);
    expect(row(panel, t('ratings_good'))).toEqual(['75 %', '–', '75 %']);
  });

  it('asks again for the last 30 days', async () => {
    const { t, panel } = await openPanel();
    await panel.findByText(t('past_target', { count: 3 }));

    fireEvent.click(panel.getByRole('button', { name: t('days_30') }));

    await waitFor(() =>
      expect(adminApi.getSupportFigures).toHaveBeenLastCalledWith(30),
    );
  });

  it('says so when the figures cannot be read', async () => {
    vi.mocked(adminApi.getSupportFigures).mockRejectedValue(new Error('down'));
    const { panel } = await openPanel();

    expect(await panel.findByRole('alert')).toBeInTheDocument();
    expect(panel.queryByRole('table')).toBeNull();
  });
});
