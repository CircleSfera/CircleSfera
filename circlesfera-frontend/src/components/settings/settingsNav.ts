import {
  Bell,
  CreditCard,
  DollarSign,
  EyeOff,
  Flag,
  Key,
  type LucideIcon,
  Scale,
  Shield,
  Star,
  User,
  UserCog,
  UserPlus,
  Users,
  UserX,
} from 'lucide-react';

/** Canonical settings section ids (URL slug = id). */
export type SettingsSectionId =
  | 'profile'
  | 'privacy'
  | 'notifications'
  | 'security'
  | 'billing'
  | 'monetization'
  | 'requests'
  | 'referrals'
  | 'close_friends'
  | 'mutes'
  | 'feed_prefs'
  | 'appeals'
  | 'reports'
  | 'account';

export interface SettingsNavItem {
  id: SettingsSectionId;
  labelKey: string;
  labelFallback: string;
  icon: LucideIcon;
}

export interface SettingsNavGroup {
  id: 'you' | 'control' | 'trust' | 'money';
  labelKey: string;
  labelFallback: string;
  items: SettingsNavItem[];
}

/** Reserved path segments under /accounts that are not settings sections. */
export const ACCOUNTS_RESERVED_SEGMENTS = [
  'login',
  'signup',
  'emailsignup',
] as const;

export const SETTINGS_SECTION_IDS: SettingsSectionId[] = [
  'profile',
  'privacy',
  'notifications',
  'security',
  'billing',
  'monetization',
  'requests',
  'referrals',
  'close_friends',
  'mutes',
  'feed_prefs',
  'appeals',
  'reports',
  'account',
];

export const SETTINGS_NAV_GROUPS: SettingsNavGroup[] = [
  {
    id: 'you',
    labelKey: 'settings.groups.you',
    labelFallback: 'Your account',
    items: [
      {
        id: 'profile',
        labelKey: 'settings.tabs.profile.label',
        labelFallback: 'Profile',
        icon: User,
      },
      {
        id: 'notifications',
        labelKey: 'settings.tabs.notifications.label',
        labelFallback: 'Notifications',
        icon: Bell,
      },
      {
        id: 'account',
        labelKey: 'settings.tabs.account.label',
        labelFallback: 'Account',
        icon: UserCog,
      },
    ],
  },
  {
    id: 'control',
    labelKey: 'settings.groups.control',
    labelFallback: 'Privacy & control',
    items: [
      {
        id: 'privacy',
        labelKey: 'settings.tabs.privacy.label',
        labelFallback: 'Privacy',
        icon: Shield,
      },
      {
        id: 'feed_prefs',
        labelKey: 'settings.tabs.feed_prefs.label',
        labelFallback: 'Feed preferences',
        icon: EyeOff,
      },
      {
        id: 'close_friends',
        labelKey: 'settings.tabs.close_friends.label',
        labelFallback: 'Close friends',
        icon: Star,
      },
      {
        id: 'requests',
        labelKey: 'settings.tabs.requests.label',
        labelFallback: 'Requests',
        icon: UserPlus,
      },
      {
        id: 'mutes',
        labelKey: 'settings.tabs.mutes.label',
        labelFallback: 'Blocked & muted',
        icon: UserX,
      },
    ],
  },
  {
    id: 'trust',
    labelKey: 'settings.groups.trust',
    labelFallback: 'Security & trust',
    items: [
      {
        id: 'security',
        labelKey: 'settings.tabs.security.label',
        labelFallback: 'Security',
        icon: Key,
      },
      {
        id: 'appeals',
        labelKey: 'settings.tabs.appeals.label',
        labelFallback: 'Appeals',
        icon: Scale,
      },
      {
        id: 'reports',
        labelKey: 'settings.tabs.reports.label',
        labelFallback: 'Reports',
        icon: Flag,
      },
    ],
  },
  {
    id: 'money',
    labelKey: 'settings.groups.money',
    labelFallback: 'Plan & growth',
    items: [
      {
        id: 'billing',
        labelKey: 'settings.tabs.billing.label',
        labelFallback: 'Subscription',
        icon: CreditCard,
      },
      {
        id: 'monetization',
        labelKey: 'settings.tabs.monetization.label',
        labelFallback: 'Monetization',
        icon: DollarSign,
      },
      {
        id: 'referrals',
        labelKey: 'settings.tabs.referrals.label',
        labelFallback: 'Invitations',
        icon: Users,
      },
    ],
  },
];

export function isSettingsSectionId(
  value: string | undefined,
): value is SettingsSectionId {
  return !!value && SETTINGS_SECTION_IDS.includes(value as SettingsSectionId);
}

export function findSettingsNavItem(
  id: SettingsSectionId,
): SettingsNavItem | undefined {
  for (const group of SETTINGS_NAV_GROUPS) {
    const item = group.items.find((i) => i.id === id);
    if (item) return item;
  }
  return undefined;
}

export function getAllSettingsNavItems(): SettingsNavItem[] {
  return SETTINGS_NAV_GROUPS.flatMap((g) => g.items);
}
