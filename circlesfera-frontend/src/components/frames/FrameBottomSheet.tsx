import { AnimatePresence, motion, useDragControls } from 'framer-motion';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../ui';

interface FrameBottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  maxHeightClass?: string;
  showHandle?: boolean;
  // Bottom sheet (default) or centered card within the frame player
  align?: 'bottom' | 'center';
  // Optional id for aria-labelledby
  titleId?: string;
  /** Backdrop behind the sheet. Frames keep the default heavy scrim. */
  scrimClass?: string;
}

export default function FrameBottomSheet({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  maxHeightClass = 'max-h-[58%]',
  showHandle = true,
  align = 'bottom',
  titleId,
  scrimClass = 'bg-black/60 backdrop-blur-sm',
}: FrameBottomSheetProps) {
  const { t } = useTranslation();
  const dragControls = useDragControls();
  const isCentered = align === 'center';

  const header = (
    <div className="flex items-start justify-between gap-3 px-4 py-2 border-b border-white/10 shrink-0">
      <div className="min-w-0 flex-1">
        <h2
          id={titleId}
          className="text-base font-bold text-white leading-tight truncate"
        >
          {title}
        </h2>
        {subtitle ? (
          <p className="text-xs text-white/55 mt-0.5 truncate">{subtitle}</p>
        ) : null}
      </div>
      <Button
        onClick={onClose}
        variant="ghost"
        size="icon"
        aria-label={t('frames.close')}
        className="w-8 h-8 rounded-full bg-white/10 text-white hover:bg-white/20 shrink-0"
      >
        <X size={18} />
      </Button>
    </div>
  );

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="absolute inset-0 pointer-events-auto z-50">
          <motion.button
            type="button"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className={`absolute inset-0 z-40 border-none p-0 cursor-default ${scrimClass}`}
            onClick={onClose}
            aria-label={t('frames.close')}
          />

          {isCentered ? (
            <div className="absolute inset-0 z-50 flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0, scale: 0.96, y: 8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: 8 }}
                transition={{ type: 'spring', damping: 28, stiffness: 360 }}
                className={`pointer-events-auto w-full max-w-sm flex flex-col bg-surface-elevated rounded-[20px] border border-white/10 shadow-2xl overflow-hidden ${maxHeightClass}`}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
              >
                {header}
                <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                  {children}
                </div>
              </motion.div>
            </div>
          ) : (
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 320 }}
              drag="y"
              dragControls={dragControls}
              dragListener={false}
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={0.15}
              onDragEnd={(_e, info) => {
                if (info.offset.y > 80 || info.velocity.y > 500) {
                  onClose();
                }
              }}
              className={`absolute bottom-0 left-0 right-0 z-50 flex flex-col bg-surface-elevated rounded-t-[20px] border-t border-white/10 shadow-2xl overflow-hidden ${maxHeightClass}`}
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
            >
              {showHandle && (
                <div
                  className="w-full flex justify-center pt-2.5 pb-1 shrink-0 cursor-grab active:cursor-grabbing touch-none"
                  onPointerDown={(e) => dragControls.start(e)}
                >
                  <div className="w-10 h-1 rounded-full bg-white/25" />
                </div>
              )}

              {header}

              <div className="flex-1 min-h-0 flex flex-col overflow-hidden pb-[env(safe-area-inset-bottom,0px)]">
                {children}
              </div>
            </motion.div>
          )}
        </div>
      )}
    </AnimatePresence>
  );
}
