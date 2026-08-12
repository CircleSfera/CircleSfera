import { useQuery } from '@tanstack/react-query';
import { clsx } from 'clsx';
import { ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { adminApi } from '../../services/admin.service';
import { useAdminAuthStore } from '../../stores/adminAuthStore';
import {
  ADMIN_NAV_GROUPS,
  ADMIN_TAB_PERMISSIONS,
  type AdminTab,
} from './adminNav';

interface Props {
  activeTab: AdminTab;
  onTabChange: (tab: AdminTab) => void;
}

export default function AdminSidebar({ activeTab, onTabChange }: Props) {
  const { t } = useTranslation();
  const hasPermission = useAdminAuthStore((s) => s.hasPermission);

  const { data: trustQueue } = useQuery({
    queryKey: ['admin', 'trust-queue'],
    queryFn: () => adminApi.getTrustQueue().then((r) => r.data),
    refetchInterval: 60_000,
  });

  const trustBadgeTotal =
    (trustQueue?.counts.reports ?? 0) +
    (trustQueue?.counts.appeals ?? 0) +
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
    if (itemId === 'support' && trustQueue?.counts?.tickets) {
      return String(trustQueue.counts.tickets);
    }
    const item = ADMIN_NAV_GROUPS.flatMap((g) => g.items).find(
      (i) => i.id === itemId,
    );
    return item?.badge;
  };

  return (
    <aside className="hidden lg:flex w-56 xl:w-64 flex-col h-[calc(100vh-5rem)] sticky top-4 overflow-hidden z-20 glass-panel rounded-xl p-3">
      <div className="flex-1 overflow-y-auto space-y-4 pr-0.5 custom-scrollbar">
        {ADMIN_NAV_GROUPS.map((group) => {
          const visibleItems = group.items.filter((item) =>
            hasPermission(ADMIN_TAB_PERMISSIONS[item.id]),
          );

          if (visibleItems.length === 0) return null;

          return (
            <div key={group.labelKey} className="space-y-1">
              <h3 className="px-2.5 text-[10px] font-semibold uppercase tracking-wider text-white/40 flex items-center gap-1.5 mb-1.5">
                <group.icon
                  size={11}
                  className="text-brand-primary opacity-80"
                />
                <span>{t(group.labelKey, group.labelFallback)}</span>
              </h3>
              <div className="space-y-1">
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
                        'w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs font-semibold border text-left min-h-10',
                        isSelected
                          ? 'bg-brand-primary/15 text-white border-brand-primary/30 border-l-2 border-l-brand-primary'
                          : 'bg-transparent text-white/50 border-transparent hover:bg-white/5 hover:text-white',
                      )}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <ItemIcon
                          size={14}
                          className={
                            isSelected ? 'text-brand-primary' : 'text-white/50'
                          }
                        />
                        <span className="truncate">
                          {t(item.labelKey, item.labelFallback)}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {badge && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-brand-primary/20 text-brand-primary border border-brand-primary/30">
                            {badge}
                          </span>
                        )}
                        {isSelected && (
                          <ChevronRight
                            size={12}
                            className="text-brand-primary"
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
