import { ADS_CONSENT_FLAG } from '@circlesfera/shared';
import {
  Archive,
  Bell,
  Building2,
  CreditCard,
  EyeOff,
  Flag,
  Handshake,
  Heart,
  Key,
  type LucideIcon,
  Megaphone,
  MessageSquareOff,
  Scale,
  Shield,
  Star,
  Tag,
  Trash2,
  User,
  UserCog,
  UserPlus,
  Users,
  UsersRound,
  UserX,
} from 'lucide-react';

// Canonical settings section ids (URL slug = id).
export type SettingsSectionId =
  | 'profile'
  | 'profiles'
  | 'team'
  | 'company'
  | 'privacy'
  | 'notifications'
  | 'security'
  | 'billing'
  | 'requests'
  | 'collaborations'
  | 'close_friends'
  | 'favorites'
  | 'mutes'
  | 'tags'
  | 'hidden_words'
  | 'feed_prefs'
  | 'ads'
  | 'appeals'
  | 'reports'
  | 'recently_deleted'
  | 'archive'
  | 'account';

export interface SettingsNavItem {
  id: SettingsSectionId;
  labelKey: string;
  icon: LucideIcon;
  // A feature flag the section waits for: while it is off the section is not
  // listed and its address goes back to the hub.
  flag?: string;
}

export interface SettingsNavGroup {
  id: 'you' | 'activity' | 'control' | 'trust' | 'money';
  labelKey: string;
  items: SettingsNavItem[];
}

// Reserved path segments under /accounts that are not settings sections.
export const ACCOUNTS_RESERVED_SEGMENTS = [
  'login',
  'signup',
  'emailsignup',
] as const;

export const SETTINGS_SECTION_IDS: SettingsSectionId[] = [
  'profile',
  'profiles',
  'team',
  'company',
  'privacy',
  'notifications',
  'security',
  'billing',
  'requests',
  'collaborations',
  'close_friends',
  'favorites',
  'mutes',
  'tags',
  'hidden_words',
  'feed_prefs',
  'ads',
  'appeals',
  'reports',
  'recently_deleted',
  'archive',
  'account',
];

export const SETTINGS_NAV_GROUPS: SettingsNavGroup[] = [
  {
    id: 'you',
    labelKey: 'settings.groups.you',
    items: [
      {
        id: 'profile',
        labelKey: 'settings.tabs.profile.label',
        icon: User,
      },
      {
        id: 'profiles',
        labelKey: 'settings.tabs.profiles.label',
        icon: UsersRound,
      },
      {
        id: 'team',
        labelKey: 'settings.tabs.team.label',
        icon: Users,
      },
      {
        id: 'company',
        labelKey: 'settings.tabs.company.label',
        icon: Building2,
      },
      {
        id: 'notifications',
        labelKey: 'settings.tabs.notifications.label',
        icon: Bell,
      },
      {
        id: 'account',
        labelKey: 'settings.tabs.account.label',
        icon: UserCog,
      },
    ],
  },
  {
    id: 'activity',
    labelKey: 'settings.groups.activity',
    items: [
      {
        id: 'archive',
        labelKey: 'settings.tabs.archive.label',
        icon: Archive,
      },
      {
        id: 'collaborations',
        labelKey: 'settings.tabs.collaborations.label',
        icon: Handshake,
      },
      {
        id: 'recently_deleted',
        labelKey: 'settings.tabs.recently_deleted.label',
        icon: Trash2,
      },
    ],
  },
  {
    id: 'control',
    labelKey: 'settings.groups.control',
    items: [
      {
        id: 'privacy',
        labelKey: 'settings.tabs.privacy.label',
        icon: Shield,
      },
      {
        id: 'feed_prefs',
        labelKey: 'settings.tabs.feed_prefs.label',
        icon: EyeOff,
      },
      {
        // How the person's ads are chosen (PD-084): hidden until the legal
        // review of Ads 0 turns the flag on.
        id: 'ads',
        labelKey: 'settings.tabs.ads.label',
        icon: Megaphone,
        flag: ADS_CONSENT_FLAG,
      },
      {
        id: 'close_friends',
        labelKey: 'settings.tabs.close_friends.label',
        icon: Star,
      },
      {
        id: 'favorites',
        labelKey: 'settings.tabs.favorites.label',
        icon: Heart,
      },
      {
        id: 'requests',
        labelKey: 'settings.tabs.requests.label',
        icon: UserPlus,
      },
      {
        id: 'mutes',
        labelKey: 'settings.tabs.mutes.label',
        icon: UserX,
      },
      {
        id: 'tags',
        labelKey: 'settings.tabs.tags.label',
        icon: Tag,
      },
      {
        id: 'hidden_words',
        labelKey: 'settings.tabs.hidden_words.label',
        icon: MessageSquareOff,
      },
    ],
  },
  {
    id: 'trust',
    labelKey: 'settings.groups.trust',
    items: [
      {
        id: 'security',
        labelKey: 'settings.tabs.security.label',
        icon: Key,
      },
      {
        id: 'appeals',
        labelKey: 'settings.tabs.appeals.label',
        icon: Scale,
      },
      {
        id: 'reports',
        labelKey: 'settings.tabs.reports.label',
        icon: Flag,
      },
    ],
  },
  {
    id: 'money',
    labelKey: 'settings.groups.money',
    items: [
      {
        id: 'billing',
        labelKey: 'settings.tabs.billing.label',
        icon: CreditCard,
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

/** Whether a section is shown with these feature flags. */
export function isSettingsSectionShown(
  id: SettingsSectionId,
  flags: Record<string, boolean>,
): boolean {
  const flag = findSettingsNavItem(id)?.flag;
  return !flag || flags[flag] === true;
}

/** The groups and sections shown with these feature flags. */
export function visibleSettingsNavGroups(
  flags: Record<string, boolean>,
): SettingsNavGroup[] {
  return SETTINGS_NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => !item.flag || flags[item.flag]),
  })).filter((group) => group.items.length > 0);
}

export function getAllSettingsNavItems(): SettingsNavItem[] {
  return SETTINGS_NAV_GROUPS.flatMap((g) => g.items);
}
