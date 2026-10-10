import { act, fireEvent, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OverlayElement } from '../services/edits.service';
import CanvasOverlay from './CanvasOverlay';

type Props = Record<string, any>;

/** What the drawing library was last asked to draw, by kind of shape. */
const drawn = vi.hoisted(() => ({
  stage: {} as Record<string, any>,
  lines: [] as Record<string, any>[],
  texts: [] as Record<string, any>[],
  images: [] as Record<string, any>[],
  transformers: [] as Record<string, any>[],
  /** The node behind each shape, as the library would hand it over. */
  node: {
    x: () => 40,
    y: () => 50,
    rotation: () => 15,
    width: () => 100,
    height: () => 60,
    scale: { x: 2, y: 0.5 },
    scaleX(value?: number) {
      if (value !== undefined) this.scale.x = value;
      return this.scale.x;
    },
    scaleY(value?: number) {
      if (value !== undefined) this.scale.y = value;
      return this.scale.y;
    },
  },
}));

vi.mock('react-konva', async () => {
  const { forwardRef, useImperativeHandle } = await import('react');
  const shape = (list: Props[]) =>
    forwardRef<unknown, Props>((props, ref) => {
      useImperativeHandle(ref, () => drawn.node);
      list.push(props);
      return null;
    });
  return {
    Stage: ({ children, ...props }: Props) => {
      drawn.stage = props;
      return <div data-testid="stage">{children}</div>;
    },
    Layer: ({ children }: Props) => <>{children}</>,
    Line: shape(drawn.lines),
    Text: shape(drawn.texts),
    Image: shape(drawn.images),
    Transformer: forwardRef<unknown, Props>((props, ref) => {
      useImperativeHandle(ref, () => ({
        nodes: vi.fn(),
        getLayer: () => ({ batchDraw: vi.fn() }),
      }));
      drawn.transformers.push(props);
      return null;
    }),
  };
});

vi.mock('use-image', () => ({ default: (src: string) => [{ src }] }));

const text: OverlayElement = {
  id: 't1',
  type: 'text',
  x: 10,
  y: 20,
  text: 'Hello',
};
const sticker: OverlayElement = {
  id: 'i1',
  type: 'image',
  x: 5,
  y: 5,
  src: 'https://media.test/sticker.png',
};
const stroke: OverlayElement = {
  id: 'l1',
  type: 'line',
  x: 0,
  y: 0,
  points: [1, 2],
  fill: '#ff0000',
  strokeWidth: 4,
};

/** A pointer event on the canvas, at a point, on the stage or on a shape. */
function pointer(x: number, y: number, onEmptyCanvas = true) {
  const stage = { getPointerPosition: () => ({ x, y }) };
  return {
    target: onEmptyCanvas
      ? Object.assign(stage, { getStage: () => stage })
      : { getStage: () => stage },
  };
}

function show(props: Partial<Parameters<typeof CanvasOverlay>[0]> = {}) {
  const onChange = vi.fn();
  const onSelectOverlay = vi.fn();
  const view = render(
    <CanvasOverlay
      width={300}
      height={400}
      overlays={[]}
      onChange={onChange}
      drawMode={false}
      brushColor="#00ff00"
      brushSize={6}
      selectedOverlayId={null}
      onSelectOverlay={onSelectOverlay}
      {...props}
    />,
  );
  return { onChange, onSelectOverlay, ...view };
}

