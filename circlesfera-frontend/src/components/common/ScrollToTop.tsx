import { useLayoutEffect } from 'react';
import { useLocation } from 'react-router-dom';

// Global component that scrolls the window to top on every route change.
// This fixes the UX issue where navigating to long pages (like legal/profile)
// Preserves the previous scroll position.
const ScrollToTop = () => {
  const { pathname } = useLocation();

  // biome-ignore lint/correctness/useExhaustiveDependencies: Scroll on route change
  useLayoutEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return null;
};

export default ScrollToTop;
