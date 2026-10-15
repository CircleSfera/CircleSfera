import { motion } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

/** The frame of a sticker's setup panel: its name, a hint and its form. */
export function StoryStickerSetup({
  panelKey,
  icon: Icon,
  title,
  hint,
  children,
}: {
  panelKey: string;
  icon: LucideIcon;
  title: string;
  hint: string;
  children: ReactNode;
}) {
  return (
    <motion.div
      key={panelKey}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 16 }}
      transition={{ duration: 0.25 }}
      className="px-3 space-y-3 max-w-md mx-auto"
    >
      <div className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-primary/15 text-brand-primary-text border border-brand-primary/25">
          <Icon size={16} aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-bold text-white/60 uppercase tracking-[0.14em]">
            {title}
          </p>
          <p className="text-xs text-white/50 truncate">{hint}</p>
        </div>
      </div>
      {children}
    </motion.div>
  );
}

export const SETUP_INPUT =
  'w-full min-h-12 bg-white/6 text-white px-4 py-3 rounded-2xl outline-none border border-white/10 text-base focus:border-brand-primary/40';
