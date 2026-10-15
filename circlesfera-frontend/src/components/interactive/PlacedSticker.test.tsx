import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PlacedSticker } from './PlacedSticker';

describe('PlacedSticker', () => {
  // The story is shown on a 360 × 640 screen, the shape of a story.
  beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(360);
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(640);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('puts the sticker where the creator placed it, at its size and angle', () => {
    render(
      <PlacedSticker placement={{ x: 0.05, y: -0.1, scale: 0.8, rotation: -8 }}>
        <p>Poll</p>
      </PlacedSticker>,
    );

    const sticker = screen.getByTestId('placed-sticker');
    expect(sticker).toContainElement(screen.getByText('Poll'));
    expect(Number.parseFloat(sticker.style.left)).toBeCloseTo(198);
    expect(Number.parseFloat(sticker.style.top)).toBeCloseTo(256);
    expect(Number.parseFloat(sticker.style.width)).toBeCloseTo(295.2);
    expect(sticker.style.transform).toBe(
      'translate(-50%, -50%) scale(0.8) rotate(-8deg)',
    );
    expect(sticker.style.visibility).toBe('visible');
  });

  it('keeps a story published without a place across the bottom', () => {
    render(
      <PlacedSticker placement={null}>
        <p>Poll</p>
      </PlacedSticker>,
    );

    expect(screen.queryByTestId('placed-sticker')).not.toBeInTheDocument();
    expect(screen.getByText('Poll').parentElement).toHaveClass(
      'inset-x-4',
      'bottom-28',
    );
  });

  it('pauses the story when the sticker is touched', () => {
    const pause = vi.fn();
    render(
      <PlacedSticker
        placement={{ x: 0, y: 0, scale: 1, rotation: 0 }}
        onPointerDown={pause}
      >
        <p>Poll</p>
      </PlacedSticker>,
    );

    fireEvent.pointerDown(screen.getByTestId('placed-sticker'));

    expect(pause).toHaveBeenCalled();
  });
});
