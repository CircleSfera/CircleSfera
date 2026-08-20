import { useQuery } from '@tanstack/react-query';
import { clsx } from 'clsx';
import { X } from 'lucide-react';
import {
  type TransitionEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { adminApi } from '../../services/admin.service';
import { useAdminAuthStore } from '../../stores/adminAuthStore';
import {
  ADMIN_NAV_GROUPS,
  ADMIN_TAB_PERMISSIONS,
  type AdminTab,
} from './adminNav';

interface Props {
  activeTab: AdminTab;
  onTabChange: (tab: AdminTab) => void;
  isOpen: boolean;
  onClose: () => void;
}

/** Bottom sheet navigation for mobile (< lg). Unmounts when closed so it cannot peek. */
export function AdminMobileDrawer({
  activeTab,
  onTabChange,
  isOpen,
  onClose,
}: Props) {
  const { t } = useTranslation();
  const sheetRef = useRef<HTMLDivElement>(null);
  const hasPermission = useAdminAuthStore((s) => s.hasPermission);
  /** Keep in DOM while open or exiting so translate can animate. */
  const [mounted, setMounted] = useState(isOpen);
  const [entered, setEntered] = useState(false);

  useFocusTrap(isOpen, sheetRef, { onEscape: onClose });

  const { data: trustQueue } = useQuery({
    queryKey: ['admin', 'trust-queue'],
    queryFn: () => adminApi.getTrustQueue().then((r) => r.data),
    refetchInterval: 60_000,
    staleTime: 30_000,
    enabled: mounted,
  });

  const trustBadgeTotal =
    (trustQueue?.counts.reports ?? 0) +
    (trustQueue?.counts.appeals ?? 0) +
    (trustQueue?.counts.tickets ?? 0);

  const badgeById = useMemo(() => {
    const map = new Map<AdminTab, string | undefined>();
    for (const group of ADMIN_NAV_GROUPS) {
      for (const item of group.items) {
        if (item.id === 'trust' && trustBadgeTotal > 0) {
          map.set(item.id, String(trustBadgeTotal));
        } else if (item.id === 'reports' && trustQueue?.counts?.reports) {
          map.set(item.id, String(trustQueue.counts.reports));
        } else if (item.id === 'appeals' && trustQueue?.counts?.appeals) {
          map.set(item.id, String(trustQueue.counts.appeals));
        } else if (item.id === 'support' && trustQueue?.counts?.tickets) {
          map.set(item.id, String(trustQueue.counts.tickets));
        } else {
          map.set(item.id, item.badge);
        }
      }
    }
    return map;
  }, [trustBadgeTotal, trustQueue]);

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

  const handleSelect = (tab: AdminTab) => {
    onTabChange(tab);
    onClose();
  };

  const handleSheetTransitionEnd = (e: TransitionEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    if (e.propertyName !== 'transform') return;
    if (!isOpen) setMounted(false);
  };

  if (!mounted) return null;

  return (
    <div className="lg:hidden" aria-hidden={!isOpen}>
      <button
        type="button"
        tabIndex={isOpen ? 0 : -1}
        aria-label={t('common.close', 'Cerrar')}
        onClick={onClose}
        className={clsx(
          'fixed inset-0 z-50 bg-black/70 transition-opacity duration-200 ease-out',
          entered
            ? 'opacity-100 pointer-events-auto'
            : 'opacity-0 pointer-events-none',
        )}
      />
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal={isOpen}
        aria-labelledby="admin-mobile-nav-title"
        tabIndex={-1}
        onTransitionEnd={handleSheetTransitionEnd}
        className={clsx(
          'fixed bottom-0 left-0 right-0 z-50 flex flex-col outline-none',
          'max-h-[min(85vh,40rem)] border-t border-white/10',
          'rounded-t-2xl shadow-2xl pb-[env(safe-area-inset-bottom)]',
          // Solid elevated surface — avoid glass backdrop-filter bleed under the fold on iOS.
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
              id="admin-mobile-nav-title"
              className="text-base font-bold text-white tracking-tight"
            >
              {t('admin.mobile_nav_title', 'Navegación')}
            </h2>
            <p className="text-xs text-white/40 mt-0.5">
              {t('admin.mobile_nav_subtitle', 'Elige una sección')}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-11 h-11 flex items-center justify-center text-white/50 hover:text-white rounded-xl hover:bg-white/5 shrink-0"
            aria-label={t('common.close', 'Cerrar')}
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 custom-scrollbar space-y-4">
          {ADMIN_NAV_GROUPS.map((group) => {
            const visibleItems = group.items.filter((item) => {
              return hasPermission(ADMIN_TAB_PERMISSIONS[item.id]);
            });

            if (visibleItems.length === 0) return null;

            return (
              <div key={group.labelKey} className="space-y-1.5">
                <h3 className="text-[11px] font-bold uppercase tracking-wider text-white/40 px-1 mb-2">
                  {t(group.labelKey, group.labelFallback)}
                </h3>
                <div className="grid grid-cols-2 gap-2">
                  {visibleItems.map((item) => {
                    const isSelected = activeTab === item.id;
                    const ItemIcon = item.icon;
                    const badge = badgeById.get(item.id);
                    return (
                      <button
                        type="button"
                        key={item.id}
                        onClick={() => handleSelect(item.id)}
                        className={clsx(
                          'w-full flex items-center justify-between px-3 py-3 rounded-xl text-sm font-semibold border text-left min-h-11',
                          isSelected
                            ? 'bg-brand-primary/20 text-white border-brand-primary/40'
                            : 'bg-white/3 text-white/70 border-white/5',
                        )}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <ItemIcon
                            size={18}
                            className={
                              isSelected
                                ? 'text-brand-primary'
                                : 'text-white/50'
                            }
                          />
                          <span className="truncate">
                            {t(item.labelKey, item.labelFallback)}
                          </span>
                        </div>
                        {badge && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-brand-primary/20 text-brand-primary border border-brand-primary/30 shrink-0">
                            {badge}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
