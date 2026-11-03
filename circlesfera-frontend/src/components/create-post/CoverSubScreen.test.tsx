import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { MediaFile } from '../../hooks/useCreatePost';
import { renderWithProviders } from '../../test/test-utils';
import CoverSubScreen from './CoverSubScreen';

const drawn = vi.hoisted(() => ({
  file: new File(['jpg'], 'frame-cover.jpg', { type: 'image/jpeg' }),
}));
vi.mock('../frames/frameCoverImage', () => ({
  frameCoverImage: vi.fn(async () => drawn.file),
}));

const video = (trim?: { startTime: number; endTime: number }): MediaFile => ({
  file: new File(['x'], 'a.mp4', { type: 'video/mp4' }),
  url: 'blob:vid',
  type: 'video',
  videoData: trim && { ...trim, muted: false },
});

function show(props: Partial<Parameters<typeof CoverSubScreen>[0]> = {}) {
  const setCoverTimeMs = vi.fn();
  const setCoverImage = vi.fn();
  const onClose = vi.fn();
  renderWithProviders(
    <CoverSubScreen
      mediaFiles={[video()]}
      coverTimeMs={null}
      setCoverTimeMs={setCoverTimeMs}
      coverImage={null}
      setCoverImage={setCoverImage}
      onClose={onClose}
      {...props}
    />,
  );
  const preview = screen.getByLabelText<HTMLVideoElement>('Cover preview');
  Object.defineProperty(preview, 'duration', { configurable: true, value: 30 });
  fireEvent.loadedMetadata(preview);
  return { setCoverTimeMs, setCoverImage, onClose, preview };
}

describe('CoverSubScreen', () => {
  it('chooses a moment of the video being published', () => {
    const { setCoverTimeMs, preview } = show();
    expect(preview).toHaveAttribute('src', 'blob:vid');

    fireEvent.change(
      screen.getByRole('slider', { name: 'Moment of the video' }),
      { target: { value: '9000' } },
    );

    expect(setCoverTimeMs).toHaveBeenCalledWith(9000);
  });

  it('counts the moment from where a trimmed frame starts', () => {
    const { preview } = show({
      mediaFiles: [video({ startTime: 5, endTime: 20 })],
      coverTimeMs: 2000,
    });

    expect(preview.currentTime).toBe(7);
    expect(
      screen.getByRole('slider', { name: 'Moment of the video' }),
    ).toHaveAttribute('max', '15000');
  });

  it('goes back to the automatic cover on request, only when one is chosen', () => {
    const { setCoverTimeMs } = show({ coverTimeMs: 4000 });

    fireEvent.click(
      screen.getByRole('button', { name: 'Use the automatic cover' }),
    );

    expect(setCoverTimeMs).toHaveBeenCalledWith(null);
  });

  it('does not offer going back when the cover is already the automatic one', () => {
    show();

    expect(
      screen.queryByRole('button', { name: 'Use the automatic cover' }),
    ).not.toBeInTheDocument();
  });

  it('returns to the caption step with the back arrow', () => {
    const { onClose } = show();

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('takes an image from the gallery, framed at 9:16, in place of a moment', async () => {
    const { setCoverTimeMs, setCoverImage } = show({ coverTimeMs: 9000 });

    fireEvent.change(screen.getByTestId('frame-cover-image-input'), {
      target: {
        files: [new File(['png'], 'beach.png', { type: 'image/png' })],
      },
    });
    expect(screen.getByTestId('frame-cover-image-crop')).toBeInTheDocument();
    const image = screen.getByRole('img', { name: 'Cover image' });
    fireEvent.load(image);
    fireEvent.click(screen.getByRole('button', { name: 'Use as cover' }));

    await vi.waitFor(() =>
      expect(setCoverImage).toHaveBeenCalledWith(drawn.file),
    );
    // A moment chosen before is dropped.
    expect(setCoverTimeMs).toHaveBeenCalledWith(null);
  });

  it('goes back to the moments when the image is not used', () => {
    const { setCoverImage } = show();
    fireEvent.change(screen.getByTestId('frame-cover-image-input'), {
      target: {
        files: [new File(['png'], 'beach.png', { type: 'image/png' })],
      },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByTestId('frame-cover-image-crop')).toBeNull();
    expect(setCoverImage).not.toHaveBeenCalled();
  });

  it('shows the image chosen, and removes it', () => {
    const setCoverImage = vi.fn();
    renderWithProviders(
      <CoverSubScreen
        mediaFiles={[video()]}
        coverTimeMs={null}
        setCoverTimeMs={vi.fn()}
        coverImage={drawn.file}
        setCoverImage={setCoverImage}
        onClose={vi.fn()}
      />,
    );

    expect(
      screen.getByRole('img', { name: 'Cover image' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('slider')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Remove the image' }));
    expect(setCoverImage).toHaveBeenCalledWith(null);
  });
});
