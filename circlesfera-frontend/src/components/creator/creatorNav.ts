import {
  BarChart3,
  Briefcase,
  Clock,
  CreditCard,
  ImageIcon,
  LayoutDashboard,
  type LucideIcon,
  Megaphone,
  Sparkles,
} from 'lucide-react';

// Canonical creator studio tabs (older addresses redirect to plans).
export type CreatorTab =
  | 'overview'
  | 'analytics'
  | 'content'
  | 'stories'
  | 'plans'
  | 'ads'
  | 'business'
  | 'founders';

// Older tab ids kept only for redirects.
export const CREATOR_LEGACY_TABS: readonly string[] = [
  'finance',
  'monetization',
];

export interface CreatorNavItem {
  id: CreatorTab;
  labelKey: string;
  icon: LucideIcon;
  badge?: string;
  /** Shown only to a Business Profile. */
  businessOnly?: boolean;
  /** Shown only to a Creator Profile. */
  creatorOnly?: boolean;
}

export interface CreatorNavGroup {
  labelKey: string;
  icon: LucideIcon;
  items: CreatorNavItem[];
}

export const CREATOR_NAV_GROUPS: CreatorNavGroup[] = [
  {
    labelKey: 'creator.nav.dashboard',
    icon: LayoutDashboard,
    items: [
      {
        id: 'overview',
        labelKey: 'creator.nav.overview',
        icon: LayoutDashboard,
      },
      {
        id: 'analytics',
        labelKey: 'creator.nav.analytics',
        icon: BarChart3,
      },
      {
        id: 'business',
        labelKey: 'creator.nav.business',
        icon: Briefcase,
        businessOnly: true,
      },
      {
        id: 'plans',
        labelKey: 'creator.nav.plans',
        icon: CreditCard,
      },
      {
        id: 'ads',
        labelKey: 'creator.nav.ads',
        icon: Megaphone,
      },
      {
        // Founding creators (BD-034): a Creator Profile applies here.
        id: 'founders',
        labelKey: 'creator.nav.founders',
        icon: Sparkles,
        creatorOnly: true,
      },
    ],
  },
  {
    labelKey: 'creator.nav.content_group',
    icon: ImageIcon,
    items: [
      {
        id: 'content',
        labelKey: 'creator.nav.content',
        icon: ImageIcon,
      },
      {
        id: 'stories',
        labelKey: 'creator.nav.stories',
        icon: Clock,
      },
    ],
  },
];

export const CREATOR_NAV_ITEMS: CreatorNavItem[] = CREATOR_NAV_GROUPS.flatMap(
  (g) => g.items,
);

export const CREATOR_TAB_IDS: CreatorTab[] = CREATOR_NAV_ITEMS.map((i) => i.id);

export function findCreatorNavItem(
  tab: CreatorTab,
): CreatorNavItem | undefined {
  return CREATOR_NAV_ITEMS.find((i) => i.id === tab);
}

export function isCreatorTab(tab: string | undefined): tab is CreatorTab {
  return !!tab && (CREATOR_TAB_IDS as string[]).includes(tab);
}

/** The items a Profile of this kind sees in a group. */
export function visibleNavItems(
  items: CreatorNavItem[],
  accountType: string | undefined,
): CreatorNavItem[] {
  return items.filter(
    (i) =>
      (!i.businessOnly || accountType === 'BUSINESS') &&
      (!i.creatorOnly || accountType === 'CREATOR'),
  );
}
