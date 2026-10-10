import {
  Activity,
  BadgeCheck,
  Bot,
  Briefcase,
  Clock,
  CreditCard,
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
import {
  adminPanelOrigin,
  backofficeOrigin,
  isBackofficeHost,
} from '../../utils/adminPanel';

export type AdminTab =
  | 'overview'
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
  | 'spam-review'
  | 'support'
  | 'plans'
  | 'subscriptions'
  | 'disputes'
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

// Permission required per section. The home of the Backoffice has none of
// its own: see canOpenTab.
export const ADMIN_TAB_PERMISSIONS: Record<
  Exclude<AdminTab, 'overview'>,
  string
> = {
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
  'spam-review': 'users.read',
  support: 'support',
  plans: 'plans',
  subscriptions: 'payments',
  disputes: 'payments',
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
        id: 'spam-review',
        labelKey: 'admin.nav.spam_review',
        icon: Bot,
      },
      {
        id: 'overview',
        labelKey: 'backoffice.nav.overview',
        icon: LayoutDashboard,
      },
      {
        id: 'support',
        labelKey: 'admin.nav.support',
        icon: LifeBuoy,
      },
      {
        id: 'plans',
        labelKey: 'admin.nav.plans',
        icon: BadgeCheck,
      },
      {
        id: 'subscriptions',
        labelKey: 'admin.nav.subscriptions',
        icon: CreditCard,
      },
      {
        id: 'disputes',
        labelKey: 'admin.nav.disputes',
        icon: ShieldAlert,
      },
    ],
  },
];

// The two staff sites. The sections that run the business live in the
// Backoffice; the ones that protect the community and run the platform live
// in the Admin Panel. A section lives in one site only.
export type StaffSite = 'admin' | 'backoffice';

const BACKOFFICE_TABS: readonly AdminTab[] = [
  'overview',
  'support',
  'plans',
  'subscriptions',
  'disputes',
  'promotions',
  'payouts',
  'monetization',
  'newsletter',
];

export function tabSite(tab: AdminTab): StaffSite {
  return BACKOFFICE_TABS.includes(tab) ? 'backoffice' : 'admin';
}

// Whether the operator can open a section. The home of the Backoffice opens
// for anyone who can open at least one of its sections.
export function canOpenTab(
  hasPermission: (key: string) => boolean,
  tab: AdminTab,
): boolean {
  if (tab === 'overview') {
    return BACKOFFICE_TABS.some(
      (other) =>
        other !== 'overview' && hasPermission(ADMIN_TAB_PERMISSIONS[other]),
    );
  }
  return hasPermission(ADMIN_TAB_PERMISSIONS[tab]);
}

export function currentStaffSite(): StaffSite {
  return isBackofficeHost() ? 'backoffice' : 'admin';
}

// The navigation of one site: the Admin Panel keeps its groups without the
// sections that moved; the Backoffice shows the moved ones as one group.
export function navGroupsFor(site: StaffSite): AdminNavGroup[] {
  if (site === 'backoffice') {
    const items = BACKOFFICE_TABS.map((tab) =>
      ADMIN_NAV_GROUPS.flatMap((group) => group.items).find(
        (item) => item.id === tab,
      ),
    ).filter((item): item is AdminNavItem => !!item);
    return [{ labelKey: 'backoffice.nav.business', icon: Briefcase, items }];
  }
  return ADMIN_NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => tabSite(item.id) === 'admin'),
  })).filter((group) => group.items.length > 0);
}

export function navItemsFor(site: StaffSite): AdminNavItem[] {
  return navGroupsFor(site).flatMap((group) => group.items);
}

// Where a section is opened from the current site: its path when it lives
// here, its full address in the other site when it does not.
export function staffTabHref(tab: AdminTab, query = ''): string {
  const site = tabSite(tab);
  if (site === currentStaffSite()) return adminTabPath(tab, query);
  const origin =
    site === 'backoffice' ? backofficeOrigin() : adminPanelOrigin();
  return `${origin}${adminTabPath(tab, query)}`;
}

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
  site: StaffSite = currentStaffSite(),
): AdminTab {
  if (site === 'admin' && hasPermission(ADMIN_TAB_PERMISSIONS.trust)) {
    return 'trust';
  }
  for (const item of navItemsFor(site)) {
    if (canOpenTab(hasPermission, item.id)) {
      return item.id;
    }
  }
  return site === 'backoffice' ? 'overview' : 'analytics';
}

// Whether the operator can open any section of a site.
export function canOpenSite(
  hasPermission: (key: string) => boolean,
  site: StaffSite,
): boolean {
  return navItemsFor(site).some((item) => canOpenTab(hasPermission, item.id));
}
