import { useEffect, useState } from 'react';

/**
 * How much of the bottom of the layout viewport the on-screen keyboard
 * covers. On a phone's browser the page keeps its height when the keyboard
 * opens: only the visual viewport shrinks (and may scroll), so what is under
 * the keyboard is the layout height minus the bottom of the visual viewport.
 */
export function keyboardInsetFrom(
  layoutHeight: number,
  viewport: Pick<VisualViewport, 'height' | 'offsetTop'>,
): number {
  return Math.max(
    0,
    Math.round(layoutHeight - viewport.height - viewport.offsetTop),
  );
}

/**
 * The height of the keyboard over the bottom of the screen, kept current as
 * it opens and closes. It reads the visual viewport, and in the app the
 * keyboard's own events too, whose web view may not shrink the viewport.
 */
export function useStoryKeyboardInset(): number {
  const [viewportInset, setViewportInset] = useState(0);
  const [appKeyboard, setAppKeyboard] = useState(0);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const sync = () =>
      setViewportInset(keyboardInsetFrom(window.innerHeight, vv));
    sync();
    vv.addEventListener('resize', sync);
    vv.addEventListener('scroll', sync);
    return () => {
      vv.removeEventListener('resize', sync);
      vv.removeEventListener('scroll', sync);
    };
  }, []);

  useEffect(() => {
    // The app's keyboard announces itself on the window, with its height.
    const show = (e: Event) => {
      const height = (e as Event & { keyboardHeight?: number }).keyboardHeight;
      setAppKeyboard(typeof height === 'number' ? Math.max(0, height) : 0);
    };
    const hide = () => setAppKeyboard(0);
    window.addEventListener('keyboardWillShow', show);
    window.addEventListener('keyboardWillHide', hide);
    return () => {
      window.removeEventListener('keyboardWillShow', show);
      window.removeEventListener('keyboardWillHide', hide);
    };
  }, []);

  return Math.max(viewportInset, appKeyboard);
}
