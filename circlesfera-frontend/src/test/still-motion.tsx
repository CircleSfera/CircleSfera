import { createElement, type ReactNode } from 'react';

/**
 * Stand-in for the animation library in tests: the same elements, with no
 * animation. The test environment has no frames to play an exit animation
 * on, so an element that is leaving would stay on screen for ever.
 *
 * Use: vi.mock('framer-motion', async () => (await import('../test/still-motion')).stillMotion());
 */
const ANIMATION_PROPS = new Set([
  'animate',
  'initial',
  'exit',
  'transition',
  'variants',
  'custom',
  'layout',
  'layoutId',
  'whileHover',
  'whileTap',
  'whileFocus',
  'whileInView',
  'drag',
  'dragControls',
  'dragListener',
  'dragConstraints',
  'dragElastic',
  'onDragEnd',
  'onAnimationComplete',
]);

const still = (tag: string) =>
  function StillElement({
    children,
    ...props
  }: Record<string, unknown> & { children?: ReactNode }) {
    const kept = Object.fromEntries(
      Object.entries(props).filter(([name]) => !ANIMATION_PROPS.has(name)),
    );
    return createElement(tag, kept, children);
  };

export function stillMotion() {
  return {
    motion: new Proxy(
      {},
      { get: (_target, tag: string) => still(tag) },
    ) as Record<string, ReturnType<typeof still>>,
    AnimatePresence: ({ children }: { children?: ReactNode }) => children,
    useDragControls: () => ({ start: () => {} }),
    useReducedMotion: () => true,
  };
}
