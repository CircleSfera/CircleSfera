import { motion } from 'framer-motion';
import { useStudioStore } from '../../stores/studioStore';

export default function Playhead() {
  const { playhead, zoom } = useStudioStore();

  const xPos = playhead * zoom;

  const formatTime = (timeInSeconds: number) => {
    const mins = Math.floor(timeInSeconds / 60);
    const secs = Math.floor(timeInSeconds % 60);
    const frames = Math.floor((timeInSeconds % 1) * 30); // Assuming 30fps for display
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${frames.toString().padStart(2, '0')}`;
  };

  return (
    <motion.div
      className="absolute top-0 bottom-0 z-30 pointer-events-none"
      style={{ left: `calc(50vw + ${xPos}px)` }} // Offset by 50vw padding
    >
      <div className="w-px h-full bg-brand-primary relative shadow-[0_0_8px_rgba(131,58,180,0.8),0_0_2px_rgba(255,255,255,0.8)]">
        {/* Playhead Handle */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-full pointer-events-auto cursor-grab active:cursor-grabbing group">
          <svg
            aria-label="Playhead"
            width="14"
            height="18"
            viewBox="0 0 14 20"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]"
          >
            <path
              d="M0 2C0 0.895431 0.895431 0 2 0H12C13.1046 0 14 0.895431 14 2V14.5L7 19.5L0 14.5V2Z"
              className="fill-brand-primary group-hover:fill-purple-400 transition-colors"
            />
          </svg>

          {/* Timecode Tooltip */}
          <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-black/80 backdrop-blur text-white text-[10px] font-mono px-1.5 py-0.5 rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap border border-white/10 pointer-events-none">
            {formatTime(playhead)}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
