import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { StoryElement } from '../../types';
import { STORY_PHOTO_IDENTITY } from './storyPhoto';
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

function setup(over: { photoEnabled?: boolean } = {}) {
  const container = document.createElement('div');
  // A 400 × 700 canvas whose top left is the page's.
  Object.defineProperty(container, 'clientWidth', { value: 400 });
  Object.defineProperty(container, 'clientHeight', { value: 700 });
  const options = {
    containerRef: { current: container },
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
    photo: STORY_PHOTO_IDENTITY,
    photoEnabled: over.photoEnabled ?? false,
    onPhotoUpdate: vi.fn(),
    onFilterStep: vi.fn(),
  };
  const hook = renderHook(() => useStoryGestures(options as never));
  return { ...hook, options };
}

const touch = (type: string, pointerId: number, x = 10, y = 10) =>
  Object.assign(new Event(type), { pointerId, clientX: x, clientY: y });

const down = (pointerId: number, x: number, y: number) =>
  ({
    pointerId,
    clientX: x,
    clientY: y,
    pointerType: 'touch',
    button: 0,
  }) as unknown as React.PointerEvent;

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

  describe('the photo, with nothing selected', () => {
    /** One finger from one point to another, in the given milliseconds. */
    function stroke(
      result: { current: ReturnType<typeof useStoryGestures> },
      from: [number, number],
      to: [number, number],
      ms: number,
    ) {
      const now = vi.spyOn(performance, 'now').mockReturnValue(1000);
      act(() => {
        result.current.onCanvasPointerDown(down(1, ...from));
      });
      now.mockReturnValue(1000 + ms / 2);
      act(() => {
        window.dispatchEvent(
          touch('pointermove', 1, (from[0] + to[0]) / 2, (from[1] + to[1]) / 2),
        );
        window.dispatchEvent(touch('pointermove', 1, ...to));
      });
      now.mockReturnValue(1000 + ms);
      act(() => {
        window.dispatchEvent(touch('pointerup', 1, ...to));
      });
      now.mockRestore();
    }

    it('moves with one finger as a share of the canvas, one undo step when lifted', () => {
      const { result, options } = setup({ photoEnabled: true });

      stroke(result, [100, 100], [140, 170], 500);

      expect(options.onPhotoUpdate).toHaveBeenLastCalledWith({
        x: 0.1,
        y: 0.1,
        scale: 1,
        rotation: 0,
      });
      expect(options.onCommit).toHaveBeenCalledTimes(1);
      expect(options.onFilterStep).not.toHaveBeenCalled();
      expect(result.current.photoMoved()).toBe(true);
    });

    it('changes the filter on a quick sideways swipe, and puts the photo back where it was', () => {
      const { result, options } = setup({ photoEnabled: true });

      stroke(result, [300, 300], [220, 305], 150);

      expect(options.onFilterStep).toHaveBeenCalledWith(
        1,
        STORY_PHOTO_IDENTITY,
      );
      expect(options.onCommit).not.toHaveBeenCalled();

      stroke(result, [100, 300], [200, 300], 150);
      expect(options.onFilterStep).toHaveBeenLastCalledWith(
        -1,
        STORY_PHOTO_IDENTITY,
      );
    });

    it('moves the photo on a slow sideways drag, without changing the filter', () => {
      const { result, options } = setup({ photoEnabled: true });

      stroke(result, [300, 300], [220, 300], 400);

      expect(options.onFilterStep).not.toHaveBeenCalled();
      expect(options.onCommit).toHaveBeenCalledTimes(1);
    });

    it('leaves a tap to the canvas: nothing moves and no step is made', () => {
      const { result, options } = setup({ photoEnabled: true });

      let taken = true;
      act(() => {
        taken = result.current.onCanvasPointerDown(down(1, 50, 50));
        window.dispatchEvent(touch('pointerup', 1, 51, 51));
      });

      expect(taken).toBe(false);
      expect(options.onPhotoUpdate).not.toHaveBeenCalled();
      expect(options.onCommit).not.toHaveBeenCalled();
      expect(result.current.photoMoved()).toBe(false);
    });

    it('scales and turns with two fingers, up to four times, never as a swipe', () => {
      const { result, options } = setup({ photoEnabled: true });

      act(() => {
        result.current.onCanvasPointerDown(down(1, 100, 300));
      });
      let joined = false;
      act(() => {
        joined = result.current.onCanvasPointerDown(down(2, 300, 300));
      });
      expect(joined).toBe(true);
      act(() => {
        window.dispatchEvent(touch('pointermove', 2, 500, 300));
      });
      expect(options.onPhotoUpdate).toHaveBeenLastCalledWith(
        expect.objectContaining({ scale: 2, rotation: 0 }),
      );
      act(() => {
        window.dispatchEvent(touch('pointermove', 2, 1500, 300));
      });
      expect(options.onPhotoUpdate).toHaveBeenLastCalledWith(
        expect.objectContaining({ scale: 4 }),
      );
      act(() => {
        window.dispatchEvent(touch('pointermove', 2, 100, 500));
      });
      expect(options.onPhotoUpdate).toHaveBeenLastCalledWith(
        expect.objectContaining({ rotation: 90 }),
      );
      act(() => {
        window.dispatchEvent(touch('pointerup', 2, 100, 500));
        window.dispatchEvent(touch('pointerup', 1, 100, 300));
      });

      expect(options.onFilterStep).not.toHaveBeenCalled();
      expect(options.onCommit).toHaveBeenCalledTimes(1);
    });

    it('stays still when it cannot be moved: a video, a colour, or something selected', () => {
      const { result, options } = setup({ photoEnabled: false });

      stroke(result, [100, 100], [200, 100], 100);

      expect(options.onPhotoUpdate).not.toHaveBeenCalled();
      expect(options.onFilterStep).not.toHaveBeenCalled();
      expect(options.onCommit).not.toHaveBeenCalled();
    });

    it('scales with Ctrl and the wheel, one undo step once the wheel rests', () => {
      vi.useFakeTimers();
      const { options } = setup({ photoEnabled: true });
      const wheel = new WheelEvent('wheel', {
        ctrlKey: true,
        deltaY: -100,
        cancelable: true,
      });

      act(() => {
        options.containerRef.current.dispatchEvent(wheel);
      });

      expect(wheel.defaultPrevented).toBe(true);
      expect(options.onPhotoUpdate).toHaveBeenLastCalledWith(
        expect.objectContaining({ scale: Math.exp(1) }),
      );
      expect(options.onCommit).not.toHaveBeenCalled();
      act(() => {
        vi.advanceTimersByTime(250);
      });
      expect(options.onCommit).toHaveBeenCalledTimes(1);
      vi.useRealTimers();
    });
  });
});
