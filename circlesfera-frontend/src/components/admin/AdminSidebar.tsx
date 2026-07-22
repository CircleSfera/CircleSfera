import { clsx } from 'clsx';
import { motion } from 'framer-motion';
import {
  Activity,
  ArrowLeft,
  ChevronRight,
  Clock,
  DollarSign,
  Flag,
  FlaskConical,
  FolderTree,
  Hash,
  ImageIcon,
  LayoutDashboard,
  Mail,
  Megaphone,
  MessageCircle,
  Music,
  ScrollText,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import logoSrc from '../../assets/logo.png';

export type AdminTab =
  | 'analytics'
  | 'reports'
  | 'users'
  | 'posts'
  | 'comments'
  | 'hashtags'
  | 'audit'
  | 'stories'
  | 'audio'
  | 'whitelist'
  | 'verification'
  | 'monetization'
  | 'promotions'
  | 'moderation'
  | 'firewall'
  | 'newsletter'
  | 'experiments'
  | 'system-health';

interface SearchGroup {
  label: string;
  icon: React.ElementType;
  items: {
    id: AdminTab;
    label: string;
    icon: React.ElementType;
    badge?: string;
  }[];
}

const GROUPS: SearchGroup[] = [
  {
    label: 'Dashboard',
    icon: LayoutDashboard,
    items: [
      { id: 'analytics', label: 'Estadísticas', icon: LayoutDashboard },
      { id: 'monetization', label: 'Monetización', icon: DollarSign },
      { id: 'promotions', label: 'Promociones', icon: Megaphone },
      { id: 'verification', label: 'Verificación', icon: ShieldCheck },
      { id: 'whitelist', label: 'Whitelist', icon: ShieldAlert },
      { id: 'newsletter', label: 'Newsletter', icon: Mail },
    ],
  },
  {
    label: 'Moderación',
    icon: ShieldAlert,
    items: [
      { id: 'users', label: 'Usuarios', icon: Users },
      { id: 'moderation', label: 'Cola AI', icon: ShieldAlert, badge: 'AI' },
      { id: 'firewall', label: 'Escudo AI', icon: ShieldCheck },
      { id: 'posts', label: 'Publicaciones', icon: ImageIcon },
      { id: 'stories', label: 'Historias', icon: Clock },
      { id: 'comments', label: 'Comentarios', icon: MessageCircle },
    ],
  },
  {
    label: 'Contenido',
    icon: FolderTree,
    items: [
      { id: 'hashtags', label: 'Hashtags', icon: Hash },
      { id: 'audio', label: 'Música', icon: Music },
    ],
  },
  {
    label: 'Sistema',
    icon: Settings,
    items: [
      { id: 'system-health', label: 'Estado', icon: Activity },
      { id: 'experiments', label: 'Experimentos', icon: FlaskConical },
      { id: 'reports', label: 'Reportes', icon: Flag },
      { id: 'audit', label: 'Audit Log', icon: ScrollText },
    ],
  },
];

interface Props {
  activeTab: AdminTab;
  onTabChange: (tab: AdminTab) => void;
}

export default function AdminSidebar({ activeTab, onTabChange }: Props) {
  return (
    <aside className="hidden lg:flex w-72 flex-col h-[calc(100vh-5rem)] sticky top-6 overflow-hidden z-20 bg-black/40 backdrop-blur-2xl border border-white/10 rounded-2xl p-4 shadow-2xl">
      {/* Brand Header & Back to App */}
      <div className="px-2 mb-6 space-y-3 pb-4 border-b border-white/10">
        <div className="flex items-center justify-between">
          <Link to="/" className="block">
            <img src={logoSrc} alt="CircleSfera" className="h-7 w-auto" />
          </Link>
          <span className="text-[10px] font-black tracking-widest text-brand-primary uppercase px-2 py-0.5 bg-brand-primary/10 border border-brand-primary/20 rounded-md">
            v2.4
          </span>
        </div>
        <Link
          to="/"
          className="flex items-center gap-2 text-xs font-bold text-gray-400 hover:text-white transition-colors group"
        >
          <ArrowLeft
            size={13}
            className="group-hover:-translate-x-1 transition-transform text-brand-primary"
          />
          <span>Volver a CircleSfera</span>
        </Link>
      </div>

      {/* Categories Navigation list */}
      <div className="flex-1 overflow-y-auto space-y-6 pr-1 custom-scrollbar">
        {GROUPS.map((group) => (
          <div key={group.label} className="space-y-1.5">
            <h3 className="px-3 text-[11px] font-black uppercase tracking-wider text-gray-400 flex items-center gap-2 mb-2">
              <group.icon size={13} className="text-brand-primary opacity-80" />
              <span>{group.label}</span>
            </h3>
            <div className="space-y-1">
              {group.items.map((item) => {
                const isSelected = activeTab === item.id;
                const ItemIcon = item.icon;
                return (
                  <button
                    type="button"
                    key={item.id}
                    onClick={() => onTabChange(item.id)}
                    className={clsx(
                      'w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all relative group border text-left',
                      isSelected
                        ? 'bg-linear-to-r from-brand-primary/20 via-brand-primary/10 to-transparent text-white border-brand-primary/30 shadow-[0_0_15px_rgba(var(--brand-primary),0.15)]'
                        : 'bg-transparent text-gray-400 border-transparent hover:bg-white/5 hover:text-white hover:border-white/5',
                    )}
                  >
                    <div className="flex items-center gap-3 relative z-10">
                      <ItemIcon
                        size={16}
                        className={clsx(
                          'transition-colors',
                          isSelected
                            ? 'text-brand-primary'
                            : 'text-gray-400 group-hover:text-white',
                        )}
                      />
                      <span>{item.label}</span>
                    </div>

                    <div className="flex items-center gap-2 relative z-10">
                      {item.badge && (
                        <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-brand-primary/20 text-brand-primary border border-brand-primary/30">
                          {item.badge}
                        </span>
                      )}
                      {isSelected && (
                        <motion.div layoutId="sidebar-active-indicator">
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

      {/* System Status Footer Card */}
      <div className="pt-4 mt-4 border-t border-white/10">
        <div className="p-3.5 bg-linear-to-br from-brand-primary/10 via-black/40 to-transparent rounded-xl border border-white/10 relative overflow-hidden">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">
              Estado de Servidores
            </span>
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
            </span>
          </div>
          <p className="text-xs text-white font-black">
            Todos los nodos activos
          </p>
        </div>
      </div>
    </aside>
  );
}
