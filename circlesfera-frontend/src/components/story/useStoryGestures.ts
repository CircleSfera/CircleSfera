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
import {
  clampPhoto,
  classifyPhotoRelease,
  PHOTO_SCALE,
  type StoryPhotoEdit,
} from './storyPhoto';

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
  /** The photo behind the story, as it is placed now. */
  photo: StoryPhotoEdit;
  /**
   * The fingers move the photo: it is a picture (not a video or a colour),
   * nothing is selected and no tool is open.
   */
  photoEnabled: boolean;
  onPhotoUpdate: (updates: Partial<StoryPhotoEdit>) => void;
  /** A swipe asks for the next (`1`) or previous filter, the photo put back. */
  onFilterStep: (direction: 1 | -1, photo: StoryPhotoEdit) => void;
}

/** What the fingers hold: a piece by its id, or the photo. */
const PHOTO = null;

interface Gesture {
  id: string | typeof PHOTO;
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
  /** The photo when the gesture began, which a swipe puts back. */
  photoAtStart?: StoryPhotoEdit;
  startedAt: number;
  /** The first finger: where it came down and where it was last. */
  firstId: number;
  firstDown: Point;
  firstLast: Point;
  /** The most fingers down at once. */
  maxFingers: number;
}

const limitsFor = (el: StoryElement) =>
  isAnswerableElement(el) ? INTERACTIVE_SCALE : PIECE_SCALE;

const pieceOf = (el: StoryElement): PieceTransform => ({
  x: el.x,
  y: el.y,
  scale: el.scale,
  rotation: el.rotation,
});

const canvasSize = (node: HTMLElement | null) => ({
  width: node?.clientWidth || 1,
  height: node?.clientHeight || 1,
});

/** The photo in canvas pixels, as the fingers move it. */
const photoInPixels = (
  p: StoryPhotoEdit,
  size: { width: number; height: number },
): PieceTransform => ({
  x: p.x * size.width,
  y: p.y * size.height,
  scale: p.scale,
  rotation: p.rotation,
});

