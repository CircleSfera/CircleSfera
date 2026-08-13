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

/** Admin Panel permission required per tab. */
export const ADMIN_TAB_PERMISSIONS: Record<AdminTab, string> = {
  analytics: 'users.read',
  monetization: 'payments',
  payouts: 'payments',
  promotions: 'content',
  verification: 'users.read',
  whitelist: 'users.write',
  newsletter: 'system',
  users: 'users.read',
  moderation: 'moderation',
  firewall: 'moderation',
  posts: 'content',
  stories: 'content',
  live: 'live',
  comments: 'content',
  hashtags: 'content',
  audio: 'content',
  'system-health': 'system',
  settings: 'system',
  trust: 'reports',
  experiments: 'experiments',
  reports: 'reports',
  audit: 'audit',
  roles: 'admins.manage',
  appeals: 'appeals',
  support: 'support',
};

export const ADMIN_NAV_GROUPS: AdminNavGroup[] = [
  {
    labelKey: 'admin.nav.dashboard',
    labelFallback: 'Dashboard',
    icon: LayoutDashboard,
    items: [
      {
        id: 'trust',
        labelKey: 'admin.nav.trust',
        labelFallback: 'Confianza',
        icon: Shield,
      },
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
        labelKey: 'admin.nav.operators',
        labelFallback: 'Operators',
        icon: ShieldAlert,
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

/** SPA path for a tab on the Admin Panel host (no /admin prefix). */
export function adminTabPath(tab: AdminTab, query = ''): string {
  return `/${tab}${query}`;
}

/**
 * Post-login / index home: Trust when permitted, else first nav tab the
 * operator can open, else analytics.
 */
export function getAdminHomeTab(
  hasPermission: (key: string) => boolean,
): AdminTab {
  if (hasPermission(ADMIN_TAB_PERMISSIONS.trust)) {
    return 'trust';
  }
  for (const group of ADMIN_NAV_GROUPS) {
    for (const item of group.items) {
      if (hasPermission(ADMIN_TAB_PERMISSIONS[item.id])) {
        return item.id;
      }
    }
  }
  return 'analytics';
}
