import { clsx } from 'clsx';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  BarChart3,
  ChevronRight,
  Clock,
  DollarSign,
  ImageIcon,
  LayoutDashboard,
  Megaphone,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import logoSrc from '../../assets/logo.png';

export type CreatorTab =
  | 'overview'
  | 'content'
  | 'stories'
  | 'finance'
  | 'ads'
  | 'monetization'
  | 'analytics';

interface NavGroup {
  label: string;
  icon: React.ElementType;
  items: { id: CreatorTab; label: string; icon: React.ElementType }[];
}

const GROUPS: NavGroup[] = [
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
    icon: ImageIcon,
    items: [
      { id: 'content', label: 'Publicaciones', icon: ImageIcon },
      { id: 'stories', label: 'Historias', icon: Clock },
    ],
  },
];

interface Props {
  activeTab: CreatorTab;
  onTabChange: (tab: CreatorTab) => void;
}

export default function CreatorSidebar({ activeTab, onTabChange }: Props) {
  return (
    <aside className="w-full lg:w-64 flex flex-col lg:h-[calc(100vh-5rem)] lg:sticky lg:top-6 overflow-hidden z-20">
      {/* Brand & Back Link */}
      <div className="hidden lg:block px-3 mb-8 space-y-3">
        <Link to="/" className="block">
          <img src={logoSrc} alt="CircleSfera" className="h-7 w-auto" />
        </Link>
        <Link
          to="/"
          className="flex items-center gap-2 text-[10px] font-bold text-zinc-500 hover:text-white transition-colors group"
        >
          <ArrowLeft
            size={12}
            className="group-hover:-translate-x-1 transition-transform"
          />
          Volver a la App
        </Link>
      </div>

      <div className="flex lg:flex-col overflow-x-auto lg:overflow-y-auto space-x-2 lg:space-x-0 lg:space-y-4 pb-4 lg:pb-0 lg:pr-2 no-scrollbar snap-x">
        {GROUPS.map((group) => (
          <div
            key={group.label}
            className="flex lg:flex-col items-center lg:items-stretch lg:space-y-1.5 snap-start shrink-0"
          >
            <h3 className="hidden lg:flex px-3 text-[9px] font-black uppercase tracking-[0.2em] text-white/40 items-center gap-2 mb-1">
              <group.icon size={11} className="opacity-50" />
              {group.label}
            </h3>
            <div className="flex lg:flex-col gap-2 lg:gap-1">
              {group.items.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  onClick={() => onTabChange(item.id)}
                  className={clsx(
                    'flex items-center justify-center lg:justify-between px-4 py-2.5 lg:px-3 lg:py-2.5 rounded-full lg:rounded-xl text-[12px] lg:text-[13px] font-bold transition-all group whitespace-nowrap border',
                    activeTab === item.id
                      ? 'bg-white/10 text-white border-white/20 shadow-lg'
                      : 'bg-white/5 text-white/50 border-white/5 hover:bg-white/10 hover:text-white',
                  )}
                >
                  <div className="flex items-center gap-2">
                    <item.icon
                      size={16}
                      className={clsx(
                        'transition-colors',
                        activeTab === item.id
                          ? 'text-white'
                          : 'text-white/40 group-hover:text-white/80',
                      )}
                    />
                    <span>{item.label}</span>
                  </div>
                  {activeTab === item.id && (
                    <motion.div
                      layoutId="active-indicator"
                      className="hidden lg:block ml-2"
                    >
                      <ChevronRight size={14} className="text-white/50" />
                    </motion.div>
                  )}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Status Panel (Matching Admin) */}
      <div className="hidden lg:block pt-4 mt-4 border-t border-white/5">
        <div className="p-4 glass-panel rounded-2xl border border-white/5 bg-linear-to-br from-brand-primary/5 to-transparent">
          <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mb-1">
            Status
          </p>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-xs text-white font-bold">
              Modo Creador Activo
            </span>
          </div>
        </div>
      </div>
    </aside>
  );
}
