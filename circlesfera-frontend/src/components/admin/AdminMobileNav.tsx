import { useQuery } from '@tanstack/react-query';
import { clsx } from 'clsx';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, ChevronRight, Menu, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import logoSrc from '../../assets/logo.png';
import { adminApi } from '../../services/admin.service';
import { ADMIN_NAV_GROUPS, type AdminTab, findAdminNavItem } from './adminNav';

interface Props {
  activeTab: AdminTab;
  onTabChange: (tab: AdminTab) => void;
  isOpen: boolean;
  onClose: () => void;
}

/** Left drawer navigation for mobile (< lg). */
export function AdminMobileDrawer({
  activeTab,
  onTabChange,
  isOpen,
  onClose,
}: Props) {
  const { t } = useTranslation();

  const { data: trustQueue } = useQuery({
    queryKey: ['admin', 'trust-queue'],
    queryFn: () => adminApi.getTrustQueue().then((r) => r.data),
    refetchInterval: 60_000,
  });

  const trustBadgeTotal =
    (trustQueue?.counts.reports ?? 0) +
    (trustQueue?.counts.appeals ?? 0) +
    (trustQueue?.counts.tickets ?? 0);

  const getItemBadge = (itemId: AdminTab) => {
    if (itemId === 'trust' && trustBadgeTotal > 0) {
      return String(trustBadgeTotal);
    }
    const item = ADMIN_NAV_GROUPS.flatMap((g) => g.items).find(
      (i) => i.id === itemId,
    );
    return item?.badge;
  };

  const handleSelect = (tab: AdminTab) => {
    onTabChange(tab);
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md lg:hidden"
          />
          <motion.aside
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 280 }}
            className="fixed inset-y-0 left-0 z-50 w-[min(100vw-3rem,20rem)] bg-[rgb(18,18,20)] border-r border-white/10 shadow-2xl flex flex-col lg:hidden pt-[env(safe-area-inset-top)]"
          >
            <div className="px-4 py-4 border-b border-white/10 flex items-center justify-between shrink-0">
              <Link to="/" className="block" onClick={onClose}>
                <img src={logoSrc} alt="CircleSfera" className="h-7 w-auto" />
              </Link>
              <button
                type="button"
                onClick={onClose}
                className="w-11 h-11 flex items-center justify-center text-gray-400 hover:text-white rounded-xl hover:bg-white/5"
                aria-label={t('common.close', 'Cerrar')}
              >
                <X size={20} />
              </button>
            </div>

            <Link
              to="/"
              onClick={onClose}
              className="mx-4 mt-3 mb-2 flex items-center gap-2 text-sm font-semibold text-gray-400 hover:text-white transition-colors"
            >
              <ArrowLeft size={14} className="text-brand-primary" />
              {t('admin.back_to_app', 'Volver a CircleSfera')}
            </Link>

            <nav className="flex-1 overflow-y-auto custom-scrollbar px-3 py-2 space-y-5 pb-8">
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
                      return (
                        <button
                          type="button"
                          key={item.id}
                          onClick={() => handleSelect(item.id)}
                          className={clsx(
                            'w-full flex items-center justify-between px-3 py-3 rounded-xl text-sm font-semibold transition-all border text-left min-h-11',
                            isSelected
                              ? 'bg-brand-primary/20 text-white border-brand-primary/40'
                              : 'bg-transparent text-gray-300 border-transparent hover:bg-white/5 hover:text-white',
                          )}
                        >
                          <div className="flex items-center gap-3">
                            <ItemIcon
                              size={18}
                              className={
                                isSelected
                                  ? 'text-brand-primary'
                                  : 'text-gray-400'
                              }
                            />
                            <span>{t(item.labelKey, item.labelFallback)}</span>
                          </div>
                          {getItemBadge(item.id) && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-brand-primary/20 text-brand-primary border border-brand-primary/30">
                              {getItemBadge(item.id)}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </nav>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

interface MobileHeaderTriggerProps {
  activeTab: AdminTab;
  onOpen: () => void;
}

export function AdminMobileNavTrigger({
  activeTab,
  onOpen,
}: MobileHeaderTriggerProps) {
  const { t } = useTranslation();
  const activeItem = findAdminNavItem(activeTab);
  const ActiveIcon = activeItem?.icon;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="lg:hidden flex items-center gap-2.5 min-h-11 px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-left hover:bg-white/10 transition-colors"
      aria-label={t('admin.open_nav', 'Abrir navegación')}
    >
      <Menu size={18} className="text-gray-300 shrink-0" />
      {ActiveIcon && (
        <ActiveIcon size={16} className="text-brand-primary shrink-0" />
      )}
      <span className="text-sm font-semibold text-white truncate max-w-32">
        {activeItem
          ? t(activeItem.labelKey, activeItem.labelFallback)
          : activeTab}
      </span>
      <ChevronRight size={14} className="text-gray-500 shrink-0 ml-auto" />
    </button>
  );
}