describe('CanvasOverlay', () => {
  beforeEach(() => {
    drawn.lines.length = 0;
    drawn.texts.length = 0;
    drawn.images.length = 0;
    drawn.transformers.length = 0;
    drawn.node.scale = { x: 2, y: 0.5 };
  });

  it('draws each kind of element at the size of the photo', () => {
    show({ overlays: [stroke, text, sticker] });

    expect(drawn.stage).toMatchObject({ width: 300, height: 400 });
    expect(drawn.lines.at(-1)).toMatchObject({
      points: [1, 2],
      stroke: '#ff0000',
      strokeWidth: 4,
    });
    expect(drawn.texts.at(-1)).toMatchObject({ text: 'Hello', x: 10, y: 20 });
    expect(drawn.images.at(-1)).toMatchObject({
      image: { src: 'https://media.test/sticker.png' },
      draggable: true,
    });
  });

  describe('drawing', () => {
    it('starts a stroke with the chosen brush where the finger lands', () => {
      const { onChange } = show({ drawMode: true, overlays: [text] });

      drawn.stage.onMouseDown(pointer(30, 40));

      expect(onChange).toHaveBeenCalledTimes(1);
      const next = onChange.mock.calls[0][0] as OverlayElement[];
      expect(next[0]).toBe(text);
      expect(next[1]).toMatchObject({
        type: 'line',
        points: [30, 40],
        strokeWidth: 6,
        fill: '#00ff00',
        x: 0,
        y: 0,
      });
      expect(next[1].id).toEqual(expect.any(String));
    });

    it('extends the stroke while the finger moves, and stops when it lifts', () => {
      const { onChange, rerender } = show({ drawMode: true });
      drawn.stage.onTouchStart(pointer(1, 2));
      const started = onChange.mock.calls[0][0] as OverlayElement[];
      rerender(
        <CanvasOverlay
          width={300}
          height={400}
          overlays={started}
          onChange={onChange}
          drawMode
          brushColor="#00ff00"
          brushSize={6}
        />,
      );

      drawn.stage.onTouchMove(pointer(3, 4));
      expect(onChange.mock.calls[1][0][0].points).toEqual([1, 2, 3, 4]);

      drawn.stage.onTouchEnd();
      drawn.stage.onTouchMove(pointer(5, 6));
      expect(onChange).toHaveBeenCalledTimes(2);
    });

    it('does not draw when the finger moves without having pressed', () => {
      const { onChange } = show({ drawMode: true, overlays: [stroke] });

      drawn.stage.onMousemove(pointer(3, 4));

      expect(onChange).not.toHaveBeenCalled();
    });

    it('does not draw outside the drawing tool', () => {
      const { onChange } = show();

      drawn.stage.onMouseDown(pointer(30, 40));
      drawn.stage.onMousemove(pointer(31, 41));

      expect(onChange).not.toHaveBeenCalled();
    });

    it('does not pick an element up while drawing', () => {
      const { onSelectOverlay } = show({ drawMode: true, overlays: [text] });

      drawn.texts.at(-1)?.onClick();

      expect(onSelectOverlay).not.toHaveBeenCalled();
    });
  });

  describe('selecting', () => {
    it('picks the element that is tapped', () => {
      const { onSelectOverlay } = show({ overlays: [text, sticker] });

      drawn.texts.at(-1)?.onTap();
      expect(onSelectOverlay).toHaveBeenLastCalledWith('t1');

      drawn.images.at(-1)?.onClick();
      expect(onSelectOverlay).toHaveBeenLastCalledWith('i1');
    });

    it('shows handles on the selected element only', () => {
      show({ overlays: [text, sticker], selectedOverlayId: 'i1' });

      expect(drawn.transformers).toHaveLength(1);
      // Only text is limited to its side handles.
      expect(drawn.transformers[0].enabledAnchors).toBeUndefined();
    });

    it('lets go on a tap on the empty canvas, not on a tap on an element', () => {
      const { onSelectOverlay } = show({
        overlays: [text],
        selectedOverlayId: 't1',
      });

      drawn.stage.onMouseDown(pointer(1, 1, false));
      expect(onSelectOverlay).not.toHaveBeenCalled();

      drawn.stage.onMouseDown(pointer(1, 1));
      expect(onSelectOverlay).toHaveBeenCalledWith(null);
    });

    it('keeps its own selection when the editor does not hold one', () => {
      render(
        <CanvasOverlay
          width={300}
          height={400}
          overlays={[text]}
          onChange={vi.fn()}
          drawMode={false}
          brushColor="#000"
          brushSize={2}
        />,
      );
      expect(drawn.transformers).toHaveLength(0);

      act(() => drawn.texts.at(-1)?.onClick());

      expect(drawn.transformers).toHaveLength(1);
    });
  });

  describe('removing with the keyboard', () => {
    it('removes the selected element and lets go of it', () => {
      const { onChange, onSelectOverlay } = show({
        overlays: [text, sticker],
        selectedOverlayId: 't1',
      });

      fireEvent.keyDown(window, { key: 'Backspace' });

      expect(onChange).toHaveBeenCalledWith([sticker]);
      expect(onSelectOverlay).toHaveBeenCalledWith(null);
    });

    it('does nothing when nothing is selected', () => {
      const { onChange } = show({ overlays: [text] });

      fireEvent.keyDown(window, { key: 'Delete' });

      expect(onChange).not.toHaveBeenCalled();
    });

    it('leaves the element alone while its text is being typed', () => {
      const { onChange } = show({ overlays: [text], selectedOverlayId: 't1' });
      const field = document.createElement('input');
      document.body.appendChild(field);

      fireEvent.keyDown(field, { key: 'Backspace' });

      expect(onChange).not.toHaveBeenCalled();
      field.remove();
    });
  });

  describe('moving and resizing', () => {
    it('keeps the new place of a dragged element, and the others as they were', () => {
      const { onChange } = show({ overlays: [text, sticker] });

      drawn.images.at(-1)?.onDragEnd({ target: { x: () => 70, y: () => 80 } });

      expect(onChange).toHaveBeenCalledWith([
        text,
        { ...sticker, x: 70, y: 80 },
      ]);
    });

    it('turns the stretch of a sticker into a new size', () => {
      const { onChange } = show({ overlays: [sticker] });

      drawn.images.at(-1)?.onTransformEnd({});

      expect(onChange).toHaveBeenCalledWith([
        { ...sticker, x: 40, y: 50, rotation: 15, width: 200, height: 30 },
      ]);
      expect(drawn.node.scale).toEqual({ x: 1, y: 1 });
    });

    it('never makes a sticker smaller than five points', () => {
      drawn.node.scale = { x: 0.01, y: 0.01 };
      const { onChange } = show({ overlays: [sticker] });

      drawn.images.at(-1)?.onTransformEnd({});

      expect(onChange.mock.calls[0][0][0]).toMatchObject({
        width: 5,
        height: 5,
      });
    });

    it('widens a text instead of stretching its letters', () => {
      const { onChange } = show({ overlays: [text] });

      drawn.texts.at(-1)?.onTransformEnd({});

      expect(onChange).toHaveBeenCalledWith([
        {
          ...text,
          x: 40,
          y: 50,
          rotation: 15,
          width: 200,
          scaleX: 1,
          scaleY: 1,
        },
      ]);
    });

    it('moves a dragged text', () => {
      const { onChange } = show({ overlays: [text] });

      drawn.texts.at(-1)?.onDragEnd({ target: { x: () => 7, y: () => 8 } });

      expect(onChange).toHaveBeenCalledWith([{ ...text, x: 7, y: 8 }]);
    });

    it('refuses a handle drag that would make an element vanish', () => {
      show({ overlays: [text, sticker], selectedOverlayId: 'i1' });
      const limit = drawn.transformers[0].boundBoxFunc;
      const before = { width: 50, height: 50 };

      expect(limit(before, { width: 3, height: 50 })).toBe(before);
      expect(limit(before, { width: 60, height: 60 })).toEqual({
        width: 60,
        height: 60,
      });
    });

    it('keeps a text at least thirty points wide, with side handles only', () => {
      show({ overlays: [text], selectedOverlayId: 't1' });
      const handles = drawn.transformers[0];

      expect(handles.enabledAnchors).toEqual(['middle-left', 'middle-right']);
      expect(handles.boundBoxFunc({}, { width: 4 }).width).toBe(30);
      expect(handles.boundBoxFunc({}, { width: 90 }).width).toBe(90);
    });
  });
});
