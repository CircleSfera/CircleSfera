import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { creatorApi } from '../../services/creator.service';
import { renderWithProviders } from '../../test/test-utils';
import CreatorPromotionsTab from './CreatorPromotionsTab';

vi.mock('../../services/creator.service', () => ({
  creatorApi: {
    getPromotions: vi.fn(),
  },
}));

describe('CreatorPromotionsTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(creatorApi.getPromotions).mockResolvedValue({
      data: { data: [], meta: { total: 0, page: 1, limit: 10, totalPages: 0 } },
    } as never);
  });

  it('labels empty ads chrome from the EN catalog', async () => {
    const { i18n } = renderWithProviders(
      <CreatorPromotionsTab onToast={vi.fn()} />,
    );

    expect(
      await screen.findByText(i18n!.t('creator.promotions.no_active')),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: i18n!.t('creator.promotions.create_first'),
      }),
    ).toBeInTheDocument();
    expect(i18n!.t('creator.promotions.no_active')).toBe('No active campaigns');
    expect(screen.queryByText('Sin campañas activas')).not.toBeInTheDocument();
  });

  it('uses Spanish empty chrome when locale is es', async () => {
    const { i18n } = renderWithProviders(
      <CreatorPromotionsTab onToast={vi.fn()} />,
      { lng: 'es' },
    );

    expect(
      await screen.findByText(i18n!.t('creator.promotions.no_active')),
    ).toBeInTheDocument();
    expect(screen.queryByText('No active campaigns')).not.toBeInTheDocument();
  });
});