const newGesture = (
  id: string | typeof PHOTO,
  limits: ScaleLimits,
  start: PieceTransform,
  pointerId: number,
  point: Point,
): Gesture => ({
  id,
  limits,
  base: start,
  current: start,
  fingersAtBase: new Map([[pointerId, point]]),
  fingers: new Map([[pointerId, point]]),
  moved: false,
  overBin: false,
  startedAt: performance.now(),
  firstId: pointerId,
  firstDown: point,
  firstLast: point,
  maxFingers: 1,
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
 *
 * With nothing selected, the same fingers move, scale and turn the photo
 * behind the story, and a quick sideways swipe changes its filter instead
 * (see `classifyPhotoRelease`). A tap is left to the canvas, which opens a
 * text with it.
 */
export function useStoryGestures(o: GestureOptions) {
  const gestureRef = useRef<Gesture | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overBin, setOverBin] = useState(false);
  const optionsRef = useRef(o);
  optionsRef.current = o;
  // Takes the window listeners of the gesture off. They are put on with the
  // first finger, so no release can come before them.
  const detachRef = useRef<(() => void) | null>(null);
  // The scale a Ctrl-wheel burst has reached, ahead of the render.
  const wheelScaleRef = useRef<{ id: string | null; scale: number } | null>(
    null,
  );
  useEffect(() => {
    const pending = wheelScaleRef.current;
    if (pending && (!o.enabled || pending.id !== o.selectedElementId)) {
      wheelScaleRef.current = null;
    }
  }, [o.enabled, o.selectedElementId]);
  // Whether the last touch of the photo moved it, so it was not a tap.
  const photoMovedRef = useRef(false);

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
    detachRef.current?.();
    detachRef.current = null;
    setActiveId(null);
    setOverBin(false);
    opts.setShowVGuide(false);
    opts.setShowHGuide(false);
    if (g.id === PHOTO) {
      photoMovedRef.current = g.moved;
      if (cancelled) {
        if (g.moved) opts.onCommit();
        return;
      }
      const release = classifyPhotoRelease({
        moved: g.moved,
        fingers: g.maxFingers,
        dx: g.firstLast.x - g.firstDown.x,
        dy: g.firstLast.y - g.firstDown.y,
        ms: performance.now() - g.startedAt,
      });
      if (release.kind === 'swipe' && g.photoAtStart) {
        opts.onFilterStep(release.direction, g.photoAtStart);
      } else if (release.kind === 'drag') {
        opts.onCommit();
      }
      return;
    }
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
      if (e.pointerId === g.firstId) g.firstLast = point;

      const start = g.fingersAtBase.get(e.pointerId);
      if (
        !g.moved &&
        start &&
        Math.hypot(point.x - start.x, point.y - start.y) > TAP_SLOP_PX
      ) {
        g.moved = true;
        if (g.id !== PHOTO) opts.onDragActiveChange(true);
      }
      if (!g.moved) return;

      const raw = transformFromFingers(
        g.base,
        firstTwo(g.fingersAtBase),
        firstTwo(g.fingers),
        g.limits,
      );
      const { piece, vertical, horizontal } = snapPiece(raw);
      opts.setShowVGuide(vertical);
      opts.setShowHGuide(horizontal);
      if (g.id === PHOTO) {
        const size = canvasSize(opts.containerRef.current);
        const photo = clampPhoto({
          ...opts.photo,
          x: piece.x / size.width,
          y: piece.y / size.height,
          scale: piece.scale,
          rotation: piece.rotation,
        });
        g.current = photoInPixels(photo, size);
        opts.onPhotoUpdate({
          x: photo.x,
          y: photo.y,
          scale: photo.scale,
          rotation: photo.rotation,
        });
        return;
      }
      g.current = piece;
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
      if (e.pointerId === g.firstId) g.firstLast = toCanvas(e);
      g.fingers.delete(e.pointerId);
      if (g.fingers.size === 0) {
        finish();
        return;
      }
      rebase();
    },
    [finish, rebase, toCanvas],
  );

  const cancel = useCallback(
    (e: PointerEvent) => {
      if (!gestureRef.current?.fingers.has(e.pointerId)) return;
      finish(true);
    },
    [finish],
  );

  /** Listens to the fingers of a gesture that has just started. */
  const attach = useCallback(() => {
    if (detachRef.current) return;
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', lift);
    window.addEventListener('pointercancel', cancel);
    detachRef.current = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', lift);
      window.removeEventListener('pointercancel', cancel);
    };
  }, [move, lift, cancel]);

  useEffect(() => () => detachRef.current?.(), []);

  /** Another finger joins the gesture already held. */
  const join = useCallback(
    (g: Gesture, e: React.PointerEvent) => {
      g.fingers.set(e.pointerId, toCanvas(e));
      g.maxFingers = Math.max(g.maxFingers, g.fingers.size);
      rebase();
    },
    [rebase, toCanvas],
  );

  /** A finger comes down on a piece. */
  const onPiecePointerDown = useCallback(
    (el: StoryElement, e: React.PointerEvent) => {
      e.stopPropagation();
      const opts = optionsRef.current;
      if (!opts.enabled) return;
      const g = gestureRef.current;
      if (g) {
        join(g, e);
        return;
      }
      // Not selected yet: selecting opens its panel, which would resize the
      // canvas under the fingers. A tap selects it when it ends.
      gestureRef.current = newGesture(
        el.id,
        limitsFor(el),
        pieceOf(el),
        e.pointerId,
        toCanvas(e),
      );
      attach();
      setActiveId(el.id);
    },
    [attach, join, toCanvas],
  );

  /**
   * A finger comes down on the canvas itself: a second finger joins the
   * gesture of the held piece or photo, and returns true. A first finger
   * takes hold of the photo, if it can be moved, and returns false: the
   * canvas still reads a tap from it.
   */
  const onCanvasPointerDown = useCallback(
    (e: React.PointerEvent) => {
      const opts = optionsRef.current;
      if (!opts.enabled) return false;
      const g = gestureRef.current;
      if (g) {
        join(g, e);
        return true;
      }
      photoMovedRef.current = false;
      if (!opts.photoEnabled) return false;
      if (e.pointerType === 'mouse' && e.button !== 0) return false;
      const size = canvasSize(opts.containerRef.current);
      gestureRef.current = {
        ...newGesture(
          PHOTO,
          PHOTO_SCALE,
          photoInPixels(opts.photo, size),
          e.pointerId,
          toCanvas(e),
        ),
        photoAtStart: opts.photo,
      };
      attach();
      return false;
    },
    [attach, join, toCanvas],
  );

  // Ctrl with the wheel, which is how a trackpad pinch arrives, scales the
  // selected piece; the step is made once the wheel rests.
  useEffect(() => {
    const node = o.containerRef.current;
    if (!node) return;
    let rest: ReturnType<typeof setTimeout> | undefined;
    const commitAtRest = () => {
      clearTimeout(rest);
      rest = setTimeout(() => {
        wheelScaleRef.current = null;
        optionsRef.current.onCommit();
      }, 250);
    };
    const onWheel = (e: WheelEvent) => {
      const opts = optionsRef.current;
      if (!e.ctrlKey || !opts.enabled) return;
      if (!opts.selectedElementId) {
        if (!opts.photoEnabled) return;
        e.preventDefault();
        const from =
          wheelScaleRef.current?.id === PHOTO
            ? wheelScaleRef.current.scale
            : opts.photo.scale;
        const photo = clampPhoto({
          ...opts.photo,
          scale: from * Math.exp(-e.deltaY * 0.01),
        });
        wheelScaleRef.current = { id: PHOTO, scale: photo.scale };
        opts.onPhotoUpdate({ scale: photo.scale, x: photo.x, y: photo.y });
        commitAtRest();
        return;
      }
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
      commitAtRest();
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
    /** Whether the last touch of the photo moved it: it was no tap. */
    photoMoved: () => photoMovedRef.current,
  };
}
