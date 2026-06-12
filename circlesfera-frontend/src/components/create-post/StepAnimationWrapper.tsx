import { type HTMLMotionProps, motion } from 'framer-motion';
import type React from 'react';

interface StepAnimationWrapperProps extends HTMLMotionProps<'div'> {
  direction: number;
  stepKey: string;
  children: React.ReactNode;
}

/**
 * Variants for the step transition animation.
 * Slides in from the right when going forward (direction > 0)
 * and from the left when going backward (direction < 0).
 */
const variants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 50 : -50,
    opacity: 0,
    filter: 'blur(10px)',
  }),
  center: {
    zIndex: 1,
    x: 0,
    opacity: 1,
    filter: 'blur(0px)',
  },
  exit: (direction: number) => ({
    zIndex: 0,
    x: direction < 0 ? 50 : -50,
    opacity: 0,
    filter: 'blur(10px)',
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
        x: { type: 'spring', stiffness: 400, damping: 40 },
        opacity: { duration: 0.2 },
        filter: { duration: 0.2 },
      }}
      className={`flex-1 flex flex-col w-full h-full ${className}`}
      {...props}
    >
      {children}
    </motion.div>
  );
}
