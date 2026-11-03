import { act, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/test-utils';
import FrameClipsTimeline from './FrameClipsTimeline';
import { type FrameClip, wholeClip } from './frameClips';
import {
  TIMELINE_HOLD_MS,
  TIMELINE_HOLD_SLOP_PX,
  TIMELINE_KEY_STEP_MS,
  TIMELINE_PX_PER_SEC,
} from './frameTimeline';

const clip = (name: string, ms: number) =>
  wholeClip({ file: new File(['v'], name, { type: 'video/webm' }), ms });

function open(
  clips: FrameClip[] = [clip('a', 5000), clip('b', 5000), clip('c', 5000)],
) {
  const props = {
    onChoose: vi.fn(),
    onTrim: vi.fn(),
    onMove: vi.fn(),
  };
  renderWithProviders(
    <FrameClipsTimeline
      clips={clips}
      chosen={0}
      playheadMs={1000}
      {...props}
    />,
    { lng: 'es' },
  );
  return props;
}

afterEach(() => vi.useRealTimers());

describe('FrameClipsTimeline', () => {
  it('chooses a clip with a tap', () => {
    const { onChoose } = open();
    fireEvent.click(screen.getByRole('button', { name: 'Clip 2 de 3' }));
    expect(onChoose).toHaveBeenCalledWith(1);
  });

  it('trims the chosen clip by dragging a handle', () => {
    const { onTrim } = open();
    const start = screen.getByRole('slider', { name: 'Inicio del clip' });

    fireEvent.pointerDown(start, { clientX: 0, pointerId: 1 });
    // One second to the right.
    fireEvent.pointerMove(start, {
      clientX: TIMELINE_PX_PER_SEC,
      pointerId: 1,
    });
    fireEvent.pointerUp(start, { pointerId: 1 });

    expect(onTrim).toHaveBeenLastCalledWith(
      0,
      expect.objectContaining({ startMs: 1000, endMs: 5000 }),
    );
  });

  it('trims the end with the arrow keys too', () => {
    const { onTrim } = open();
    const end = screen.getByRole('slider', { name: 'Final del clip' });
    expect(end).toHaveAttribute('aria-valuenow', '5000');

    fireEvent.keyDown(end, { key: 'ArrowLeft' });

    expect(onTrim).toHaveBeenCalledWith(
      0,
      expect.objectContaining({ endMs: 5000 - TIMELINE_KEY_STEP_MS }),
    );
  });

  it('moves a clip held and dragged, and does not choose it', () => {
    vi.useFakeTimers();
    const { onMove, onChoose } = open();
    const first = screen.getByRole('button', { name: 'Clip 1 de 3' });

    fireEvent.pointerDown(first, { clientX: 10, clientY: 10, pointerId: 1 });
    act(() => {
      vi.advanceTimersByTime(TIMELINE_HOLD_MS);
    });
    fireEvent.pointerMove(first, { clientX: 300, clientY: 10, pointerId: 1 });
    fireEvent.pointerUp(first, { pointerId: 1 });
    fireEvent.click(first);

    expect(onMove).toHaveBeenCalledWith(0, 2);
    expect(onChoose).not.toHaveBeenCalled();
  });

  it('lets a finger that moves before the hold scroll the strip instead', () => {
    vi.useFakeTimers();
    const { onMove } = open();
    const first = screen.getByRole('button', { name: 'Clip 1 de 3' });

    fireEvent.pointerDown(first, { clientX: 10, clientY: 10, pointerId: 1 });
    fireEvent.pointerMove(first, {
      clientX: 10 + TIMELINE_HOLD_SLOP_PX + 1,
      clientY: 10,
      pointerId: 1,
    });
    act(() => {
      vi.advanceTimersByTime(TIMELINE_HOLD_MS);
    });
    fireEvent.pointerUp(first, { pointerId: 1 });

    expect(onMove).not.toHaveBeenCalled();
  });

  it('moves a clip with Shift and the arrow keys', () => {
    const { onMove } = open();
    fireEvent.keyDown(screen.getByRole('button', { name: 'Clip 2 de 3' }), {
      key: 'ArrowRight',
      shiftKey: true,
    });
    expect(onMove).toHaveBeenCalledWith(1, 2);
  });
});
