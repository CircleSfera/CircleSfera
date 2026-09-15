import { fireEvent, screen, waitFor } from '@testing-library/react';
import { toast } from 'react-hot-toast';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { liveApi } from '../../services/live';
import { renderWithProviders } from '../../test/test-utils';
import LiveGiftModal, { VIRTUAL_GIFTS } from './LiveGiftModal';

vi.mock('../../services/live', () => ({
  liveApi: {
    sendGift: vi.fn(),
  },
}));

vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

describe('LiveGiftModal', () => {
  const onClose = vi.fn();
  const star = VIRTUAL_GIFTS.find((g) => g.id === 'star');
  const crown = VIRTUAL_GIFTS.find((g) => g.id === 'crown');
  const gem = VIRTUAL_GIFTS.find((g) => g.id === 'gem');

  beforeEach(() => {
    vi.clearAllMocks();
    if (!star || !crown || !gem) {
      throw new Error('VIRTUAL_GIFTS is missing star/crown/gem');
    }
  });

  it('renders nothing when closed', () => {
    const { container } = renderWithProviders(
      <LiveGiftModal isOpen={false} onClose={onClose} streamId="stream-1" />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('uses catalog gift names and chrome, not Spanish fallbacks', () => {
    const { i18n } = renderWithProviders(
      <LiveGiftModal isOpen onClose={onClose} streamId="stream-1" />,
    );

    expect(i18n!.t('live.send_gift_title')).toBe('Send a virtual gift');
    expect(i18n!.t(star!.nameKey)).toBe('Sfera Star');
    expect(
      screen.getByText(i18n!.t('live.send_gift_title')),
    ).toBeInTheDocument();
    expect(
      screen.getByText(i18n!.t('live.send_gift_desc')),
    ).toBeInTheDocument();
    expect(screen.getByText(i18n!.t(star!.nameKey))).toBeInTheDocument();
    expect(screen.getByText(i18n!.t(crown!.nameKey))).toBeInTheDocument();
    expect(screen.queryByText('Estrella Sfera')).not.toBeInTheDocument();
    expect(screen.queryByText('Enviar Regalo Virtual')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: new RegExp(
          `${i18n!.t('live.confirm_send_gift')}.*€${star!.price}`,
        ),
      }),
    ).toBeInTheDocument();
  });

  it('uses Spanish catalog gift names', () => {
    const { i18n } = renderWithProviders(
      <LiveGiftModal isOpen onClose={onClose} streamId="stream-1" />,
      { lng: 'es' },
    );

    expect(i18n!.t(star!.nameKey)).toBe('Estrella Sfera');
    expect(screen.getByText(i18n!.t(star!.nameKey))).toBeInTheDocument();
    expect(
      screen.getByText(i18n!.t('live.send_gift_title')),
    ).toBeInTheDocument();
  });

  it('updates the confirm button price when a different gift is selected', () => {
    const { i18n } = renderWithProviders(
      <LiveGiftModal isOpen onClose={onClose} streamId="stream-1" />,
    );

    fireEvent.click(screen.getByText(i18n!.t(crown!.nameKey)));

    expect(
      screen.getByRole('button', {
        name: new RegExp(
          `${i18n!.t('live.confirm_send_gift')}.*€${crown!.price}`,
        ),
      }),
    ).toBeInTheDocument();
  });

  it('starts Stripe checkout for the selected gift', async () => {
    vi.mocked(liveApi.sendGift).mockResolvedValue({
      url: 'https://checkout.stripe.com/test',
      liveGiftId: 'gift-1',
      giftId: gem!.id,
      amountCents: gem!.price * 100,
    });
    Object.defineProperty(window, 'location', {
      value: { href: 'http://localhost/live/stream-1' },
      writable: true,
    });

    const { i18n } = renderWithProviders(
      <LiveGiftModal isOpen onClose={onClose} streamId="stream-1" />,
    );

    fireEvent.click(screen.getByText(i18n!.t(gem!.nameKey)));
    fireEvent.click(
      screen.getByRole('button', {
        name: new RegExp(
          `${i18n!.t('live.confirm_send_gift')}.*€${gem!.price}`,
        ),
      }),
    );

    await waitFor(() => {
      expect(liveApi.sendGift).toHaveBeenCalledWith(
        'stream-1',
        gem!.id,
        expect.any(String),
      );
    });
  });

  it('toasts catalog copy when checkout URL is missing', async () => {
    vi.mocked(liveApi.sendGift).mockResolvedValue({
      url: '',
      liveGiftId: 'gift-1',
      giftId: star!.id,
      amountCents: star!.price * 100,
    });

    const { i18n } = renderWithProviders(
      <LiveGiftModal isOpen onClose={onClose} streamId="stream-1" />,
    );

    fireEvent.click(
      screen.getByRole('button', {
        name: new RegExp(
          `${i18n!.t('live.confirm_send_gift')}.*€${star!.price}`,
        ),
      }),
    );

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        i18n!.t('live.gift_checkout_missing'),
      );
    });
    expect(i18n!.t('live.gift_checkout_missing')).toBe(
      'Could not start checkout',
    );
    expect(toast.error).not.toHaveBeenCalledWith('No se pudo iniciar el pago');
  });

  it('calls onClose when the close button is clicked', () => {
    renderWithProviders(
      <LiveGiftModal isOpen onClose={onClose} streamId="stream-1" />,
    );

    fireEvent.click(screen.getByRole('button', { name: /close dialog/i }));

    expect(onClose).toHaveBeenCalled();
  });
});
