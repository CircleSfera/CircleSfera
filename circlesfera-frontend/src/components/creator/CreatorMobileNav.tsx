import { clsx } from 'clsx';
import { X } from 'lucide-react';
import { type TransitionEvent, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink } from 'react-router-dom';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { CREATOR_NAV_GROUPS } from './creatorNav';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

// Studio sections on a phone: the same bottom sheet as the staff panel's.
// App chrome (Home, Create, Profile) is BottomNav. Unmounts when closed so it
// cannot peek.
export function CreatorMobileDrawer({ isOpen, onClose }: Props) {
  const { t } = useTranslation();
  const sheetRef = useRef<HTMLDivElement>(null);
  // Keep in DOM while open or exiting so translate can animate.
  const [mounted, setMounted] = useState(isOpen);
  const [entered, setEntered] = useState(false);

  // The sheet is in the page one render after it is asked to open: the trap
  // waits for it, or it would find nothing to hold and never start.
  useFocusTrap(isOpen && mounted, sheetRef, { onEscape: onClose });

  useEffect(() => {
    if (isOpen) {
      setMounted(true);
      const id = requestAnimationFrame(() => {
        requestAnimationFrame(() => setEntered(true));
      });
      return () => cancelAnimationFrame(id);
    }
    setEntered(false);
    // If transform transition is skipped (reduced motion / interrupted), still unmount.
    const timeout = window.setTimeout(() => setMounted(false), 280);
    return () => window.clearTimeout(timeout);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  const handleSheetTransitionEnd = (e: TransitionEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    if (e.propertyName !== 'transform') return;
    if (!isOpen) setMounted(false);
  };

  if (!mounted) return null;

  return (
    <div className="md:hidden" aria-hidden={!isOpen}>
      <button
        type="button"
        tabIndex={isOpen ? 0 : -1}
        aria-label={t('common.close')}
        onClick={onClose}
        className={clsx(
          'fixed inset-0 z-[60] bg-black/70 transition-opacity duration-200 ease-out',
          entered
            ? 'opacity-100 pointer-events-auto'
            : 'opacity-0 pointer-events-none',
        )}
      />
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal={isOpen}
        aria-labelledby="creator-mobile-nav-title"
        tabIndex={-1}
        onTransitionEnd={handleSheetTransitionEnd}
        className={clsx(
          'fixed bottom-0 left-0 right-0 z-[60] flex flex-col outline-none',
          'max-h-[min(85vh,40rem)] border-t border-white/10',
          'rounded-t-2xl shadow-2xl pb-[env(safe-area-inset-bottom)]',
          'bg-surface-raised',
          'transition-transform duration-200 ease-out will-change-transform',
          entered
            ? 'translate-y-0'
            : 'translate-y-[calc(100%+1.5rem)] pointer-events-none',
        )}
      >
        <div className="flex justify-center pt-2.5 pb-1 shrink-0" aria-hidden>
          <div className="w-10 h-1 rounded-full bg-white/20" />
        </div>

        <div className="px-4 pb-3 border-b border-white/10 flex items-start justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <h2
              id="creator-mobile-nav-title"
              className="text-base font-bold text-white tracking-tight"
            >
              {t('creator.mobile_nav_title')}
            </h2>
            <p className="text-xs text-white/40 mt-0.5">
              {t('creator.mobile_nav_subtitle')}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-11 h-11 flex items-center justify-center text-white/50 hover:text-white rounded-xl hover:bg-white/5 shrink-0"
            aria-label={t('common.close')}
          >
            <X size={20} />
          </button>
        </div>

        <nav
          aria-label={t('creator.nav_label')}
          className="flex-1 overflow-y-auto px-4 py-3 custom-scrollbar space-y-4"
        >
          {CREATOR_NAV_GROUPS.map((group) => (
            <div key={group.labelKey} className="space-y-1.5">
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-white/40 px-1 mb-2">
                {t(group.labelKey)}
              </h3>
              <div className="grid grid-cols-2 gap-2">
                {group.items.map((item) => {
                  const ItemIcon = item.icon;
                  return (
                    <NavLink
                      key={item.id}
                      to={`/creator/${item.id}`}
                      onClick={onClose}
                      className={({ isActive }) =>
                        clsx(
                          'w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-semibold border text-left min-h-11 min-w-0',
                          isActive
                            ? 'bg-brand-primary/20 text-white border-brand-primary/40'
                            : 'bg-white/3 text-white/70 border-white/5',
                        )
                      }
                    >
                      {({ isActive }) => (
                        <>
                          <ItemIcon
                            size={18}
                            className={clsx(
                              'shrink-0',
                              isActive
                                ? 'text-brand-primary-text'
                                : 'text-white/50',
                            )}
                            aria-hidden
                          />
                          <span className="truncate">{t(item.labelKey)}</span>
                        </>
                      )}
                    </NavLink>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </div>
    </div>
  );
}
