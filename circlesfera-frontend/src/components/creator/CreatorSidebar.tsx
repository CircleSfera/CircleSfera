import { clsx } from 'clsx';
import { motion } from 'framer-motion';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import logoSrc from '../../assets/logo.png';
import { CREATOR_NAV_GROUPS, type CreatorTab } from './creatorNav';

interface Props {
  activeTab: CreatorTab;
  onTabChange: (tab: CreatorTab) => void;
}

export default function CreatorSidebar({ activeTab, onTabChange }: Props) {
  const { t } = useTranslation();

  return (
    <aside className="hidden lg:flex w-64 xl:w-72 flex-col h-[calc(100vh-5.5rem)] sticky top-6 overflow-hidden z-20 bg-black/40 backdrop-blur-2xl border border-white/10 rounded-2xl p-3 xl:p-4 shadow-2xl">
      <div className="px-2 mb-4 space-y-2.5 pb-3 border-b border-white/10">
        <Link to="/" className="block">
          <img src={logoSrc} alt="CircleSfera" className="h-7 w-auto" />
        </Link>
        <Link
          to="/"
          className="flex items-center gap-2 text-xs font-semibold text-gray-400 hover:text-white transition-colors group"
        >
          <ArrowLeft
            size={13}
            className="group-hover:-translate-x-1 transition-transform text-brand-primary"
          />
          <span>{t('creator.back_to_app', 'Volver a CircleSfera')}</span>
        </Link>
      </div>

      <div className="flex-1 overflow-y-auto space-y-5 pr-1 custom-scrollbar">
        {CREATOR_NAV_GROUPS.map((group) => (
          <div key={group.labelKey} className="space-y-1">
            <h3 className="px-3 text-xs font-semibold uppercase tracking-wider text-gray-500 flex items-center gap-2 mb-1.5">
              <group.icon size={12} className="text-brand-primary opacity-80" />
              <span>{t(group.labelKey, group.labelFallback)}</span>
            </h3>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const isSelected = activeTab === item.id;
                const ItemIcon = item.icon;
                return (
                  <button
                    type="button"
                    key={item.id}
                    onClick={() => onTabChange(item.id)}
                    className={clsx(
                      'w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-semibold transition-all relative group border text-left min-h-10',
                      isSelected
                        ? 'bg-linear-to-r from-brand-primary/20 via-brand-primary/10 to-transparent text-white border-brand-primary/30'
                        : 'bg-transparent text-gray-400 border-transparent hover:bg-white/5 hover:text-white hover:border-white/5',
                    )}
                  >
                    <div className="flex items-center gap-2.5 relative z-10">
                      <ItemIcon
                        size={16}
                        className={clsx(
                          'transition-colors',
                          isSelected
                            ? 'text-brand-primary'
                            : 'text-gray-400 group-hover:text-white',
                        )}
                      />
                      <span>{t(item.labelKey, item.labelFallback)}</span>
                    </div>

                    <div className="flex items-center gap-2 relative z-10">
                      {item.badge && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-brand-primary/20 text-brand-primary border border-brand-primary/30">
                          {item.badge}
                        </span>
                      )}
                      {isSelected && (
                        <motion.div layoutId="creator-sidebar-active-indicator">
                          <ChevronRight
                            size={14}
                            className="text-brand-primary"
                          />
                        </motion.div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}

export type { CreatorTab } from './creatorNav';
