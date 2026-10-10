import { act, fireEvent, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/test-utils';
import AudioClipWaveform from './AudioClipWaveform';

const extract = vi.hoisted(() => vi.fn());
vi.mock('../../utils/audioWaveform', () => ({ extractAudioPeaks: extract }));

type Props = ComponentProps<typeof AudioClipWaveform>;

/** A three minute track with a thirty second window; the strip is 300 px wide. */
async function show(over: Partial<Props> = {}) {
  const onStartMsChange = vi.fn();
  const props: Props = {
    url: 'https://cdn.example/track.mp3',
    trackDurationMs: 180_000,
    windowMs: 30_000,
    startMs: 60_000,
    maxStartMs: 150_000,
    onStartMsChange,
    ...over,
  };
  const view = renderWithProviders(<AudioClipWaveform {...props} />);
  await act(async () => {});
  const strip = screen.getByRole('slider');
  strip.getBoundingClientRect = () =>
    ({ left: 100, width: 300, top: 0, height: 64 }) as DOMRect;
  strip.setPointerCapture = vi.fn();
  return { strip, onStartMsChange, props, ...view };
}

describe('AudioClipWaveform', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    extract.mockResolvedValue({ peaks: Array(72).fill(0.5), fromAudio: true });
  });

  it('reads the shape of the track and says so while it does', async () => {
    let finish: (value: unknown) => void = () => {};
    extract.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const view = renderWithProviders(
      <AudioClipWaveform
        url="https://cdn.example/track.mp3"
        seed="track-1"
        trackDurationMs={180_000}
        windowMs={30_000}
        startMs={0}
        maxStartMs={150_000}
        onStartMsChange={vi.fn()}
      />,
    );

    expect(screen.getByText('Loading waveform…')).toBeInTheDocument();
    expect(extract).toHaveBeenCalledWith('https://cdn.example/track.mp3', {
      barCount: 72,
      seed: 'track-1',
      signal: expect.any(AbortSignal),
    });

    await act(async () =>
      finish({ peaks: Array(72).fill(1), fromAudio: true }),
    );
    expect(screen.queryByText('Loading waveform…')).not.toBeInTheDocument();
    expect(
      view.container.querySelectorAll('[style*="height: 88%"]'),
    ).toHaveLength(72);
  });

  it('draws a flat shape when the track cannot be read', async () => {
    extract.mockRejectedValue(new Error('cors'));
    const { container } = await show();

    expect(screen.queryByText('Loading waveform…')).not.toBeInTheDocument();
    expect(container.querySelectorAll('[style*="height: 18%"]')).toHaveLength(
      72,
    );
  });

  it('stops reading when it goes away, and reads again for another track', async () => {
    const { rerender, props, unmount } = await show();
    const first = extract.mock.calls[0][1].signal as AbortSignal;

    rerender(
      <AudioClipWaveform {...props} url="https://cdn.example/other.mp3" />,
    );
    await act(async () => {});
    expect(first.aborted).toBe(true);
    expect(extract).toHaveBeenLastCalledWith(
      'https://cdn.example/other.mp3',
      expect.objectContaining({ seed: 'https://cdn.example/other.mp3' }),
    );

    const second = extract.mock.calls[1][1].signal as AbortSignal;
    unmount();
    expect(second.aborted).toBe(true);
  });

  it('tells assistive technology which part is chosen', async () => {
    const { strip } = await show();
    expect(strip).toHaveAccessibleName('Clip start position');
    expect(strip).toHaveAttribute('aria-valuenow', '60000');
    expect(strip).toHaveAttribute('aria-valuemax', '150000');
    expect(strip).toHaveAttribute('aria-valuetext', '60s – 90s');
  });

  it('takes the name it is given', async () => {
    const { strip } = await show({ 'aria-label': 'Where the music starts' });
    expect(strip).toHaveAccessibleName('Where the music starts');
  });

  it('marks the chosen part over the track', async () => {
    const { container } = await show();
    const window = container.querySelector('.border-x-2') as HTMLElement;
    expect(window.style.left).toBe(`${(60 / 180) * 100}%`);
    expect(window.style.width).toBe(`${(30 / 180) * 100}%`);
    // Twelve of the 72 bars fall inside thirty of 180 seconds.
    expect(container.querySelectorAll('.bg-brand-primary.flex-1')).toHaveLength(
      12,
    );
  });

  describe('with the pointer', () => {
    it('starts the clip where the strip is pressed', async () => {
      const { strip, onStartMsChange } = await show();

      fireEvent.pointerDown(strip, { pointerId: 1, clientX: 250 });

      expect(onStartMsChange).toHaveBeenCalledWith(90_000);
      expect(strip.setPointerCapture).toHaveBeenCalledWith(1);
    });

    it('follows the drag, only for the finger that pressed', async () => {
      const { strip, onStartMsChange } = await show();

      fireEvent.pointerDown(strip, { pointerId: 1, clientX: 250 });
      fireEvent.pointerMove(strip, { pointerId: 2, clientX: 100 });
      expect(onStartMsChange).toHaveBeenCalledTimes(1);

      fireEvent.pointerMove(strip, { pointerId: 1, clientX: 200 });
      expect(onStartMsChange).toHaveBeenLastCalledWith(60_000);
    });

    it('stops following on release or when the press is interrupted', async () => {
      const { strip, onStartMsChange } = await show();

      fireEvent.pointerDown(strip, { pointerId: 1, clientX: 250 });
      fireEvent.pointerUp(strip, { pointerId: 2 });
      fireEvent.pointerMove(strip, { pointerId: 1, clientX: 220 });
      expect(onStartMsChange).toHaveBeenCalledTimes(2);

      fireEvent.pointerCancel(strip, { pointerId: 1 });
      fireEvent.pointerMove(strip, { pointerId: 1, clientX: 130 });
      expect(onStartMsChange).toHaveBeenCalledTimes(2);
    });

    it('keeps the clip inside the track', async () => {
      const { strip, onStartMsChange } = await show();

      fireEvent.pointerDown(strip, { pointerId: 1, clientX: 5000 });
      expect(onStartMsChange).toHaveBeenLastCalledWith(150_000);

      fireEvent.pointerMove(strip, { pointerId: 1, clientX: -5000 });
      expect(onStartMsChange).toHaveBeenLastCalledWith(0);
    });
  });

  describe('with the keyboard', () => {
    it.each([
      ['ArrowRight', false, 60_250],
      ['ArrowUp', false, 60_250],
      ['ArrowLeft', false, 59_750],
      ['ArrowDown', false, 59_750],
      ['ArrowRight', true, 61_000],
      ['ArrowLeft', true, 59_000],
      ['Home', false, 0],
      ['End', false, 150_000],
    ])(
      '%s (Shift: %s) moves the start to %i ms',
      async (key, shiftKey, expected) => {
        const { strip, onStartMsChange } = await show();
        fireEvent.keyDown(strip, { key, shiftKey });
        expect(onStartMsChange).toHaveBeenCalledWith(expected);
      },
    );

    it('stops at both ends and leaves other keys alone', async () => {
      const atEnd = await show({ startMs: 149_900 });
      fireEvent.keyDown(atEnd.strip, { key: 'ArrowRight' });
      expect(atEnd.onStartMsChange).toHaveBeenCalledWith(150_000);
      fireEvent.keyDown(atEnd.strip, { key: 'a' });
      expect(atEnd.onStartMsChange).toHaveBeenCalledTimes(1);
      atEnd.unmount();

      const atStart = await show({ startMs: 100 });
      fireEvent.keyDown(atStart.strip, { key: 'ArrowLeft' });
      expect(atStart.onStartMsChange).toHaveBeenCalledWith(0);
    });
  });

  it.each([
    ['it is switched off', { disabled: true }],
    ['the track is no longer than the clip', { maxStartMs: 0, startMs: 0 }],
  ])('does not move when %s', async (_why, over) => {
    const { strip, onStartMsChange } = await show(over);

    fireEvent.pointerDown(strip, { pointerId: 1, clientX: 250 });
    fireEvent.pointerMove(strip, { pointerId: 1, clientX: 200 });
    fireEvent.keyDown(strip, { key: 'ArrowRight' });

    expect(onStartMsChange).not.toHaveBeenCalled();
    expect(strip).toHaveAttribute('aria-disabled', 'true');
  });

  it('shows the whole strip as chosen for a track of unknown length', async () => {
    const { container, strip, onStartMsChange } = await show({
      trackDurationMs: 0,
      startMs: 0,
    });
    const window = container.querySelector('.border-x-2') as HTMLElement;
    expect(window.style.left).toBe('0%');
    expect(window.style.width).toBe('100%');

    fireEvent.pointerDown(strip, { pointerId: 1, clientX: 250 });
    expect(onStartMsChange).toHaveBeenCalledWith(0);
    fireEvent.pointerMove(strip, { pointerId: 1, clientX: 200 });
    expect(onStartMsChange).toHaveBeenCalledTimes(1);
  });
});
