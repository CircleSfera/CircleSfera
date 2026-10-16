import * as fabric from 'fabric';
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import type { StoryBrush } from '../storyComposer.types';

export interface StoryCanvasRef {
  clear: () => void;
  setBrushColor: (color: string) => void;
  setBrushWidth: (width: number) => void;
  undo: () => void;
}

interface StoryCanvasProps {
  isDrawingMode: boolean;
  brushColor?: string;
  brushWidth?: number;
  brush?: StoryBrush;
}

/** A stroke the eraser took off, and where it was in the stack. */
interface Taken {
  stroke: fabric.FabricObject;
  index: number;
}

/** A stroke drawn, or strokes the eraser took off, to undo in order. */
type Step =
  | { kind: 'drawn'; stroke: fabric.FabricObject }
  | { kind: 'erased'; taken: Taken[] };

/**
 * The points an eraser passes over between two pointer positions, close
 * enough that a fast move does not jump over a thin stroke.
 */
export function pointsAlong(
  from: { x: number; y: number } | null,
  to: { x: number; y: number },
  spacing: number,
): { x: number; y: number }[] {
  if (!from) return [to];
  const steps = Math.max(
    1,
    Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / spacing),
  );
  return Array.from({ length: steps }, (_, i) => {
    const k = (i + 1) / steps;
    return { x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k };
  });
}

/** A colour at half strength, for the marker. */
export function translucent(hex: string, alpha = 0.5): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = Number.parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/** How each brush draws, from the chosen colour and size. */
export function brushStyle(brush: StoryBrush, color: string, width: number) {
  switch (brush) {
    case 'marker':
      return {
        color: translucent(color),
        width: width * 2,
        strokeLineCap: 'butt' as const,
        glow: null,
      };
    case 'neon':
      // A light core with a glow of the colour.
      return {
        color: '#ffffff',
        width,
        strokeLineCap: 'round' as const,
        glow: { color, blur: Math.max(12, width * 2) },
      };
    default:
      return {
        color,
        width,
        strokeLineCap: 'round' as const,
        glow: null,
      };
  }
}

export const StoryCanvas = forwardRef<StoryCanvasRef, StoryCanvasProps>(
  (
    { isDrawingMode, brushColor = '#ffffff', brushWidth = 5, brush = 'pen' },
    ref,
  ) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const fabricRef = useRef<fabric.Canvas | null>(null);
    const historyRef = useRef<Step[]>([]);
    const erasingRef = useRef<{
      taken: Taken[];
      last: { x: number; y: number } | null;
    } | null>(null);
    const brushRef = useRef(brush);
    brushRef.current = brush;
    const widthRef = useRef(brushWidth);
    widthRef.current = brushWidth;

    // biome-ignore lint/correctness/useExhaustiveDependencies: Initialize canvas only once on mount
    useEffect(() => {
      if (!canvasRef.current?.parentElement) return;
      const parent = canvasRef.current.parentElement;

      const canvas = new fabric.Canvas(canvasRef.current, {
        width: parent.clientWidth,
        height: parent.clientHeight,
        isDrawingMode,
        selection: false,
      });
      canvas.freeDrawingBrush = new fabric.PencilBrush(canvas);

      const resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          canvas.setDimensions({
            width: entry.contentRect.width,
            height: entry.contentRect.height,
          });
        }
      });
      resizeObserver.observe(parent);

      canvas.on('path:created', (e) => {
        if (!e.path) return;
        // A stroke is part of the picture, never picked up as an object.
        e.path.set({ selectable: false, evented: false });
        historyRef.current.push({ kind: 'drawn', stroke: e.path });
      });

      // The eraser takes off each stroke it passes over, whole: anywhere
      // within its width, along the whole way the pointer went.
      const eraseAt = (event: fabric.TPointerEventInfo) => {
        const erasing = erasingRef.current;
        if (!erasing) return;
        const radius = canvas.targetFindTolerance;
        const point = canvas.getScenePoint(event.e);
        for (const at of pointsAlong(erasing.last, point, radius)) {
          const strokes = canvas.getObjects();
          for (let index = strokes.length - 1; index >= 0; index--) {
            const stroke = strokes[index];
            const box = stroke.getBoundingRect();
            if (
              at.x < box.left - radius ||
              at.x > box.left + box.width + radius ||
              at.y < box.top - radius ||
              at.y > box.top + box.height + radius ||
              canvas.isTargetTransparent(stroke, at.x, at.y)
            ) {
              continue;
            }
            canvas.remove(stroke);
            erasing.taken.push({ stroke, index });
          }
        }
        erasing.last = { x: point.x, y: point.y };
        canvas.requestRenderAll();
      };
      canvas.on('mouse:down', (event) => {
        if (brushRef.current !== 'eraser') return;
        // The pixels the eraser looks at around the pointer: its width.
        canvas.setTargetFindTolerance(
          Math.max(1, Math.round(widthRef.current / 2)),
        );
        erasingRef.current = { taken: [], last: null };
        eraseAt(event);
      });
      canvas.on('mouse:move', eraseAt);
      canvas.on('mouse:up', () => {
        const taken = erasingRef.current?.taken;
        if (erasingRef.current) canvas.setTargetFindTolerance(0);
        erasingRef.current = null;
        if (taken?.length) {
          historyRef.current.push({ kind: 'erased', taken });
        }
      });

      fabricRef.current = canvas;

      return () => {
        resizeObserver.disconnect();
        canvas.dispose();
        fabricRef.current = null;
      };
    }, []);

    // Drawing with a brush; the eraser listens to the pointer instead.
    useEffect(() => {
      if (fabricRef.current) {
        fabricRef.current.isDrawingMode = isDrawingMode && brush !== 'eraser';
      }
    }, [isDrawingMode, brush]);

    useEffect(() => {
      const pencil = fabricRef.current?.freeDrawingBrush;
      if (!pencil) return;
      const style = brushStyle(brush, brushColor, brushWidth);
      pencil.color = style.color;
      pencil.width = style.width;
      pencil.strokeLineCap = style.strokeLineCap;
      pencil.shadow = style.glow
        ? new fabric.Shadow({
            color: style.glow.color,
            blur: style.glow.blur,
            offsetX: 0,
            offsetY: 0,
          })
        : null;
    }, [brush, brushColor, brushWidth]);

    useImperativeHandle(ref, () => ({
      clear: () => {
        if (fabricRef.current) {
          fabricRef.current.clear();
          historyRef.current = [];
        }
      },
      setBrushColor: (color: string) => {
        if (fabricRef.current?.freeDrawingBrush) {
          fabricRef.current.freeDrawingBrush.color = color;
        }
      },
      setBrushWidth: (width: number) => {
        if (fabricRef.current?.freeDrawingBrush) {
          fabricRef.current.freeDrawingBrush.width = width;
        }
      },
      undo: () => {
        const canvas = fabricRef.current;
        const step = historyRef.current.pop();
        if (!canvas || !step) return;
        if (step.kind === 'drawn') canvas.remove(step.stroke);
        else {
          // Back where each was, the last taken first, so what lay on top
          // lies on top again.
          for (const { stroke, index } of [...step.taken].reverse()) {
            canvas.insertAt(index, stroke);
          }
        }
        canvas.requestRenderAll();
      },
    }));

    return (
      <div
        className={`absolute inset-0 z-50 ${isDrawingMode ? 'pointer-events-auto' : 'pointer-events-none'}`}
        data-testid="story-drawing"
        data-brush={brush}
      >
        <canvas ref={canvasRef} />
      </div>
    );
  },
);

StoryCanvas.displayName = 'StoryCanvas';
