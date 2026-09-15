import { fireEvent, screen, waitFor } from '@testing-library/react';
import { toast } from 'react-hot-toast';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../services';
import { renderWithProviders } from '../../test/test-utils';
import TipModal, { TIP_AMOUNTS } from './TipModal';

vi.mock('../../services', () => ({
  api: {
    post: vi.fn(),
  },
}));

vi.mock('react-hot-toast', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

const checkoutUrl = 'https://checkout.stripe.com/c/pay/cs_test_tip';

describe('TipModal', () => {
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.post).mockResolvedValue({
      data: { url: checkoutUrl },
    } as never);
    Object.defineProperty(window, 'location', {
      configurable: true,
      writable: true,
      value: { href: 'http://localhost/p/post-1' },
    });
  });

  it('renders nothing when closed', () => {
    renderWithProviders(
      <TipModal
        isOpen={false}
        onClose={onClose}
        receiverId="creator-1"
        receiverName="alice"
      />,
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  it('keeps send disabled until an amount is chosen', () => {
    const { i18n } = renderWithProviders(
      <TipModal
        isOpen
        onClose={onClose}
        receiverId="creator-1"
        receiverName="alice"
        postId="post-1"
      />,
    );

    expect(screen.getByText(i18n!.t('wallet.send_gift'))).toBeInTheDocument();
    expect(
      screen.getByText(i18n!.t('wallet.support_with_money', { name: 'alice' })),
    ).toBeInTheDocument();
    expect(i18n!.t('wallet.send_tip')).toBe('Send Tip');
    expect(
      screen.queryByText('Apoya a alice con una propina'),
    ).not.toBeInTheDocument();
    for (const amount of TIP_AMOUNTS) {
      expect(screen.getByText(`$${amount}`)).toBeInTheDocument();
    }
    expect(
      screen.getByRole('button', { name: i18n!.t('wallet.send_tip') }),
    ).toBeDisabled();
    expect(api.post).not.toHaveBeenCalled();
  });

  it('closes from the dialog X without starting checkout', () => {
    renderWithProviders(
      <TipModal
        isOpen
        onClose={onClose}
        receiverId="creator-1"
        receiverName="alice"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /close dialog/i }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(api.post).not.toHaveBeenCalled();
  });

  it('posts amountCents as dollars times 100 and redirects to Checkout', async () => {
    const five = TIP_AMOUNTS[1];
    const { i18n } = renderWithProviders(
      <TipModal
        isOpen
        onClose={onClose}
        receiverId="creator-1"
        receiverName="alice"
        postId="post-1"
      />,
    );

    fireEvent.click(screen.getByText(`$${five}`));
    fireEvent.click(
      screen.getByRole('button', { name: i18n!.t('wallet.send_tip') }),
    );

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/monetization/tip', {
        receiverId: 'creator-1',
        postId: 'post-1',
        amountCents: five * 100,
        returnUrl: 'http://localhost/p/post-1',
      });
    });
    expect(window.location.href).toBe(checkoutUrl);
  });

  it('omits a post when tipping a profile and toasts a failed send', async () => {
    vi.mocked(api.post).mockRejectedValueOnce({
      message: 'Insufficient funds',
    });

    const one = TIP_AMOUNTS[0];
    const { i18n } = renderWithProviders(
      <TipModal
        isOpen
        onClose={onClose}
        receiverId="creator-1"
        receiverName="alice"
      />,
    );

    fireEvent.click(screen.getByText(`$${one}`));
    fireEvent.click(
      screen.getByRole('button', { name: i18n!.t('wallet.send_tip') }),
    );

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/monetization/tip', {
        receiverId: 'creator-1',
        postId: undefined,
        amountCents: one * 100,
        returnUrl: 'http://localhost/p/post-1',
      });
    });
    expect(toast.error).toHaveBeenCalledWith('Insufficient funds');
    expect(window.location.href).toBe('http://localhost/p/post-1');
  });

  it('clears the selected amount when the dialog reopens', () => {
    const ten = TIP_AMOUNTS[2];
    const props = {
      onClose,
      receiverId: 'creator-1',
      receiverName: 'alice',
    };
    const view = renderWithProviders(<TipModal isOpen {...props} />);

    fireEvent.click(screen.getByText(`$${ten}`));
    expect(
      screen.getByRole('button', { name: view.i18n!.t('wallet.send_tip') }),
    ).toBeEnabled();

    view.rerender(<TipModal isOpen={false} {...props} />);
    view.rerender(<TipModal isOpen {...props} />);

    expect(
      screen.getByRole('button', { name: view.i18n!.t('wallet.send_tip') }),
    ).toBeDisabled();
    expect(api.post).not.toHaveBeenCalled();
  });
});
