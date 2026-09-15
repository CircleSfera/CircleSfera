import { AnimatePresence, motion, useDragControls } from 'framer-motion';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../ui';

type MapBottomSheetProps = {
  isOpen: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  maxHeightClass?: string;
  titleId?: string;
  /** Soft map scrim; default keeps the map readable. */
  scrimClass?: string;
  /**
   * Desktop max width for the floating bottom card.
   * Peek stays compact; place detail can be a bit wider for a dense grid.
   */
  desktopWidthClass?: string;
};

/**
 * Discovery-map sheet: full-bleed bottom sheet on mobile;
 * constrained floating bottom card on md+ (map stays the hero).
 */
export default function MapBottomSheet({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  maxHeightClass = 'max-h-[min(48%,420px)]',
  titleId,
  scrimClass = 'bg-black/25',
  desktopWidthClass = 'md:w-[min(100%-2rem,420px)]',
}: MapBottomSheetProps) {
  const { t } = useTranslation();
  const dragControls = useDragControls();

  return (
    <AnimatePresence>
      {isOpen ? (
        <div className="absolute inset-0 pointer-events-auto z-50 overflow-hidden">
          <motion.button
            type="button"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className={`absolute inset-0 z-40 border-none p-0 cursor-default ${scrimClass}`}
            onClick={onClose}
            aria-label={t('explore.map.close_sheet')}
          />

          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 340 }}
            drag="y"
            dragControls={dragControls}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={0.12}
            onDragEnd={(_e, info) => {
              if (info.offset.y > 80 || info.velocity.y > 500) {
                onClose();
              }
            }}
            data-testid="explore-map-sheet"
            className={[
              'absolute z-50 flex flex-col overflow-hidden',
              'inset-x-0 bottom-0 w-full',
              'rounded-t-[22px] border border-white/12 border-b-0',
              'bg-black/72 backdrop-blur-xl shadow-[0_-12px_40px_rgba(0,0,0,0.5)]',
              // Desktop: centered floating card (same bottom-sheet pattern, constrained width)
              'md:left-1/2 md:right-auto md:-translate-x-1/2 md:bottom-6',
              desktopWidthClass,
              'md:rounded-[22px] md:border md:border-white/12',
              'md:shadow-[0_16px_48px_rgba(0,0,0,0.55)]',
              maxHeightClass,
            ].join(' ')}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
          >
            <div
              className="w-full flex justify-center pt-2.5 pb-1 shrink-0 cursor-grab active:cursor-grabbing touch-none"
              onPointerDown={(e) => dragControls.start(e)}
            >
              <div className="w-10 h-1 rounded-full bg-white/30" />
            </div>

            <div className="flex items-start justify-between gap-3 px-4 pb-2 shrink-0">
              <div className="min-w-0 flex-1 pt-0.5">
                <h2
                  id={titleId}
                  className="text-[15px] font-bold text-white leading-tight truncate tracking-tight"
                >
                  {title}
                </h2>
                {subtitle ? (
                  <p className="text-[11px] text-white/50 mt-0.5 truncate">
                    {subtitle}
                  </p>
                ) : null}
              </div>
              <Button
                onClick={onClose}
                variant="ghost"
                size="icon"
                aria-label={t('explore.map.close_sheet')}
                className="w-9 h-9 rounded-full bg-white/8 text-white hover:bg-white/14 shrink-0"
              >
                <X size={18} />
              </Button>
            </div>

            <div className="flex-1 min-h-0 flex flex-col overflow-hidden pb-[env(safe-area-inset-bottom,0px)] md:pb-2">
              {children}
            </div>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
}
