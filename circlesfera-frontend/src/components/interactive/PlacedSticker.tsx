import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import {
  type StickerPlacement,
  stickerOnScreen,
} from '../../utils/storySticker';

interface PlacedStickerProps {
  /** Where the creator placed it; null for a story published without one. */
  placement: StickerPlacement | null;
  onPointerDown?: () => void;
  children: ReactNode;
}

/**
 * A poll or a question on a story, answered where the creator placed it. The
 * story picture covers the screen and is cut at the sides on a tall phone;
 * the sticker keeps its place on the picture but never leaves the screen.
 */
export function PlacedSticker({
  placement,
  onPointerDown,
  children,
}: PlacedStickerProps) {
  const areaRef = useRef<HTMLDivElement>(null);
  const [area, setArea] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const node = areaRef.current;
    if (!node || !placement) return;
    const measure = () =>
      setArea({ width: node.clientWidth, height: node.clientHeight });
    measure();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [placement]);

  if (!placement) {
    return (
      <div
        className="absolute inset-x-4 bottom-28 z-50 pointer-events-auto"
        onPointerDown={onPointerDown}
      >
        {children}
      </div>
    );
  }

  const spot = stickerOnScreen(placement, area);
  return (
    <div
      ref={areaRef}
      className="absolute inset-0 z-50 overflow-hidden pointer-events-none"
    >
      <div
        data-testid="placed-sticker"
        className="absolute pointer-events-auto"
        onPointerDown={onPointerDown}
        style={{
          left: spot.left,
          top: spot.top,
          width: spot.width,
          transform: `translate(-50%, -50%) scale(${placement.scale}) rotate(${placement.rotation}deg)`,
          visibility: spot.width > 0 ? 'visible' : 'hidden',
        }}
      >
        {children}
      </div>
    </div>
  );
}
