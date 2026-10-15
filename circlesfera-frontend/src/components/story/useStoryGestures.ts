import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { StoryElement } from '../../types';
import {
  INTERACTIVE_SCALE,
  isOverBin,
  PIECE_SCALE,
  type PieceTransform,
  type Point,
  type ScaleLimits,
  snapPiece,
  TAP_SLOP_PX,
  transformFromFingers,
} from './storyGesture';
import { isAnswerableElement } from './storyInteractive';

interface GestureOptions {
  containerRef: React.RefObject<HTMLDivElement | null>;
  elements: StoryElement[];
  selectedElementId: string | null;
  /** Gestures are off while the canvas is drawn on or text is written. */
  enabled: boolean;
  onSelect: (id: string) => void;
  onTextEdit: (el: StoryElement) => void;
  onUpdate: (id: string, updates: Partial<StoryElement>) => void;
  onCommit: () => void;
  onRemove: (id: string) => void;
  onDragActiveChange: (active: boolean) => void;
  setShowVGuide: (show: boolean) => void;
  setShowHGuide: (show: boolean) => void;
}

interface Gesture {
  id: string;
  limits: ScaleLimits;
  /** The piece and the fingers when the current set of fingers came down. */
  base: PieceTransform;
  /** The transform last applied, which the next set of fingers starts from. */
  current: PieceTransform;
  fingersAtBase: Map<number, Point>;
  fingers: Map<number, Point>;
  /** Any finger moved past the tap slop. */
  moved: boolean;
  overBin: boolean;
}

const limitsFor = (el: StoryElement) =>
  isAnswerableElement(el) ? INTERACTIVE_SCALE : PIECE_SCALE;

const pieceOf = (el: StoryElement): PieceTransform => ({
  x: el.x,
  y: el.y,
  scale: el.scale,
  rotation: el.rotation,
});

/** The first two fingers, in the order they came down. */
const firstTwo = (fingers: Map<number, Point>) =>
  [...fingers.values()].slice(0, 2);

/**
 * Moves, scales and turns the pieces of the story with the fingers, as on
 * Instagram: one finger moves a piece; a second finger, anywhere on the
 * canvas, scales and turns it; dropping it on the bin removes it; a short
 * press without moving is a tap. Each gesture is one undo step. On desktop,
 * Ctrl with the wheel (a trackpad pinch) scales the selected piece.
 */
