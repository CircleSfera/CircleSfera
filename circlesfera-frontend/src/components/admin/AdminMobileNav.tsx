import { useQuery } from '@tanstack/react-query';
import { clsx } from 'clsx';
import { ArrowLeft, X } from 'lucide-react';
import { useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { adminApi } from '../../services/admin.service';
import { ADMIN_NAV_GROUPS, type AdminTab } from './adminNav';
import { useFocusTrap } from './useFocusTrap';

interface Props {
  activeTab: AdminTab;
  onTabChange: (tab: AdminTab) => void;
  isOpen: boolean;
  onClose: () => void;
}

/** Bottom sheet navigation for mobile (< lg). CSS transforms — no blur/spring jank. */
export function AdminMobileDrawer({
  activeTab,
  onTabChange,
  isOpen,
  onClose,
}: Props) {
  const { t } = useTranslation();
  const sheetRef = useRef<HTMLDivElement>(null);

  useFocusTrap(isOpen, sheetRef, { onEscape: onClose });

  const { data: trustQueue } = useQuery({
    queryKey: ['admin', 'trust-queue'],
    queryFn: () => adminApi.getTrustQueue().then((r) => r.data),
    refetchInterval: 60_000,
    staleTime: 30_000,
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
        } else {
          map.set(item.id, item.badge);
        }
      }
    }
    return map;
  }, [trustBadgeTotal]);

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

  return (
    <div className="lg:hidden" aria-hidden={!isOpen}>
      <button
        type="button"
        tabIndex={isOpen ? 0 : -1}
        aria-label={t('common.close', 'Cerrar')}
        onClick={onClose}
        className={clsx(
          'fixed inset-0 z-50 bg-black/70 transition-opacity duration-200 ease-out',
          isOpen
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
        className={clsx(
          'fixed bottom-0 left-0 right-0 z-50 flex flex-col outline-none',
          'max-h-[min(85vh,40rem)] bg-[rgb(18,18,20)] border-t border-white/10',
          'rounded-t-2xl shadow-2xl pb-[env(safe-area-inset-bottom)]',
          'transition-transform duration-200 ease-out will-change-transform',
          isOpen ? 'translate-y-0' : 'translate-y-full pointer-events-none',
        )}
      >
        <div className="flex justify-center pt-2.5 pb-1 shrink-0" aria-hidden>
          <div className="w-10 h-1 rounded-full bg-white/20" />
        </div>

        <div className="px-4 pb-3 border-b border-white/10 flex items-start justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <h2
              id="admin-mobile-nav-title"
              className="text-base font-semibold text-white tracking-tight"
            >
              {t('admin.panel', 'Panel de Control')}
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {t('admin.mobile_nav_subtitle', 'Elige una sección')}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-11 h-11 flex items-center justify-center text-gray-400 hover:text-white rounded-xl hover:bg-white/5 shrink-0"
            aria-label={t('common.close', 'Cerrar')}
          >
            <X size={20} />
          </button>
        </div>

        <Link
          to="/"
          onClick={onClose}
          className="mx-4 mt-3 mb-1 flex items-center gap-2 text-sm font-semibold text-gray-400 hover:text-white transition-colors shrink-0"
        >
          <ArrowLeft size={14} className="text-brand-primary" />
          {t('admin.back_to_app', 'Volver a CircleSfera')}
        </Link>

        <nav className="flex-1 min-h-0 overflow-y-auto overscroll-contain custom-scrollbar px-3 py-3 space-y-5 pb-6">
          {ADMIN_NAV_GROUPS.map((group) => (
            <div key={group.labelKey} className="space-y-1.5">
              <h3 className="px-2 text-xs font-semibold uppercase tracking-wider text-gray-500 flex items-center gap-2">
                <group.icon size={12} className="text-brand-primary" />
                {t(group.labelKey, group.labelFallback)}
              </h3>
              <div className="space-y-1">
                {group.items.map((item) => {
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
                          : 'bg-white/[0.03] text-gray-300 border-white/5',
                      )}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <ItemIcon
                          size={18}
                          className={
                            isSelected ? 'text-brand-primary' : 'text-gray-400'
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
          ))}
        </nav>
      </div>
    </div>
  );
}
