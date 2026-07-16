import {
  motion,
  useAnimation,
  useMotionValue,
  useTransform,
} from 'framer-motion';
import { Loader2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

interface PullToRefreshProps {
  onRefresh: () => Promise<void>;
  children: React.ReactNode;
}

const MAX_PULL = 120;
const TRIGGER_PULL = 80;

export function PullToRefresh({ onRefresh, children }: PullToRefreshProps) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const y = useMotionValue(0);
  const controls = useAnimation();

  useEffect(() => {
    let startY = 0;
    let currentY = 0;
    let isDragging = false;

    const handleTouchStart = (e: TouchEvent) => {
      // Only enable pull to refresh if we are at the top of the container
      if (window.scrollY === 0) {
        startY = e.touches[0].clientY;
        isDragging = true;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isDragging || isRefreshing) return;

      currentY = e.touches[0].clientY;
      const diff = currentY - startY;

      if (diff > 0) {
        // Prevent default scroll behavior when pulling down
        e.preventDefault();
        // Add resistance
        const pullDistance = Math.min(diff * 0.5, MAX_PULL);
        y.set(pullDistance);
      }
    };

    const handleTouchEnd = async () => {
      if (!isDragging) return;
      isDragging = false;

      if (y.get() >= TRIGGER_PULL && !isRefreshing) {
        setIsRefreshing(true);
        // Animate to loading state position
        controls.start({ y: 50 });

        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          navigator.vibrate(50);
        }

        try {
          await onRefresh();
        } finally {
          setIsRefreshing(false);
          controls.start({ y: 0 });
          y.set(0);
        }
      } else {
        // Animate back to top
        controls.start({ y: 0 });
        y.set(0);
      }
    };

    const element = containerRef.current;
    if (element) {
      element.addEventListener('touchstart', handleTouchStart, {
        passive: true,
      });
      element.addEventListener('touchmove', handleTouchMove, {
        passive: false,
      });
      element.addEventListener('touchend', handleTouchEnd);
    }

    return () => {
      if (element) {
        element.removeEventListener('touchstart', handleTouchStart);
        element.removeEventListener('touchmove', handleTouchMove);
        element.removeEventListener('touchend', handleTouchEnd);
      }
    };
  }, [isRefreshing, onRefresh, controls, y]);

  // Sync rotation based on Y pull
  const [rotation, setRotation] = useState(0);
  useEffect(() => {
    const unsubscribe = y.on('change', (latest) => {
      setRotation(Math.min(latest * 3, 360));
    });
    return () => unsubscribe();
  }, [y]);

  const opacity = useTransform(y, [0, 50], [0, 1]);

  return (
    <div className="relative w-full overflow-hidden" ref={containerRef}>
      {/* Loading Spinner Area */}
      <motion.div
        style={{ opacity: isRefreshing ? 1 : opacity }}
        className="absolute top-0 left-0 w-full flex justify-center items-start pt-4 z-0"
      >
        <div className="bg-black/50 backdrop-blur-md rounded-full p-2 border border-white/10 shadow-[0_0_15px_rgba(255,255,255,0.1)]">
          <Loader2
            className={`w-6 h-6 text-brand-primary ${isRefreshing ? 'animate-spin' : ''}`}
            style={{
              transform: isRefreshing ? undefined : `rotate(${rotation}deg)`,
            }}
          />
        </div>
      </motion.div>

      {/* Content Area */}
      <motion.div
        animate={controls}
        style={{ y }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        className="relative z-10 w-full bg-transparent"
      >
        {children}
      </motion.div>
    </div>
  );
}
