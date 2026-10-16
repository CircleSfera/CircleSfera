import { ClippingGroup, EraserBrush } from '@erase2d/fabric';
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

/** What the eraser rubbed out of one stroke, to take back on undo. */
interface Rubbed {
  stroke: fabric.FabricObject;
  mark: fabric.Path;
}

/** A stroke drawn, or what one pass of the eraser rubbed out, to undo in order. */
type Step =
  | { kind: 'drawn'; stroke: fabric.FabricObject }
  | { kind: 'erased'; rubbed: Rubbed[] };

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
    const pencilRef = useRef<fabric.PencilBrush | null>(null);
    const eraserRef = useRef<EraserBrush | null>(null);

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
      const pencil = new fabric.PencilBrush(canvas);
      canvas.freeDrawingBrush = pencil;
      pencilRef.current = pencil;

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
        // A stroke is part of the picture, never picked up as an object; the
        // eraser rubs out strokes only.
        e.path.set({ selectable: false, evented: false });
        e.path.set('erasable', true);
        historyRef.current.push({ kind: 'drawn', stroke: e.path });
      });

      // The eraser rubs out what it passes over, pixel by pixel: each stroke
      // it touched keeps the rubbed-out part as a mark of its clip, which
      // undo takes off again.
      const eraser = new EraserBrush(canvas);
      eraser.on('end', async (event) => {
        event.preventDefault();
        const marks = await eraser.commit(event.detail);
        const rubbed = [...marks].map(([stroke, mark]) => ({ stroke, mark }));
        if (rubbed.length) historyRef.current.push({ kind: 'erased', rubbed });
      });
      eraserRef.current = eraser;

      fabricRef.current = canvas;

      return () => {
        resizeObserver.disconnect();
        eraser.dispose();
        canvas.dispose();
        fabricRef.current = null;
      };
    }, []);

    useEffect(() => {
      if (fabricRef.current) fabricRef.current.isDrawingMode = isDrawingMode;
    }, [isDrawingMode]);

    useEffect(() => {
      const canvas = fabricRef.current;
      const pencil = pencilRef.current;
      const eraser = eraserRef.current;
      if (!canvas || !pencil || !eraser) return;
      if (brush === 'eraser') {
        eraser.width = brushWidth;
        canvas.freeDrawingBrush = eraser;
        return;
      }
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
      canvas.freeDrawingBrush = pencil;
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
          // Each mark off the clip of its stroke: the rubbed-out part is back.
          for (const { stroke, mark } of step.rubbed) {
            const clip = stroke.clipPath;
            if (!(clip instanceof ClippingGroup)) continue;
            clip.remove(mark);
            if (clip.size() === 0) stroke.clipPath = undefined;
            else clip.set('dirty', true);
            stroke.set('dirty', true);
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
