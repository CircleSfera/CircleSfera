import { AnimatePresence, motion, useDragControls } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';
import { X } from 'lucide-react';
import type { ReactNode, Ref } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '../ui';

// The options of a post or a Frame, as a sheet: on a phone it rises from
// the bottom and is dragged down to close, as Instagram's; on a wide
// screen it is a card in the middle.

interface OptionRowProps {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  variant?: 'default' | 'danger' | 'highlight';
}

export function OptionRow({
  icon: Icon,
  label,
  onClick,
  variant = 'default',
}: OptionRowProps) {
  const iconBg =
    variant === 'danger'
      ? 'bg-red-500/10 text-red-400'
      : variant === 'highlight'
        ? 'bg-amber-500/10 text-amber-400'
        : 'bg-white/10 text-white/80';

  const labelClass =
    variant === 'danger'
      ? 'text-red-400'
      : variant === 'highlight'
        ? 'text-amber-300'
        : 'text-white';

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-2.5 rounded-xl px-2 py-2 text-left transition-colors hover:bg-white/5 active:bg-white/10"
    >
      <div
        className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${iconBg}`}
      >
        <Icon size={18} />
      </div>
      <span className={`font-semibold text-sm ${labelClass}`}>{label}</span>
    </button>
  );
}

export function OptionsSheet({
  isOpen,
  onClose,
  title,
  children,
  panelRef,
}: {
  isOpen: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  // The panel, for a caller that closes the sheet on a tap outside it.
  panelRef?: Ref<HTMLDivElement>;
}) {
  const { t } = useTranslation();
  const dragControls = useDragControls();
  // Drawn on the page itself, above its bars, whatever opened it.
  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-100 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />
          <div className="fixed inset-0 z-101 pointer-events-none flex flex-col justify-end md:justify-center md:items-center">
            <motion.div
              ref={panelRef}
              role="dialog"
              aria-label={typeof title === 'string' ? title : undefined}
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              drag="y"
              dragControls={dragControls}
              dragListener={false}
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={0.2}
              onDragEnd={(_e, info) => {
                if (info.offset.y > 100 || info.velocity.y > 500) {
                  onClose();
                }
              }}
              className="pointer-events-auto w-full bg-black/80 backdrop-blur-2xl border border-white/10 rounded-t-4xl md:max-w-sm md:rounded-4xl shadow-[0_0_40px_rgba(0,0,0,0.5)] overflow-hidden flex flex-col pb-[env(safe-area-inset-bottom)]"
            >
              <div
                className="w-full flex md:hidden justify-center pt-4 pb-2 cursor-grab active:cursor-grabbing touch-none"
                onPointerDown={(e) => dragControls.start(e)}
              >
                <div className="w-10 h-1.5 bg-white/20 rounded-full" />
              </div>

              <div className="p-4 pt-2 md:pt-4 border-b border-white/10 flex items-center justify-between shrink-0">
                <h2 className="text-lg font-bold text-white">{title}</h2>
                <Button
                  onClick={onClose}
                  variant="ghost"
                  size="icon"
                  aria-label={t('common.close')}
                  className="text-white hover:bg-white/10 rounded-full"
                >
                  <X size={20} />
                </Button>
              </div>

              {children}
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}
