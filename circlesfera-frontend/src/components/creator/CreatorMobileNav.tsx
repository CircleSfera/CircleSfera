import { clsx } from 'clsx';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import logoSrc from '../../assets/logo.png';
import { CREATOR_NAV_GROUPS, type CreatorTab } from './creatorNav';

interface Props {
  activeTab: CreatorTab;
  onTabChange: (tab: CreatorTab) => void;
  isOpen: boolean;
  onClose: () => void;
}

/** Left drawer navigation for mobile (< lg). */
export function CreatorMobileDrawer({
  activeTab,
  onTabChange,
  isOpen,
  onClose,
}: Props) {
  const { t } = useTranslation();

  const handleSelect = (tab: CreatorTab) => {
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
              {t('creator.back_to_app', 'Volver a CircleSfera')}
            </Link>

            <nav className="flex-1 overflow-y-auto custom-scrollbar px-3 py-2 space-y-5 pb-8">
              {CREATOR_NAV_GROUPS.map((group) => (
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
                          {item.badge && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-brand-primary/20 text-brand-primary border border-brand-primary/30">
                              {item.badge}
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
