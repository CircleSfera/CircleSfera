import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/test-utils';
import type { Post } from '../../types';
import PostMedia from './PostMedia';

const pieces = vi.hoisted(() => ({
  carousel: {} as Record<string, unknown>,
}));

vi.mock('../Carousel', () => ({
  default: (props: Record<string, unknown>) => {
    pieces.carousel = props;
    return <div data-testid="carousel" />;
  },
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
  beforeEach(() => {
    vi.clearAllMocks();
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
  });
});
