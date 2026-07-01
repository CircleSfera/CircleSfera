import { motion } from 'framer-motion';
import { useStudioStore } from '../../stores/studioStore';

export default function Playhead() {
  const { playhead, zoom } = useStudioStore();

  const xPos = playhead * zoom;

  return (
    <motion.div
      className="absolute top-0 bottom-0 z-30 pointer-events-none"
      style={{ left: `calc(50vw + ${xPos}px)` }} // Offset by 50vw padding
    >
      <div className="w-0.5 h-full bg-brand-primary relative shadow-[0_0_8px_rgba(131,58,180,0.8)]">
        {/* Playhead Handle */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-full pointer-events-auto cursor-grab active:cursor-grabbing pb-1">
          <svg
            aria-label="Playhead"
            width="14"
            height="20"
            viewBox="0 0 14 20"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M0 2C0 0.895431 0.895431 0 2 0H12C13.1046 0 14 0.895431 14 2V14.5L7 19.5L0 14.5V2Z"
              className="fill-brand-primary"
            />
          </svg>
        </div>
      </div>
    </motion.div>
  );
}
