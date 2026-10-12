import { useQuery } from '@tanstack/react-query';
import { clsx } from 'clsx';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { adminApi } from '../../services/admin.service';
import { useAdminAuthStore } from '../../stores/adminAuthStore';
import {
  ADMIN_TAB_PERMISSIONS,
  type AdminTab,
  canOpenTab,
  currentStaffSite,
  navGroupsFor,
} from './adminNav';

interface Props {
  activeTab: AdminTab;
  onTabChange: (tab: AdminTab) => void;
}

// Which groups the person left open, kept on this device only.
const OPEN_GROUPS_KEY = 'cs.staff.nav.open-groups';

function readOpenGroups(): Record<string, boolean> {
  try {
    const stored = window.localStorage.getItem(OPEN_GROUPS_KEY);
    const parsed: unknown = stored ? JSON.parse(stored) : null;
    // Anything but a plain record of what is open is forgotten.
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }
    return Object.fromEntries(
      Object.entries(parsed).filter(([, open]) => typeof open === 'boolean'),
    ) as Record<string, boolean>;
  } catch {
    return {};
  }
}

export default function AdminSidebar({ activeTab, onTabChange }: Props) {
  const { t } = useTranslation();
  const hasPermission = useAdminAuthStore((s) => s.hasPermission);
  // The sections of the staff site this is: Admin Panel or Backoffice.
  const navGroups = navGroupsFor(currentStaffSite());
  // With several groups the list is longer than the screen: a group is
  // folded until it is opened, and the group of the open section is always
  // shown. A site with one group shows it whole.
  const foldable = navGroups.length > 1;
  const [openGroups, setOpenGroups] = useState(readOpenGroups);
  const toggleGroup = (labelKey: string, open: boolean) => {
    const next = { ...openGroups, [labelKey]: open };
    setOpenGroups(next);
    try {
      window.localStorage.setItem(OPEN_GROUPS_KEY, JSON.stringify(next));
    } catch {
      // Kept for this visit only.
    }
  };

  const { data: trustQueue } = useQuery({
    queryKey: ['admin', 'trust-queue'],
    queryFn: () => adminApi.getTrustQueue().then((r) => r.data),
    refetchInterval: 60_000,
    // Asked only by who may read the queue.
    enabled: hasPermission(ADMIN_TAB_PERMISSIONS.trust),
  });

  const trustBadgeTotal =
    (trustQueue?.counts.reports ?? 0) +
    (trustQueue?.counts.appeals ?? 0) +
    (trustQueue?.counts.riskCases ?? 0) +
    (trustQueue?.counts.tickets ?? 0);

  const getItemBadge = (itemId: AdminTab) => {
    if (itemId === 'trust' && trustBadgeTotal > 0) {
      return String(trustBadgeTotal);
    }
    if (itemId === 'reports' && trustQueue?.counts?.reports) {
      return String(trustQueue.counts.reports);
    }
    if (itemId === 'appeals' && trustQueue?.counts?.appeals) {
      return String(trustQueue.counts.appeals);
    }
    if (itemId === 'spam-review' && trustQueue?.counts?.riskCases) {
      return String(trustQueue.counts.riskCases);
    }
    if (itemId === 'support' && trustQueue?.counts?.tickets) {
      return String(trustQueue.counts.tickets);
    }
    const item = navGroups.flatMap((g) => g.items).find((i) => i.id === itemId);
    return item?.badge;
  };

  return (
    <aside className="hidden lg:flex w-56 xl:w-64 flex-col h-[calc(100vh-5rem)] sticky top-4 overflow-hidden z-20 glass-panel rounded-xl p-3">
      <div className="flex-1 overflow-y-auto space-y-2 pr-0.5 custom-scrollbar">
        {navGroups.map((group) => {
          const visibleItems = group.items.filter((item) =>
            canOpenTab(hasPermission, item.id),
          );

          if (visibleItems.length === 0) return null;

          const holdsOpenSection = visibleItems.some(
            (item) => item.id === activeTab,
          );
          const isOpen =
            !foldable ||
            holdsOpenSection ||
            openGroups[group.labelKey] === true;
          // What waits inside a folded group is said on its heading.
          const waiting = visibleItems.reduce(
            (sum, item) => sum + (Number(getItemBadge(item.id)) || 0),
            0,
          );
          const listId = `staff-nav-${group.labelKey.replace(/\W+/g, '-')}`;
          const heading = (
            <>
              <group.icon
                size={11}
                className="text-brand-primary-text opacity-80"
              />
              <span>{t(group.labelKey)}</span>
            </>
          );

          return (
            <div key={group.labelKey} className="space-y-1">
              {foldable ? (
                <h3>
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    aria-controls={listId}
                    // The group of the open section cannot be folded away.
                    disabled={holdsOpenSection}
                    onClick={() => toggleGroup(group.labelKey, !isOpen)}
                    className="w-full min-h-11 px-2.5 rounded-lg text-[10px] font-semibold uppercase tracking-wider text-white/50 flex items-center gap-1.5 text-left enabled:hover:bg-white/5 enabled:hover:text-white/70"
                  >
                    {heading}
                    <span className="ml-auto flex items-center gap-1.5">
                      {!isOpen && waiting > 0 && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-brand-primary/20 text-brand-primary-text border border-brand-primary/30">
                          {waiting}
                        </span>
                      )}
                      {!holdsOpenSection &&
                        (isOpen ? (
                          <ChevronDown size={12} aria-hidden />
                        ) : (
                          <ChevronRight size={12} aria-hidden />
                        ))}
                    </span>
                  </button>
                </h3>
              ) : (
                <h3 className="px-2.5 text-[10px] font-semibold uppercase tracking-wider text-white/50 flex items-center gap-1.5 mb-1.5">
                  {heading}
                </h3>
              )}
              <div id={listId} className="space-y-0.5" hidden={!isOpen}>
                {visibleItems.map((item) => {
                  const isSelected = activeTab === item.id;
                  const ItemIcon = item.icon;
                  const badge = getItemBadge(item.id);
                  return (
                    <button
                      type="button"
                      key={item.id}
                      onClick={() => onTabChange(item.id)}
                      aria-current={isSelected ? 'page' : undefined}
                      className={clsx(
                        'w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs font-semibold border text-left min-h-11',
                        isSelected
                          ? 'bg-brand-primary/15 text-white border-brand-primary/30 border-l-2 border-l-brand-primary'
                          : 'bg-transparent text-white/50 border-transparent hover:bg-white/5 hover:text-white',
                      )}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <ItemIcon
                          size={14}
                          className={
                            isSelected
                              ? 'text-brand-primary-text'
                              : 'text-white/50'
                          }
                        />
                        <span className="truncate">{t(item.labelKey)}</span>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {badge && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-brand-primary/20 text-brand-primary-text border border-brand-primary/30">
                            {badge}
                          </span>
                        )}
                        {isSelected && (
                          <ChevronRight
                            size={12}
                            className="text-brand-primary-text"
                          />
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
}

export type { AdminTab } from './adminNav';
