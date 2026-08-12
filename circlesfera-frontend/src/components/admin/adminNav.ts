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
  LifeBuoy,
  type LucideIcon,
  Mail,
  Megaphone,
  MessageCircle,
  Music,
  Radio,
  Scale,
  ScrollText,
  Settings,
  Shield,
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
  | 'payouts'
  | 'promotions'
  | 'moderation'
  | 'firewall'
  | 'newsletter'
  | 'experiments'
  | 'system-health'
  | 'appeals'
  | 'support'
  | 'roles'
  | 'trust'
  | 'live'
  | 'settings';

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

export const ADMIN_TAB_ROLES: Record<AdminTab, string[] | undefined> = {
  analytics: undefined, // ADMIN only
  monetization: ['ADMIN', 'FINANCE'],
  payouts: ['ADMIN', 'FINANCE'],
  promotions: ['ADMIN', 'FINANCE'],
  verification: ['ADMIN', 'SUPPORT'],
  whitelist: undefined,
  newsletter: undefined,
  users: ['ADMIN', 'MODERATOR', 'SUPPORT', 'FINANCE'],
  moderation: ['ADMIN', 'MODERATOR'],
  firewall: undefined,
  posts: ['ADMIN', 'MODERATOR'],
  stories: ['ADMIN', 'MODERATOR'],
  live: ['ADMIN', 'MODERATOR'],
  comments: ['ADMIN', 'MODERATOR'],
  hashtags: ['ADMIN', 'MODERATOR'],
  audio: ['ADMIN', 'MODERATOR'],
  'system-health': undefined,
  settings: ['ADMIN'], // Only ADMIN can change global settings
  trust: ['ADMIN', 'MODERATOR', 'SUPPORT'],
  experiments: undefined,
  reports: ['ADMIN', 'MODERATOR'],
  audit: ['ADMIN', 'MODERATOR'],
  roles: ['ADMIN'], // Only ADMIN can manage roles
  appeals: ['ADMIN', 'MODERATOR', 'SUPPORT'],
  support: ['ADMIN', 'MODERATOR', 'SUPPORT'],
};

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
        id: 'payouts',
        labelKey: 'admin.nav.payouts',
        labelFallback: 'Retiros (Stripe)',
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
        id: 'live',
        labelKey: 'admin.nav.live',
        labelFallback: 'Live',
        icon: Radio,
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
        id: 'settings',
        labelKey: 'admin.nav.settings',
        labelFallback: 'Configuración Global',
        icon: Settings,
      },
      {
        id: 'roles',
        labelKey: 'admin.nav.roles',
        labelFallback: 'Roles y Accesos',
        icon: ShieldAlert,
      },
      {
        id: 'trust',
        labelKey: 'admin.nav.trust',
        labelFallback: 'Confianza',
        icon: Shield,
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
      {
        id: 'appeals',
        labelKey: 'admin.nav.appeals',
        labelFallback: 'Apelaciones',
        icon: Scale,
      },
      {
        id: 'support',
        labelKey: 'admin.nav.support',
        labelFallback: 'Soporte',
        icon: LifeBuoy,
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

export const ADMIN_TAB_IDS: AdminTab[] = ADMIN_NAV_ITEMS.map((i) => i.id);

export function isAdminTab(tab: string | undefined): tab is AdminTab {
  return !!tab && (ADMIN_TAB_IDS as string[]).includes(tab);
}
