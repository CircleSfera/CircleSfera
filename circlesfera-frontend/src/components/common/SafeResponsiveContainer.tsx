import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { ResponsiveContainer } from 'recharts';

interface SafeResponsiveContainerProps
  extends React.ComponentProps<typeof ResponsiveContainer> {
  children: React.ReactElement;
  /** Optional explicit height for the wrapper div. Defaults to '100%'. */
  wrapperHeight?: string | number;
}

/**
 * A wrapper for Recharts ResponsiveContainer that ensures the component is only
 * rendered when its parent container has a valid, non-zero width and height.
 * This prevents "The width(-1) and height(-1) of chart should be greater than 0" warnings.
 */
export const SafeResponsiveContainer: React.FC<
  SafeResponsiveContainerProps
> = ({ children, wrapperHeight = '100%', ...props }) => {
  const [hasSize, setHasSize] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // Use ResizeObserver for high-fidelity size tracking
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        // Only mark as ready when we have real dimensions
        if (width > 0 && height > 0) {
          setHasSize(true);
        }
      }
    });

    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: wrapperHeight,
        position: 'relative',
        minHeight: 1, // Tiny non-zero height to ensure initial measurement
      }}
    >
      {hasSize && (
        <ResponsiveContainer {...props}>{children}</ResponsiveContainer>
      )}
    </div>
  );
};

export default SafeResponsiveContainer;
