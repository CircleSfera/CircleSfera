import { useEffect, useRef } from 'react';

export function useFocusTrap<T extends HTMLElement>(
  isActive: boolean,
  externalRef?: React.RefObject<T | null>,
  options?: { onEscape?: () => void },
) {
  const internalRef = useRef<T>(null);
  const containerRef = externalRef || internalRef;
  const previousFocusRef = useRef<HTMLElement | null>(null);
  // Callers write the handler in place, so it is a new function on every
  // render. Kept in a ref, a new one does not start the trap again: that
  // would pull the focus back to the first control in the middle of typing.
  const onEscapeRef = useRef(options?.onEscape);
  useEffect(() => {
    onEscapeRef.current = options?.onEscape;
  });

  useEffect(() => {
    if (!isActive) return;

    const container = containerRef.current;
    if (!container) return;

    // Store previous focus
    previousFocusRef.current = document.activeElement as HTMLElement;

    // Get all focusable elements
    const focusableSelectors = [
      'a[href]',
      'button:not([disabled])',
      'textarea:not([disabled])',
      'input:not([disabled])',
      'select:not([disabled])',
      '[tabindex]:not([tabindex="-1"])',
    ].join(', ');

    const focusableElements = Array.from(
      container.querySelectorAll<HTMLElement>(focusableSelectors),
    ).filter(
      (el) =>
        !el.hasAttribute('disabled') &&
        el.getAttribute('aria-hidden') !== 'true',
    );

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    if (firstElement) {
      firstElement.focus();
    } else {
      container.focus(); // Fallback if no focusable elements inside
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onEscapeRef.current?.();
        return;
      }
      if (e.key !== 'Tab') return;
      if (!focusableElements.length) {
        e.preventDefault(); // Trap strictly if no focusable elements
        return;
      }

      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          e.preventDefault();
          lastElement.focus();
        }
      } else {
        if (document.activeElement === lastElement) {
          e.preventDefault();
          firstElement.focus();
        }
      }
    };

    container.addEventListener('keydown', handleKeyDown);

    return () => {
      container.removeEventListener('keydown', handleKeyDown);
      // Whether the dialog is switched off or taken away, the focus goes
      // back to what had it before, when that is still on the page.
      const previous = previousFocusRef.current;
      previousFocusRef.current = null;
      if (previous?.isConnected) previous.focus();
    };
  }, [isActive, containerRef]);

  return containerRef;
}
