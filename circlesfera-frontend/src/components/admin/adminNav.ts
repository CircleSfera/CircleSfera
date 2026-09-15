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
  icon: LucideIcon;
  badge?: string;
}

export interface AdminNavGroup {
  labelKey: string;
  icon: LucideIcon;
  items: AdminNavItem[];
}

// Admin Panel permission required per tab.
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
    icon: LayoutDashboard,
    items: [
      {
        id: 'trust',
        labelKey: 'admin.nav.trust',
        icon: Shield,
      },
      {
        id: 'analytics',
        labelKey: 'admin.nav.analytics',
        icon: LayoutDashboard,
      },
      {
        id: 'monetization',
        labelKey: 'admin.nav.monetization',
        icon: DollarSign,
      },
      {
        id: 'payouts',
        labelKey: 'admin.nav.payouts',
        icon: DollarSign,
      },
      {
        id: 'promotions',
        labelKey: 'admin.nav.promotions',
        icon: Megaphone,
      },
      {
        id: 'verification',
        labelKey: 'admin.nav.verification',
        icon: ShieldCheck,
      },
      {
        id: 'whitelist',
        labelKey: 'admin.nav.whitelist',
        icon: ShieldAlert,
      },
      {
        id: 'newsletter',
        labelKey: 'admin.nav.newsletter',
        icon: Mail,
      },
    ],
  },
  {
    labelKey: 'admin.nav.moderation',
    icon: ShieldAlert,
    items: [
      {
        id: 'users',
        labelKey: 'admin.nav.users',
        icon: Users,
      },
      {
        id: 'moderation',
        labelKey: 'admin.nav.ai_queue',
        icon: ShieldAlert,
        badge: 'AI',
      },
      {
        id: 'firewall',
        labelKey: 'admin.nav.firewall',
        icon: ShieldCheck,
      },
      {
        id: 'posts',
        labelKey: 'admin.nav.posts',
        icon: ImageIcon,
      },
      {
        id: 'stories',
        labelKey: 'admin.nav.stories',
        icon: Clock,
      },
      {
        id: 'live',
        labelKey: 'admin.nav.live',
        icon: Radio,
      },
      {
        id: 'comments',
        labelKey: 'admin.nav.comments',
        icon: MessageCircle,
      },
    ],
  },
  {
    labelKey: 'admin.nav.content',
    icon: FolderTree,
    items: [
      {
        id: 'hashtags',
        labelKey: 'admin.nav.hashtags',
        icon: Hash,
      },
      {
        id: 'audio',
        labelKey: 'admin.nav.audio',
        icon: Music,
      },
    ],
  },
  {
    labelKey: 'admin.nav.system',
    icon: Settings,
    items: [
      {
        id: 'system-health',
        labelKey: 'admin.nav.system_health',
        icon: Activity,
      },
      {
        id: 'settings',
        labelKey: 'admin.nav.settings',
        icon: Settings,
      },
      {
        id: 'roles',
        labelKey: 'admin.nav.operators',
        icon: ShieldAlert,
      },
      {
        id: 'experiments',
        labelKey: 'admin.nav.experiments',
        icon: FlaskConical,
      },
      {
        id: 'reports',
        labelKey: 'admin.nav.reports',
        icon: Flag,
      },
      {
        id: 'audit',
        labelKey: 'admin.nav.audit',
        icon: ScrollText,
      },
      {
        id: 'appeals',
        labelKey: 'admin.nav.appeals',
        icon: Scale,
      },
      {
        id: 'support',
        labelKey: 'admin.nav.support',
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

// SPA path for a tab on the Admin Panel host (no /admin prefix).
export function adminTabPath(tab: AdminTab, query = ''): string {
  return `/${tab}${query}`;
}

// Post-login / index home: Trust when permitted, else first nav tab the
// Operator can open, else analytics.
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
