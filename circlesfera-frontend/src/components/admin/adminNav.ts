import {
  Activity,
  Clock,
  DollarSign,
  Flag,
  FlaskConical,
  FolderTree,
  Hash,
  ImageIcon,
  LayoutDashboard,
  type LucideIcon,
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

export interface AdminNavItem {
  id: AdminTab;
  labelKey: string;
  labelFallback: string;
  icon: LucideIcon;
  badge?: string;
}

export interface AdminNavGroup {
  labelKey: string;
  labelFallback: string;
  icon: LucideIcon;
  items: AdminNavItem[];
}

export const ADMIN_NAV_GROUPS: AdminNavGroup[] = [
  {
    labelKey: 'admin.nav.dashboard',
    labelFallback: 'Dashboard',
    icon: LayoutDashboard,
    items: [
      {
        id: 'analytics',
        labelKey: 'admin.nav.analytics',
        labelFallback: 'Estadísticas',
        icon: LayoutDashboard,
      },
      {
        id: 'monetization',
        labelKey: 'admin.nav.monetization',
        labelFallback: 'Monetización',
        icon: DollarSign,
      },
      {
        id: 'promotions',
        labelKey: 'admin.nav.promotions',
        labelFallback: 'Promociones',
        icon: Megaphone,
      },
      {
        id: 'verification',
        labelKey: 'admin.nav.verification',
        labelFallback: 'Verificación',
        icon: ShieldCheck,
      },
      {
        id: 'whitelist',
        labelKey: 'admin.nav.whitelist',
        labelFallback: 'Whitelist',
        icon: ShieldAlert,
      },
      {
        id: 'newsletter',
        labelKey: 'admin.nav.newsletter',
        labelFallback: 'Newsletter',
        icon: Mail,
      },
    ],
  },
  {
    labelKey: 'admin.nav.moderation',
    labelFallback: 'Moderación',
    icon: ShieldAlert,
    items: [
      {
        id: 'users',
        labelKey: 'admin.nav.users',
        labelFallback: 'Usuarios',
        icon: Users,
      },
      {
        id: 'moderation',
        labelKey: 'admin.nav.ai_queue',
        labelFallback: 'Cola AI',
        icon: ShieldAlert,
        badge: 'AI',
      },
      {
        id: 'firewall',
        labelKey: 'admin.nav.firewall',
        labelFallback: 'Escudo AI',
        icon: ShieldCheck,
      },
      {
        id: 'posts',
        labelKey: 'admin.nav.posts',
        labelFallback: 'Publicaciones',
        icon: ImageIcon,
      },
      {
        id: 'stories',
        labelKey: 'admin.nav.stories',
        labelFallback: 'Historias',
        icon: Clock,
      },
      {
        id: 'comments',
        labelKey: 'admin.nav.comments',
        labelFallback: 'Comentarios',
        icon: MessageCircle,
      },
    ],
  },
  {
    labelKey: 'admin.nav.content',
    labelFallback: 'Contenido',
    icon: FolderTree,
    items: [
      {
        id: 'hashtags',
        labelKey: 'admin.nav.hashtags',
        labelFallback: 'Hashtags',
        icon: Hash,
      },
      {
        id: 'audio',
        labelKey: 'admin.nav.audio',
        labelFallback: 'Música',
        icon: Music,
      },
    ],
  },
  {
    labelKey: 'admin.nav.system',
    labelFallback: 'Sistema',
    icon: Settings,
    items: [
      {
        id: 'system-health',
        labelKey: 'admin.nav.system_health',
        labelFallback: 'Estado',
        icon: Activity,
      },
      {
        id: 'experiments',
        labelKey: 'admin.nav.experiments',
        labelFallback: 'Experimentos',
        icon: FlaskConical,
      },
      {
        id: 'reports',
        labelKey: 'admin.nav.reports',
        labelFallback: 'Reportes',
        icon: Flag,
      },
      {
        id: 'audit',
        labelKey: 'admin.nav.audit',
        labelFallback: 'Audit Log',
        icon: ScrollText,
      },
    ],
  },
];

export const ADMIN_NAV_ITEMS: AdminNavItem[] = ADMIN_NAV_GROUPS.flatMap(
  (g) => g.items,
);

export function findAdminNavItem(tab: AdminTab): AdminNavItem | undefined {
  return ADMIN_NAV_ITEMS.find((i) => i.id === tab);
}
