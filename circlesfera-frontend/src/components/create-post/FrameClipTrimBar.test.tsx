import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/test-utils';
import FrameClipTrimBar from './FrameClipTrimBar';
import { wholeClip } from './frameClips';
import { TIMELINE_KEY_STEP_MS } from './frameTimeline';

const clip = wholeClip({
  file: new File(['v'], 'a', { type: 'video/webm' }),
  ms: 8000,
});

function open(onTrim = vi.fn()) {
  renderWithProviders(
    <FrameClipTrimBar clip={clip} playheadMs={2000} onTrim={onTrim} />,
    { lng: 'es' },
  );
  return onTrim;
}

describe('FrameClipTrimBar', () => {
  it('trims the start by dragging its handle along the bar', () => {
    const onTrim = open();
    const start = screen.getByRole('slider', { name: 'Inicio del clip' });
    // The bar is 200 px wide for the clip's 8 s.
    vi.spyOn(
      start.parentElement as HTMLElement,
      'clientWidth',
      'get',
    ).mockReturnValue(200);

    fireEvent.pointerDown(start, { clientX: 0, pointerId: 1 });
    fireEvent.pointerMove(start, { clientX: 50, pointerId: 1 });
    fireEvent.pointerUp(start, { pointerId: 1 });

    expect(onTrim).toHaveBeenLastCalledWith(
      expect.objectContaining({ startMs: 2000, endMs: 8000 }),
    );
  });

  it('trims the end with the arrow keys', () => {
    const onTrim = open();
    const end = screen.getByRole('slider', { name: 'Final del clip' });
    expect(end).toHaveAttribute('aria-valuenow', '8000');

    fireEvent.keyDown(end, { key: 'ArrowLeft' });
    fireEvent.keyDown(end, { key: 'Enter' });

    expect(onTrim).toHaveBeenCalledTimes(1);
    expect(onTrim).toHaveBeenCalledWith(
      expect.objectContaining({ endMs: 8000 - TIMELINE_KEY_STEP_MS }),
    );
  });

  it('says where the part starts, how long it lasts and where it ends', () => {
    open();
    expect(screen.getByText('0:00')).toBeInTheDocument();
    expect(screen.getAllByText('0:08')).toHaveLength(2);
  });
});
