import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { liveApi } from '../../services/live';
import LiveGiftModal from './LiveGiftModal';

vi.mock('../../services/live', () => ({
  liveApi: {
    sendGift: vi.fn(),
  },
}));

describe('LiveGiftModal', () => {
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when closed', () => {
    const { container } = render(
      <LiveGiftModal isOpen={false} onClose={onClose} streamId="stream-1" />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('renders the gift grid with the first gift selected by default', () => {
    render(<LiveGiftModal isOpen onClose={onClose} streamId="stream-1" />);

    expect(screen.getByText('Estrella Sfera')).toBeInTheDocument();
    expect(screen.getByText('Corona Real')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Enviar Regalo.*€1/ }),
    ).toBeInTheDocument();
  });

  it('updates the confirm button price when a different gift is selected', () => {
    render(<LiveGiftModal isOpen onClose={onClose} streamId="stream-1" />);

    fireEvent.click(screen.getByText('Corona Real'));

    expect(
      screen.getByRole('button', { name: /Enviar Regalo.*€10/ }),
    ).toBeInTheDocument();
  });

  it('starts Stripe checkout for the selected gift', async () => {
    vi.mocked(liveApi.sendGift).mockResolvedValue({
      url: 'https://checkout.stripe.com/test',
      liveGiftId: 'gift-1',
      giftId: 'gem',
      amountCents: 2500,
    });
    const hrefSpy = vi.fn();
    Object.defineProperty(window, 'location', {
      value: { href: 'http://localhost/live/stream-1', assign: hrefSpy },
      writable: true,
    });

    render(<LiveGiftModal isOpen onClose={onClose} streamId="stream-1" />);

    fireEvent.click(screen.getByText('Diamante'));
    fireEvent.click(screen.getByRole('button', { name: /Enviar Regalo.*€25/ }));

    await vi.waitFor(() => {
      expect(liveApi.sendGift).toHaveBeenCalledWith(
        'stream-1',
        'gem',
        expect.any(String),
      );
    });
  });

  it('calls onClose when the close button is clicked', () => {
    render(<LiveGiftModal isOpen onClose={onClose} streamId="stream-1" />);

    const closeButton = screen
      .getAllByRole('button')
      .find((btn) => !btn.textContent?.includes('Enviar Regalo'));
    expect(closeButton).toBeDefined();
    fireEvent.click(closeButton as HTMLElement);

    expect(onClose).toHaveBeenCalled();
  });
});
