import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/test-utils';
import FrameCoverPicker from './FrameCoverPicker';

function show(props: Partial<Parameters<typeof FrameCoverPicker>[0]> = {}) {
  const onChange = vi.fn();
  const view = renderWithProviders(
    <FrameCoverPicker
      src="https://media.test/f1.mp4"
      valueMs={null}
      onChange={onChange}
      {...props}
    />,
  );
  const video = screen.getByLabelText<HTMLVideoElement>('Cover preview');
  const slider = screen.getByRole<HTMLInputElement>('slider', {
    name: 'Moment of the video',
  });
  /** The browser has read how long the video is. */
  const loaded = (durationSec: number) => {
    Object.defineProperty(video, 'duration', {
      configurable: true,
      value: durationSec,
    });
    fireEvent.loadedMetadata(video);
  };
  return { onChange, video, slider, loaded, ...view };
}

describe('FrameCoverPicker', () => {
  it('cannot be moved until the length of the video is known', () => {
    const { slider, loaded } = show();
    expect(slider).toBeDisabled();

    loaded(12);

    expect(slider).toBeEnabled();
    expect(slider).toHaveAttribute('max', '12000');
  });

  it('says the cover is automatic until a moment is chosen', () => {
    const { loaded } = show();
    loaded(12);

    expect(screen.getByText('Automatic: chosen for you')).toBeInTheDocument();
  });

  it('reports the chosen moment in milliseconds from the start of the frame', () => {
    const { slider, loaded, onChange } = show();
    loaded(12);

    fireEvent.change(slider, { target: { value: '4200' } });

    expect(onChange).toHaveBeenCalledWith(4200);
  });

  it('shows the picture of the chosen moment and says when it is', () => {
    const { video, loaded } = show({ valueMs: 65_000 });
    loaded(90);

    expect(video.currentTime).toBe(65);
    expect(screen.getByText('At 1:05 of the video')).toBeInTheDocument();
  });

  it('moves only along the part a trimmed frame keeps', () => {
    const { video, slider, loaded } = show({
      startSec: 10,
      endSec: 25,
      valueMs: 3000,
    });
    loaded(60);

    expect(slider).toHaveAttribute('max', '15000');
    // Three seconds into the frame is thirteen into the original video.
    expect(video.currentTime).toBe(13);
  });

  it('never shows a moment past the end of the video', () => {
    const { video, slider, loaded } = show({ valueMs: 50_000 });
    loaded(8);

    expect(slider).toHaveValue('8000');
    expect(video.currentTime).toBe(8);
  });
});
