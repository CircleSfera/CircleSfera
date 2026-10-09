import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { MediaFile } from '../../hooks/useCreatePost';
import { renderWithProviders } from '../../test/test-utils';
import CoverSubScreen from './CoverSubScreen';

const video = (trim?: { startTime: number; endTime: number }): MediaFile => ({
  file: new File(['x'], 'a.mp4', { type: 'video/mp4' }),
  url: 'blob:vid',
  type: 'video',
  videoData: trim && { ...trim, muted: false },
});

function show(props: Partial<Parameters<typeof CoverSubScreen>[0]> = {}) {
  const setCoverTimeMs = vi.fn();
  const onClose = vi.fn();
  renderWithProviders(
    <CoverSubScreen
      mediaFiles={[video()]}
      coverTimeMs={null}
      setCoverTimeMs={setCoverTimeMs}
      onClose={onClose}
      {...props}
    />,
  );
  const preview = screen.getByLabelText<HTMLVideoElement>('Cover preview');
  Object.defineProperty(preview, 'duration', { configurable: true, value: 30 });
  fireEvent.loadedMetadata(preview);
  return { setCoverTimeMs, onClose, preview };
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
});
