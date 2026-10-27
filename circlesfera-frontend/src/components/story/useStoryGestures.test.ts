import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { StoryElement } from '../../types';
import { useStoryGestures } from './useStoryGestures';

const piece = {
  id: 'p-1',
  type: 'sticker',
  content: '🔥',
  x: 0,
  y: 0,
  scale: 1,
  rotation: 0,
} as StoryElement;

function setup() {
  const options = {
    containerRef: { current: document.createElement('div') },
    elements: [piece],
    selectedElementId: null,
    enabled: true,
    onSelect: vi.fn(),
    onUpdate: vi.fn(),
    onCommit: vi.fn(),
    onRemove: vi.fn(),
    onTextEdit: vi.fn(),
    onDragActiveChange: vi.fn(),
    setShowVGuide: vi.fn(),
    setShowHGuide: vi.fn(),
  };
  const hook = renderHook(() => useStoryGestures(options as never));
  return { ...hook, options };
}

const touch = (type: string, pointerId: number) =>
  Object.assign(new Event(type), { pointerId, clientX: 10, clientY: 10 });

describe('useStoryGestures', () => {
  it('hears a finger lifted at once, before any render, and the next touch starts anew', () => {
    const { result, options } = setup();
    const down = {
      pointerId: 1,
      clientX: 10,
      clientY: 10,
      stopPropagation: vi.fn(),
    } as unknown as React.PointerEvent;

    // Down and up in one go: React renders only once both are done, so
    // there is no render in between.
    act(() => {
      result.current.onPiecePointerDown(piece, down);
      window.dispatchEvent(touch('pointerup', 1));
    });
    expect(options.onSelect).toHaveBeenCalledTimes(1);

    // A later touch with another finger is a new tap, not a second finger.
    act(() => {
      result.current.onPiecePointerDown(piece, { ...down, pointerId: 2 });
      window.dispatchEvent(touch('pointerup', 2));
    });
    expect(options.onSelect).toHaveBeenCalledTimes(2);
  });

  it('stops listening once the gesture ends', () => {
    const remove = vi.spyOn(window, 'removeEventListener');
    const { result } = setup();
    act(() => {
      result.current.onPiecePointerDown(piece, {
        pointerId: 1,
        clientX: 0,
        clientY: 0,
        stopPropagation: vi.fn(),
      } as unknown as React.PointerEvent);
      window.dispatchEvent(touch('pointerup', 1));
    });

    expect(remove.mock.calls.map(([type]) => type)).toEqual(
      expect.arrayContaining(['pointermove', 'pointerup', 'pointercancel']),
    );
    remove.mockRestore();
  });
});
