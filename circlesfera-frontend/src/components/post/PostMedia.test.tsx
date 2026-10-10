import { fireEvent, screen, waitFor } from '@testing-library/react';
import { toast } from 'react-hot-toast';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { monetizationApi } from '../../services/monetization.service';
import { renderWithProviders } from '../../test/test-utils';
import type { Post } from '../../types';
import PostMedia from './PostMedia';

const pieces = vi.hoisted(() => ({
  carousel: {} as Record<string, unknown>,
  reportPaymentError: vi.fn(),
}));

vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock('../../services/monetization.service', () => ({
  monetizationApi: { unlockPost: vi.fn() },
}));
vi.mock('../../utils/identityVerification', () => ({
  reportPaymentError: pieces.reportPaymentError,
}));
vi.mock('../Carousel', () => ({
  default: (props: Record<string, unknown>) => {
    pieces.carousel = props;
    return <div data-testid="carousel" />;
  },
}));
vi.mock('../monetization/PaywallOverlay', () => ({
  default: ({
    price,
    onUnlock,
    isLoading,
  }: {
    price: number;
    onUnlock: () => void;
    isLoading: boolean;
  }) => (
    <button type="button" onClick={onUnlock} disabled={isLoading}>
      unlock for {price}
    </button>
  ),
}));

const post = (over: Partial<Post> = {}): Post =>
  ({
    id: 'p1',
    media: [
      {
        id: 'm1',
        url: 'a.jpg',
        type: 'image',
        standardUrl: null,
        thumbnailUrl: null,
        filter: null,
      },
      {
        id: 'm2',
        url: 'b.mp4',
        type: 'video',
        standardUrl: 'b-std.mp4',
        thumbnailUrl: 'b.jpg',
        filter: 'sepia',
      },
    ],
    ...over,
  }) as Post;

describe('PostMedia', () => {
  const location = window.location;
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...location, href: 'http://localhost/p/p1' },
    });
  });
  afterEach(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: location,
    });
  });

  it('shows nothing for a post with no media', () => {
    const none = renderWithProviders(<PostMedia post={post({ media: [] })} />);
    expect(none.container).toBeEmptyDOMElement();
    none.unmount();

    const missing = renderWithProviders(
      <PostMedia post={post({ media: undefined })} />,
    );
    expect(missing.container).toBeEmptyDOMElement();
  });

  it('hands the media to the carousel, in the upright shape of the feed', () => {
    renderWithProviders(
      <PostMedia
        post={post({ audio: { url: 'song.mp3' } as never, audioStartMs: 4000 })}
        priority
      />,
    );

    expect(pieces.carousel).toMatchObject({
      aspectRatio: 'aspect-4/5',
      objectFit: 'cover',
      priority: true,
      libraryAudioUrl: 'song.mp3',
      libraryAudioStartMs: 4000,
    });
    expect(pieces.carousel.media).toEqual([
      expect.objectContaining({
        url: 'a.jpg',
        standardUrl: undefined,
        thumbnailUrl: undefined,
        filter: undefined,
      }),
      expect.objectContaining({
        url: 'b.mp4',
        standardUrl: 'b-std.mp4',
        thumbnailUrl: 'b.jpg',
        filter: 'sepia',
      }),
    ]);
  });

  it('fills the height it is given, and keeps a see-through background when asked', () => {
    const { container } = renderWithProviders(
      <PostMedia
        post={post()}
        className="h-full bg-transparent"
        aspectRatio="aspect-square"
        objectFit="contain"
      />,
    );

    expect(pieces.carousel).toMatchObject({
      aspectRatio: 'aspect-square aspect-auto',
      objectFit: 'contain',
      className: 'h-full bg-transparent!',
      libraryAudioStartMs: 0,
    });
    expect(container.firstElementChild?.className).not.toContain('bg-black');
  });

  describe('sensitive content', () => {
    const blurred = (container: HTMLElement) =>
      (
        screen.getByTestId('carousel').parentElement as HTMLElement
      ).className.includes('blur-xl') && !!container;

    it('is blurred with a notice until the person presses it', () => {
      const { container } = renderWithProviders(
        <PostMedia post={post({ shouldBlurSensitive: true })} />,
      );
      expect(blurred(container)).toBe(true);

      fireEvent.click(
        screen.getByRole('button', {
          name: /Sensitive content blurred.*Tap to view/,
        }),
      );

      expect(blurred(container)).toBe(false);
      expect(
        screen.queryByText('Sensitive content blurred'),
      ).not.toBeInTheDocument();
    });

    it('is not blurred for a post that is not marked', () => {
      const { container } = renderWithProviders(<PostMedia post={post()} />);
      expect(blurred(container)).toBe(false);
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });

    it('stays blurred behind the paywall of a locked post, with only the paywall to press', () => {
      const { container } = renderWithProviders(
        <PostMedia
          post={post({
            shouldBlurSensitive: true,
            isLocked: true,
            priceCents: 499,
          })}
        />,
      );
      expect(blurred(container)).toBe(true);
      expect(screen.getAllByRole('button')).toHaveLength(1);
    });
  });

  describe('a locked post', () => {
    const locked = post({ isLocked: true, priceCents: 499 });
    const unlock = () => screen.getByRole('button', { name: /^unlock for/ });

    it('shows its price in whole units and tells the carousel it is locked', () => {
      renderWithProviders(<PostMedia post={locked} />);
      expect(unlock()).toHaveTextContent('unlock for 4.99');
      expect(pieces.carousel.isLocked).toBe(true);
    });

    it('shows zero for a locked post with no price', () => {
      renderWithProviders(<PostMedia post={post({ isLocked: true })} />);
      expect(unlock()).toHaveTextContent('unlock for 0');
    });

    it('goes to the payment page the server gives, coming back to this page', async () => {
      vi.mocked(monetizationApi.unlockPost).mockResolvedValue({
        url: 'https://pay.example/s1',
      } as never);
      renderWithProviders(<PostMedia post={locked} />);

      fireEvent.click(unlock());

      await waitFor(() =>
        expect(window.location.href).toBe('https://pay.example/s1'),
      );
      expect(monetizationApi.unlockPost).toHaveBeenCalledWith(
        'p1',
        'http://localhost/p/p1',
      );
      expect(toast.success).not.toHaveBeenCalled();
    });

    it('says the post is unlocked when no payment page is needed', async () => {
      vi.mocked(monetizationApi.unlockPost).mockResolvedValue({} as never);
      renderWithProviders(<PostMedia post={locked} />);

      fireEvent.click(unlock());

      await waitFor(() =>
        expect(toast.success).toHaveBeenCalledWith(
          'Post successfully unlocked!',
        ),
      );
      expect(window.location.href).toBe('http://localhost/p/p1');
    });

    it('explains a payment that could not start', async () => {
      const failure = new Error('declined');
      vi.mocked(monetizationApi.unlockPost).mockRejectedValue(failure);
      renderWithProviders(<PostMedia post={locked} />);

      fireEvent.click(unlock());

      await waitFor(() =>
        expect(pieces.reportPaymentError).toHaveBeenCalledWith(
          failure,
          expect.any(Function),
          'post.media.unlock_error',
        ),
      );
    });

    it('takes no second press while the unlock is on its way', async () => {
      vi.mocked(monetizationApi.unlockPost).mockReturnValue(
        new Promise(() => {}),
      );
      renderWithProviders(<PostMedia post={locked} />);

      fireEvent.click(unlock());

      await waitFor(() => expect(unlock()).toBeDisabled());
    });
  });
});
