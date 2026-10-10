import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MediaFile } from '../../hooks/useCreatePost';
import { renderWithProviders } from '../../test/test-utils';
import InteractiveMediaPreview from './InteractiveMediaPreview';

vi.mock('../Carousel', () => ({
  default: ({
    media,
    aspectRatio,
  }: {
    media: { url: string }[];
    aspectRatio: string;
  }) => (
    <div data-testid="carousel" data-shape={aspectRatio}>
      {media.map((m) => m.url).join(',')}
    </div>
  ),
}));

const file = (url: string, type: 'image' | 'video'): MediaFile => ({
  file: new File(['x'], 'a'),
  url,
  type,
});

describe('InteractiveMediaPreview', () => {
  let play: ReturnType<typeof vi.fn>;
  let pause: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    play = vi.fn().mockResolvedValue(undefined);
    pause = vi.fn();
    HTMLMediaElement.prototype.play = play as never;
    HTMLMediaElement.prototype.pause = pause as never;
  });

  const video = () => document.querySelector('video') as HTMLVideoElement;

  it('plays a single video silently, with its own controls', () => {
    renderWithProviders(
      <InteractiveMediaPreview
        mediaFiles={[file('blob:v', 'video')]}
        mode="FRAME"
      />,
    );

    expect(video()).toHaveAttribute('src', 'blob:v');
    expect(video().muted).toBe(true);
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
    expect(screen.queryByTestId('carousel')).toBeNull();
  });

  it('pauses and plays from its button and from a tap on the video', () => {
    renderWithProviders(
      <InteractiveMediaPreview
        mediaFiles={[file('blob:v', 'video')]}
        mode="FRAME"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect(pause).toHaveBeenCalledTimes(1);

    fireEvent.click(video());
    expect(play).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
  });

  it('switches the sound', () => {
    renderWithProviders(
      <InteractiveMediaPreview
        mediaFiles={[file('blob:v', 'video')]}
        mode="FRAME"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Unmute' }));

    expect(video().muted).toBe(false);
    expect(screen.getByRole('button', { name: 'Mute' })).toBeInTheDocument();
  });

  it('moves the video from its bar, once its length is known', () => {
    renderWithProviders(
      <InteractiveMediaPreview
        mediaFiles={[file('blob:v', 'video')]}
        mode="FRAME"
      />,
    );
    Object.defineProperty(video(), 'duration', {
      configurable: true,
      value: 40,
    });
    fireEvent.loadedMetadata(video());
    const bar = screen.getByTitle('Scrub timeline');
    expect(bar).toHaveAttribute('max', '40');

    fireEvent.change(bar, { target: { value: '12.5' } });

    expect(video().currentTime).toBe(12.5);
  });

  it('shows play again when the video ends', () => {
    renderWithProviders(
      <InteractiveMediaPreview
        mediaFiles={[file('blob:v', 'video')]}
        mode="FRAME"
      />,
    );

    fireEvent.ended(video());

    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
  });

  it.each([
    ['POST', 'aspect-4/5'],
    ['STORY', 'aspect-9/16'],
  ] as const)(
    'shows photos, or several files, as a carousel in the shape of a %s',
    (mode, shape) => {
      renderWithProviders(
        <InteractiveMediaPreview
          mediaFiles={[file('blob:a', 'image'), file('blob:v', 'video')]}
          mode={mode}
        />,
      );

      expect(screen.getByTestId('carousel')).toHaveTextContent('blob:a,blob:v');
      expect(screen.getByTestId('carousel')).toHaveAttribute(
        'data-shape',
        shape,
      );
      expect(document.querySelector('video')).toBeNull();
    },
  );
});
