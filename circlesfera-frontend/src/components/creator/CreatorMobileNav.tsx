import { clsx } from 'clsx';
import { AnimatePresence, motion } from 'framer-motion';
import {
  BarChart3,
  ChevronDown,
  Clock,
  DollarSign,
  FolderTree,
  ImageIcon,
  LayoutDashboard,
  Megaphone,
  X,
} from 'lucide-react';
import { useState } from 'react';
import type { CreatorTab } from './CreatorSidebar';

interface Group {
  label: string;
  icon: React.ElementType;
  items: { id: CreatorTab; label: string; icon: React.ElementType }[];
}

const GROUPS: Group[] = [
  {
    label: 'Dashboard',
    icon: LayoutDashboard,
    items: [
      { id: 'overview', label: 'Resumen', icon: LayoutDashboard },
      { id: 'analytics', label: 'Analíticas', icon: BarChart3 },
      { id: 'finance', label: 'Ingresos', icon: DollarSign },
      { id: 'monetization', label: 'Monetización', icon: DollarSign },
      { id: 'ads', label: 'Publicidad', icon: Megaphone },
    ],
  },
  {
    label: 'Contenido',
    icon: FolderTree,
    items: [
      { id: 'content', label: 'Publicaciones', icon: ImageIcon },
      { id: 'stories', label: 'Historias', icon: Clock },
    ],
  },
];

interface CreatorMobileNavProps {
  activeTab: CreatorTab;
  onTabChange: (tab: CreatorTab) => void;
}

export function CreatorMobileNav({
  activeTab,
  onTabChange,
}: CreatorMobileNavProps) {
  const [isOpen, setIsOpen] = useState(false);

  const activeItem = GROUPS.flatMap((g) => g.items).find(
    (i) => i.id === activeTab,
  );
  const ActiveIcon = activeItem?.icon || LayoutDashboard;

  const handleSelect = (tab: CreatorTab) => {
    onTabChange(tab);
    setIsOpen(false);
  };

  return (
    <div className="lg:hidden mb-4">
      {/* Mobile Bar Trigger */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-3.5 bg-black/60 backdrop-blur-xl border border-white/10 rounded-2xl shadow-lg hover:border-white/20 transition-all"
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-brand-primary/10 border border-brand-primary/20 flex items-center justify-center text-brand-primary">
            <ActiveIcon size={18} />
          </div>
          <div className="text-left">
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
              Sección Creador
            </p>
            <p className="text-sm font-black text-white">
              {activeItem?.label || activeTab}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-bold px-2.5 py-1 bg-white/5 border border-white/10 rounded-full text-gray-300">
            Cambiar
          </span>
          <ChevronDown
            size={18}
            className={clsx(
              'text-gray-400 transition-transform duration-200',
              isOpen && 'rotate-180',
            )}
          />
        </div>
      </button>

      {/* Bottom Sheet Drawer */}
      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsOpen(false)}
              className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md"
            />

            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 250 }}
              className="fixed inset-x-0 bottom-0 z-50 max-h-[85vh] bg-[rgb(18,18,20)] border-t border-white/10 rounded-t-3xl p-5 overflow-y-auto shadow-2xl flex flex-col"
            >
              {/* Header */}
              <div className="flex items-center justify-between pb-4 mb-4 border-b border-white/10">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-brand-primary animate-pulse" />
                  <h2 className="text-base font-black text-white">
                    Creator Studio Navigation
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="p-2 text-gray-400 hover:text-white rounded-full hover:bg-white/5"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Group Items */}
              <div className="space-y-5 pb-6">
                {GROUPS.map((group) => (
                  <div key={group.label} className="space-y-2">
                    <div className="flex items-center gap-2 px-1 text-xs font-black uppercase tracking-wider text-gray-400">
                      <group.icon size={13} className="text-brand-primary" />
                      <span>{group.label}</span>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      {group.items.map((item) => {
                        const ItemIcon = item.icon;
                        const isSelected = activeTab === item.id;
                        return (
                          <button
                            type="button"
                            key={item.id}
                            onClick={() => handleSelect(item.id)}
                            className={clsx(
                              'flex items-center gap-2.5 p-3 rounded-xl text-xs font-bold transition-all border text-left',
                              isSelected
                                ? 'bg-brand-primary/20 text-white border-brand-primary/40 shadow-[0_0_15px_rgba(var(--brand-primary),0.2)]'
                                : 'bg-white/5 text-gray-300 border-white/5 hover:bg-white/10 hover:text-white',
                            )}
                          >
                            <ItemIcon
                              size={16}
                              className={clsx(
                                isSelected
                                  ? 'text-brand-primary'
                                  : 'text-gray-400',
                              )}
                            />
                            <span className="truncate">{item.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
