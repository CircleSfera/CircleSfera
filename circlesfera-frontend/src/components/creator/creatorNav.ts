import {
  BarChart3,
  Clock,
  DollarSign,
  ImageIcon,
  LayoutDashboard,
  type LucideIcon,
  Megaphone,
} from 'lucide-react';

/** Canonical creator studio tabs (finance redirects to monetization). */
export type CreatorTab =
  | 'overview'
  | 'analytics'
  | 'content'
  | 'stories'
  | 'monetization'
  | 'ads';

/** Legacy tab id kept only for redirects. */
export type CreatorLegacyTab = CreatorTab | 'finance';

export interface CreatorNavItem {
  id: CreatorTab;
  labelKey: string;
  labelFallback: string;
  icon: LucideIcon;
  badge?: string;
}

export interface CreatorNavGroup {
  labelKey: string;
  labelFallback: string;
  icon: LucideIcon;
  items: CreatorNavItem[];
}

export const CREATOR_NAV_GROUPS: CreatorNavGroup[] = [
  {
    labelKey: 'creator.nav.dashboard',
    labelFallback: 'Dashboard',
    icon: LayoutDashboard,
    items: [
      {
        id: 'overview',
        labelKey: 'creator.nav.overview',
        labelFallback: 'Resumen',
        icon: LayoutDashboard,
      },
      {
        id: 'analytics',
        labelKey: 'creator.nav.analytics',
        labelFallback: 'Analíticas',
        icon: BarChart3,
      },
      {
        id: 'monetization',
        labelKey: 'creator.nav.monetization',
        labelFallback: 'Monetización',
        icon: DollarSign,
      },
      {
        id: 'ads',
        labelKey: 'creator.nav.ads',
        labelFallback: 'Publicidad',
        icon: Megaphone,
      },
    ],
  },
  {
    labelKey: 'creator.nav.content_group',
    labelFallback: 'Contenido',
    icon: ImageIcon,
    items: [
      {
        id: 'content',
        labelKey: 'creator.nav.content',
        labelFallback: 'Publicaciones',
        icon: ImageIcon,
      },
      {
        id: 'stories',
        labelKey: 'creator.nav.stories',
        labelFallback: 'Historias',
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
