import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';

interface HighlightBubbleProps {
  id: string;
  title: string;
  coverUrl?: string;
  standardUrl?: string;
  thumbnailUrl?: string;
  isAddButton?: boolean;
  onClick?: () => void;
}

export default function HighlightBubble({
  id,
  title,
  coverUrl,
  standardUrl,
  thumbnailUrl,
  isAddButton,
  onClick,
}: HighlightBubbleProps) {
  if (isAddButton) {
    return (
      <motion.div
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        className="flex flex-col items-center gap-1 cursor-pointer shrink-0"
        onClick={onClick}
      >
        <div className="w-16 h-16 rounded-full border-2 border-dashed border-white/20 flex items-center justify-center bg-white/5 hover:bg-white/10 hover:border-white/40 hover:shadow-[0_0_15px_rgba(255,255,255,0.1)] transition-all duration-300">
          <svg
            aria-hidden="true"
            className="w-6 h-6 text-white/40"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 4v16m8-8H4"
            />
          </svg>
        </div>
        <span className="text-xs font-bold text-white/40 uppercase tracking-wide">
          New
        </span>
      </motion.div>
    );
  }

  return (
    <Link
      to={`/stories/highlights/${id}`}
      className="flex flex-col items-center gap-1 shrink-0 group"
    >
      <motion.div
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        className="relative p-[3px] rounded-full border border-white/10 bg-white/5 group-hover:border-white/30 transition-all duration-300 ring-4 ring-black/40 group-hover:shadow-[inset_0_0_20px_rgba(255,255,255,0.2)]"
      >
        <div className="w-16 h-16 rounded-full overflow-hidden bg-zinc-900 border border-white/5 shadow-inner relative">
          <div className="absolute inset-0 bg-linear-to-tr from-brand-primary/10 to-brand-secondary/10 opacity-0 group-hover:opacity-100 transition-opacity z-10 mix-blend-overlay pointer-events-none" />
          {coverUrl ? (
            <img
              src={thumbnailUrl || standardUrl || coverUrl}
              alt={title}
              className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
              loading="lazy"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-linear-to-br from-zinc-800 to-zinc-900 text-gray-500">
              <div className="w-8 h-8 rounded-full border-2 border-white/5 animate-pulse-slow" />
            </div>
          )}
        </div>
      </motion.div>
      <span className="text-xs font-black text-white/60 group-hover:text-white truncate max-w-[72px] text-center tracking-tighter transition-colors">
        {title}
      </span>
    </Link>
  );
}
