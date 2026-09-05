import { fireEvent, screen, waitFor } from '@testing-library/react';
import { toast } from 'react-hot-toast';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../services';
import { renderWithProviders } from '../../test/test-utils';
import TipModal from './TipModal';

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
    renderWithProviders(
      <TipModal
        isOpen
        onClose={onClose}
        receiverId="creator-1"
        receiverName="alice"
        postId="post-1"
      />,
    );

    expect(screen.getByText('Send Gift')).toBeInTheDocument();
    expect(screen.getByText('Support alice with a tip')).toBeInTheDocument();
    expect(screen.getByText('$1')).toBeInTheDocument();
    expect(screen.getByText('$5')).toBeInTheDocument();
    expect(screen.getByText('$10')).toBeInTheDocument();
    expect(screen.getByText('$50')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send Tip' })).toBeDisabled();
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
    renderWithProviders(
      <TipModal
        isOpen
        onClose={onClose}
        receiverId="creator-1"
        receiverName="alice"
        postId="post-1"
      />,
    );

    fireEvent.click(screen.getByText('$5'));
    fireEvent.click(screen.getByRole('button', { name: 'Send Tip' }));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/monetization/tip', {
        receiverId: 'creator-1',
        postId: 'post-1',
        amountCents: 500,
        returnUrl: 'http://localhost/p/post-1',
      });
    });
    expect(window.location.href).toBe(checkoutUrl);
  });

  it('omits a post when tipping a profile and toasts a failed send', async () => {
    vi.mocked(api.post).mockRejectedValueOnce({
      message: 'Insufficient funds',
    });

    renderWithProviders(
      <TipModal
        isOpen
        onClose={onClose}
        receiverId="creator-1"
        receiverName="alice"
      />,
    );

    fireEvent.click(screen.getByText('$1'));
    fireEvent.click(screen.getByRole('button', { name: 'Send Tip' }));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/monetization/tip', {
        receiverId: 'creator-1',
        postId: undefined,
        amountCents: 100,
        returnUrl: 'http://localhost/p/post-1',
      });
    });
    expect(toast.error).toHaveBeenCalledWith('Insufficient funds');
    expect(window.location.href).toBe('http://localhost/p/post-1');
  });

  it('clears the selected amount when the dialog reopens', () => {
    const props = {
      onClose,
      receiverId: 'creator-1',
      receiverName: 'alice',
    };
    const view = renderWithProviders(<TipModal isOpen {...props} />);

    fireEvent.click(screen.getByText('$10'));
    expect(screen.getByRole('button', { name: 'Send Tip' })).toBeEnabled();

    view.rerender(<TipModal isOpen={false} {...props} />);
    view.rerender(<TipModal isOpen {...props} />);

    expect(screen.getByRole('button', { name: 'Send Tip' })).toBeDisabled();
    expect(api.post).not.toHaveBeenCalled();
  });
});
