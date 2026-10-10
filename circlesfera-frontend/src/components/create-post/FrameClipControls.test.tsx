import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/test-utils';
import FrameClipControls, { formatClipClock } from './FrameClipControls';

function show(
  sourceDurationSec: number,
  window: { startTime: number; endTime: number },
  more = {},
) {
  const onChange = vi.fn();
  renderWithProviders(
    <FrameClipControls
      sourceDurationSec={sourceDurationSec}
      window={window}
      onChange={onChange}
      {...more}
    />,
  );
  const track = screen.getByRole('slider', { name: 'Clip start position' });
  // The track is 200 px wide on screen.
  track.getBoundingClientRect = () => ({ left: 0, width: 200 }) as DOMRect;
  track.setPointerCapture = vi.fn();
  return { onChange, track };
}

describe('FrameClipControls', () => {
  it('writes a moment as minutes and seconds', () => {
    expect(formatClipClock(0)).toBe('0:00');
    expect(formatClipClock(75.9)).toBe('1:15');
    expect(formatClipClock(-3)).toBe('0:00');
  });

  it('shows where the clip starts and ends and how long it is', () => {
    const { track } = show(120, { startTime: 10, endTime: 40 });

    expect(screen.getByText('0:10')).toBeInTheDocument();
    expect(screen.getByText('0:40')).toBeInTheDocument();
    expect(track).toHaveAttribute('aria-valuetext', '0:10 – 0:40');
    expect(track).toHaveAttribute('aria-valuemax', '90');
    expect(screen.getByRole('button', { name: '30s' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('changes the length from a preset, keeping the start', () => {
    const { onChange } = show(120, { startTime: 10, endTime: 40 });

    fireEvent.click(screen.getByRole('button', { name: '60s' }));

    expect(onChange).toHaveBeenCalledWith({ startTime: 10, endTime: 70 });
  });

  it('moves the start back when a longer preset would run past the end', () => {
    const { onChange } = show(100, { startTime: 80, endTime: 95 });

    fireEvent.click(screen.getByRole('button', { name: '60s' }));

    expect(onChange).toHaveBeenCalledWith({ startTime: 40, endTime: 100 });
  });

  it('does not offer a preset longer than the video', () => {
    show(40, { startTime: 0, endTime: 30 });

    expect(screen.getByRole('button', { name: '30s' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '60s' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '90s' })).toBeDisabled();
  });

  it('hides the presets when asked', () => {
    show(120, { startTime: 0, endTime: 30 }, { showPresets: false });

    expect(screen.queryByRole('button', { name: '30s' })).toBeNull();
  });

  describe('with the keyboard', () => {
    it('moves the clip a quarter of a second, or a second with Shift', () => {
      const { onChange, track } = show(120, { startTime: 10, endTime: 40 });

      fireEvent.keyDown(track, { key: 'ArrowRight' });
      expect(onChange).toHaveBeenLastCalledWith({
        startTime: 10.25,
        endTime: 40.25,
      });

      fireEvent.keyDown(track, { key: 'ArrowLeft', shiftKey: true });
      expect(onChange).toHaveBeenLastCalledWith({ startTime: 9, endTime: 39 });
    });

    it('jumps to the start and to the last place the clip fits', () => {
      const { onChange, track } = show(120, { startTime: 10, endTime: 40 });

      fireEvent.keyDown(track, { key: 'Home' });
      expect(onChange).toHaveBeenLastCalledWith({ startTime: 0, endTime: 30 });

      fireEvent.keyDown(track, { key: 'End' });
      expect(onChange).toHaveBeenLastCalledWith({
        startTime: 90,
        endTime: 120,
      });
    });

    it('does not move before the start', () => {
      const { onChange, track } = show(120, { startTime: 0, endTime: 30 });

      fireEvent.keyDown(track, { key: 'ArrowLeft' });

      expect(onChange).toHaveBeenLastCalledWith({ startTime: 0, endTime: 30 });
    });
  });

  describe('with the pointer', () => {
    it('puts the clip where the track is pressed and follows the drag', () => {
      const { onChange, track } = show(120, { startTime: 0, endTime: 30 });

      // A quarter of the way along a two-minute video.
      fireEvent.pointerDown(track, { pointerId: 1, clientX: 50 });
      expect(onChange).toHaveBeenLastCalledWith({ startTime: 30, endTime: 60 });

      fireEvent.pointerMove(track, { pointerId: 1, clientX: 100 });
      expect(onChange).toHaveBeenLastCalledWith({ startTime: 60, endTime: 90 });

      fireEvent.pointerUp(track, { pointerId: 1 });
      onChange.mockClear();
      fireEvent.pointerMove(track, { pointerId: 1, clientX: 150 });
      expect(onChange).not.toHaveBeenCalled();
    });

    it('never drags the clip past the end of the video', () => {
      const { onChange, track } = show(120, { startTime: 0, endTime: 30 });

      fireEvent.pointerDown(track, { pointerId: 1, clientX: 199 });

      expect(onChange).toHaveBeenLastCalledWith({
        startTime: 90,
        endTime: 120,
      });
    });

    it('ignores another finger while one is dragging', () => {
      const { onChange, track } = show(120, { startTime: 0, endTime: 30 });
      fireEvent.pointerDown(track, { pointerId: 1, clientX: 50 });
      onChange.mockClear();

      fireEvent.pointerMove(track, { pointerId: 2, clientX: 150 });

      expect(onChange).not.toHaveBeenCalled();
    });
  });

  it('cannot be moved when the clip is the whole video', () => {
    const { onChange, track } = show(20, { startTime: 0, endTime: 20 });

    expect(track).toHaveAttribute('aria-disabled', 'true');
    fireEvent.keyDown(track, { key: 'ArrowRight' });
    fireEvent.pointerDown(track, { pointerId: 1, clientX: 100 });

    expect(onChange).not.toHaveBeenCalled();
  });
});
