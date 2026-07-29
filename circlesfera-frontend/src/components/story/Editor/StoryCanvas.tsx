import * as fabric from 'fabric';
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';

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
}

export const StoryCanvas = forwardRef<StoryCanvasRef, StoryCanvasProps>(
  ({ isDrawingMode, brushColor = '#ffffff', brushWidth = 5 }, ref) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const fabricRef = useRef<fabric.Canvas | null>(null);
    const historyRef = useRef<fabric.Object[]>([]);

    // biome-ignore lint/correctness/useExhaustiveDependencies: Initialize canvas only once on mount
    useEffect(() => {
      if (!canvasRef.current?.parentElement) return;
      const parent = canvasRef.current.parentElement;

      // Initialize Fabric.js Canvas
      const canvas = new fabric.Canvas(canvasRef.current, {
        width: parent.clientWidth,
        height: parent.clientHeight,
        isDrawingMode,
        selection: false,
      });

      // Setup brush
      const brush = new fabric.PencilBrush(canvas);
      brush.color = brushColor;
      brush.width = brushWidth;
      canvas.freeDrawingBrush = brush;

      // Resize observer
      const resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          canvas.setDimensions({
            width: entry.contentRect.width,
            height: entry.contentRect.height,
          });
        }
      });
      resizeObserver.observe(parent);

      // Track drawing history for Undo
      canvas.on('path:created', (e) => {
        if (e.path) {
          historyRef.current.push(e.path);
        }
      });

      fabricRef.current = canvas;

      return () => {
        resizeObserver.disconnect();
        canvas.dispose();
        fabricRef.current = null;
      };
    }, []);

    // Update drawing mode dynamically
    useEffect(() => {
      if (fabricRef.current) {
        fabricRef.current.isDrawingMode = isDrawingMode;
      }
    }, [isDrawingMode]);

    // Update brush dynamically
    useEffect(() => {
      if (fabricRef.current?.freeDrawingBrush) {
        fabricRef.current.freeDrawingBrush.color = brushColor;
        fabricRef.current.freeDrawingBrush.width = brushWidth;
      }
    }, [brushColor, brushWidth]);

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
        if (fabricRef.current && historyRef.current.length > 0) {
          const lastPath = historyRef.current.pop();
          if (lastPath) {
            fabricRef.current.remove(lastPath);
            fabricRef.current.renderAll();
          }
        }
      },
    }));

    return (
      <div
        className={`absolute inset-0 z-50 ${isDrawingMode ? 'pointer-events-auto' : 'pointer-events-none'}`}
      >
        <canvas ref={canvasRef} />
      </div>
    );
  },
);

StoryCanvas.displayName = 'StoryCanvas';
