import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { creatorApi } from '../../services/creator.service';
import { useAuthStore } from '../../stores/authStore';
import { renderWithProviders } from '../../test/test-utils';
import CreatorPromotionsTab from './CreatorPromotionsTab';

const sells = vi.hoisted(() => ({ value: true }));
vi.mock('../../utils/sellsInApp', () => ({ sellsInApp: () => sells.value }));

vi.mock('../../services/creator.service', () => ({
  creatorApi: {
    getPromotionsOnSale: vi.fn(async () => ({ data: { onSale: true } })),
    getPromotions: vi.fn(),
  },
}));

describe('CreatorPromotionsTab', () => {
  beforeEach(() => {
    // Promotions are offered to a Creator or Business Profile.
    useAuthStore.setState({
      profile: { id: 'p1', accountType: 'CREATOR' } as never,
    });
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
    expect(i18n!.t('creator.promotions.no_active')).toBe('No campaigns yet');
    expect(
      screen.queryByText('Aún no tienes campañas'),
    ).not.toBeInTheDocument();
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

  it('in the apps offers no way to start a campaign', async () => {
    sells.value = false;
    const { i18n } = renderWithProviders(
      <CreatorPromotionsTab onToast={vi.fn()} />,
    );

    expect(
      await screen.findByText(i18n!.t('creator.promotions.no_active')),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', {
        name: i18n!.t('creator.promotions.create_first'),
      }),
    ).not.toBeInTheDocument();
    sells.value = true;
  });

  it('offers no new campaign while promotions are not on sale, and says so', async () => {
    vi.mocked(creatorApi.getPromotionsOnSale).mockResolvedValue({
      data: { onSale: false },
    } as never);
    const { i18n } = renderWithProviders(
      <CreatorPromotionsTab onToast={vi.fn()} />,
    );
    expect(
      await screen.findByTestId('promotions-not-on-sale'),
    ).toHaveTextContent(i18n!.t('creator.promotions.not_on_sale'));
    await screen.findByText(i18n!.t('creator.promotions.no_active'));
    expect(
      screen.queryByRole('button', {
        name: i18n!.t('creator.promotions.create_first'),
      }),
    ).toBeNull();
  });

  it('says nothing about sale while the answer is awaited or failed', async () => {
    vi.mocked(creatorApi.getPromotionsOnSale).mockRejectedValue(new Error('x'));
    const { i18n } = renderWithProviders(
      <CreatorPromotionsTab onToast={vi.fn()} />,
    );
    await screen.findByText(i18n!.t('creator.promotions.no_active'));
    expect(screen.queryByTestId('promotions-not-on-sale')).toBeNull();
    expect(
      screen.queryByRole('button', {
        name: i18n!.t('creator.promotions.create_first'),
      }),
    ).toBeNull();
  });
});
