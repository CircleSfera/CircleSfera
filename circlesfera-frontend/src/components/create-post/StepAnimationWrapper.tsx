import { type HTMLMotionProps, motion } from 'framer-motion';
import type React from 'react';

interface StepAnimationWrapperProps extends HTMLMotionProps<'div'> {
  direction: number;
  stepKey: string;
  children: React.ReactNode;
}

/** Horizontal step transition — no blur (cleaner, cheaper, reduced-motion friendlier). */
const variants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 28 : -28,
    opacity: 0,
  }),
  center: {
    zIndex: 1,
    x: 0,
    opacity: 1,
  },
  exit: (direction: number) => ({
    zIndex: 0,
    x: direction < 0 ? 28 : -28,
    opacity: 0,
  }),
};

export default function StepAnimationWrapper({
  direction,
  stepKey,
  children,
  className = '',
  ...props
}: StepAnimationWrapperProps) {
  return (
    <motion.div
      key={stepKey}
      custom={direction}
      variants={variants}
      initial="enter"
      animate="center"
      exit="exit"
      transition={{
        x: { type: 'spring', stiffness: 420, damping: 36 },
        opacity: { duration: 0.18 },
      }}
      className={`flex-1 flex flex-col w-full h-full min-h-0 ${className}`}
      {...props}
    >
      {children}
    </motion.div>
  );
}