export function useStoryGestures(o: GestureOptions) {
  const gestureRef = useRef<Gesture | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overBin, setOverBin] = useState(false);
  const optionsRef = useRef(o);
  optionsRef.current = o;
  // The scale a Ctrl-wheel burst has reached, ahead of the render.
  const wheelScaleRef = useRef<{ id: string; scale: number } | null>(null);
  useEffect(() => {
    const pending = wheelScaleRef.current;
    if (pending && (!o.enabled || pending.id !== o.selectedElementId)) {
      wheelScaleRef.current = null;
    }
  }, [o.enabled, o.selectedElementId]);

  const toCanvas = useCallback((e: { clientX: number; clientY: number }) => {
    const rect =
      optionsRef.current.containerRef.current?.getBoundingClientRect();
    return rect
      ? { x: e.clientX - rect.left, y: e.clientY - rect.top }
      : { x: e.clientX, y: e.clientY };
  }, []);

  /**
   * The fingers changed: carry on from where the piece is now. That is the
   * transform last applied, not the last render, which may lag a frame.
   */
  const rebase = useCallback(() => {
    const g = gestureRef.current;
    if (!g) return;
    g.base = g.current;
    g.fingersAtBase = new Map(g.fingers);
  }, []);

  /** Every finger is up, or the system took the touch away (`cancelled`). */
  const finish = useCallback((cancelled = false) => {
    const g = gestureRef.current;
    if (!g) return;
    const opts = optionsRef.current;
    gestureRef.current = null;
    setActiveId(null);
    setOverBin(false);
    opts.setShowVGuide(false);
    opts.setShowHGuide(false);
    opts.onDragActiveChange(false);
    const el = opts.elements.find((e) => e.id === g.id);
    if (cancelled) {
      // An interrupted touch removes nothing and opens nothing: the piece
      // stays where it was moved.
      if (g.moved) opts.onCommit();
      return;
    }
    if (!g.moved) {
      if (el) {
        opts.onSelect(el.id);
        if (el.type === 'text') opts.onTextEdit(el);
      }
      return;
    }
    if (g.overBin) {
      opts.onRemove(g.id);
      return;
    }
    opts.onCommit();
  }, []);

  const move = useCallback(
    (e: PointerEvent) => {
      const g = gestureRef.current;
      if (!g?.fingers.has(e.pointerId)) return;
      const opts = optionsRef.current;
      const point = toCanvas(e);
      g.fingers.set(e.pointerId, point);

      const start = g.fingersAtBase.get(e.pointerId);
      if (
        !g.moved &&
        start &&
        Math.hypot(point.x - start.x, point.y - start.y) > TAP_SLOP_PX
      ) {
        g.moved = true;
        opts.onDragActiveChange(true);
      }
      if (!g.moved) return;

      const raw = transformFromFingers(
        g.base,
        firstTwo(g.fingersAtBase),
        firstTwo(g.fingers),
        g.limits,
      );
      const { piece, vertical, horizontal } = snapPiece(raw);
      g.current = piece;
      opts.setShowVGuide(vertical);
      opts.setShowHGuide(horizontal);
      opts.onUpdate(g.id, piece);

      const container = opts.containerRef.current;
      const onBin =
        g.fingers.size === 1 && container
          ? isOverBin(point, {
              width: container.clientWidth,
              height: container.clientHeight,
            })
          : false;
      if (onBin !== g.overBin) {
        g.overBin = onBin;
        setOverBin(onBin);
      }
    },
    [toCanvas],
  );

  const lift = useCallback(
    (e: PointerEvent) => {
      const g = gestureRef.current;
      if (!g?.fingers.has(e.pointerId)) return;
      g.fingers.delete(e.pointerId);
      if (g.fingers.size === 0) {
        finish();
        return;
      }
      rebase();
    },
    [finish, rebase],
  );

  const cancel = useCallback(
    (e: PointerEvent) => {
      if (!gestureRef.current?.fingers.has(e.pointerId)) return;
      finish(true);
    },
    [finish],
  );

  useEffect(() => {
    if (!activeId) return;
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', lift);
    window.addEventListener('pointercancel', cancel);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', lift);
      window.removeEventListener('pointercancel', cancel);
    };
  }, [activeId, move, lift, cancel]);

  /** A finger comes down on a piece. */
  const onPiecePointerDown = useCallback(
    (el: StoryElement, e: React.PointerEvent) => {
      e.stopPropagation();
      const opts = optionsRef.current;
      if (!opts.enabled) return;
      const g = gestureRef.current;
      if (g) {
        // Another finger joins the gesture of the piece already held.
        g.fingers.set(e.pointerId, toCanvas(e));
        rebase();
        return;
      }
      // Not selected yet: selecting opens its panel, which would resize the
      // canvas under the fingers. A tap selects it when it ends.
      const point = toCanvas(e);
      gestureRef.current = {
        id: el.id,
        limits: limitsFor(el),
        base: pieceOf(el),
        current: pieceOf(el),
        fingersAtBase: new Map([[e.pointerId, point]]),
        fingers: new Map([[e.pointerId, point]]),
        moved: false,
        overBin: false,
      };
      setActiveId(el.id);
    },
    [rebase, toCanvas],
  );

  /**
   * A finger comes down on the canvas itself: a second finger joins the
   * gesture of the held piece. Returns whether it was taken.
   */
  const onCanvasPointerDown = useCallback(
    (e: React.PointerEvent) => {
      const g = gestureRef.current;
      if (!g || !optionsRef.current.enabled) return false;
      g.fingers.set(e.pointerId, toCanvas(e));
      rebase();
      return true;
    },
    [rebase, toCanvas],
  );

  // Ctrl with the wheel, which is how a trackpad pinch arrives, scales the
  // selected piece; the step is made once the wheel rests.
  useEffect(() => {
    const node = o.containerRef.current;
    if (!node) return;
    let rest: ReturnType<typeof setTimeout> | undefined;
    const onWheel = (e: WheelEvent) => {
      const opts = optionsRef.current;
      if (!e.ctrlKey || !opts.enabled || !opts.selectedElementId) return;
      const el = opts.elements.find((x) => x.id === opts.selectedElementId);
      if (!el) return;
      e.preventDefault();
      const limits = limitsFor(el);
      // Each wheel event builds on the last one, not on the last render.
      const from =
        wheelScaleRef.current?.id === el.id
          ? wheelScaleRef.current.scale
          : el.scale;
      const scale = Math.min(
        limits.max,
        Math.max(limits.min, from * Math.exp(-e.deltaY * 0.01)),
      );
      wheelScaleRef.current = { id: el.id, scale };
      opts.onUpdate(el.id, { scale });
      clearTimeout(rest);
      rest = setTimeout(() => {
        wheelScaleRef.current = null;
        optionsRef.current.onCommit();
      }, 250);
    };
    node.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      node.removeEventListener('wheel', onWheel);
      clearTimeout(rest);
    };
  }, [o.containerRef]);

  return {
    /** The piece under the fingers, if any. */
    activeId,
    /** The held piece is over the bin and goes if dropped. */
    overBin,
    onPiecePointerDown,
    onCanvasPointerDown,
  };
}
