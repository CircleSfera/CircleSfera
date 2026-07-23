import { useQuery } from '@tanstack/react-query';
import { clsx } from 'clsx';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import logoSrc from '../../assets/logo.png';
import { adminApi } from '../../services/admin.service';
import { ADMIN_NAV_GROUPS, type AdminTab } from './adminNav';

interface Props {
  activeTab: AdminTab;
  onTabChange: (tab: AdminTab) => void;
}

export default function AdminSidebar({ activeTab, onTabChange }: Props) {
  const { t } = useTranslation();

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
    const item = ADMIN_NAV_GROUPS.flatMap((g) => g.items).find(
      (i) => i.id === itemId,
    );
    return item?.badge;
  };

  return (
    <aside className="hidden lg:flex w-64 xl:w-72 flex-col h-[calc(100vh-5.5rem)] sticky top-6 overflow-hidden z-20 bg-white/[0.02] border-r border-white/5 p-3 xl:p-4">
      <div className="px-2 mb-4 space-y-2.5 pb-3 border-b border-white/5">
        <Link to="/" className="block">
          <img src={logoSrc} alt="CircleSfera" className="h-7 w-auto" />
        </Link>
        <Link
          to="/"
          className="flex items-center gap-2 text-xs font-semibold text-gray-400 hover:text-white transition-colors group"
        >
          <ArrowLeft
            size={13}
            className="group-hover:-translate-x-1 transition-transform text-brand-primary"
          />
          <span>{t('admin.back_to_app', 'Volver a CircleSfera')}</span>
        </Link>
      </div>

      <div className="flex-1 overflow-y-auto space-y-5 pr-1 custom-scrollbar">
        {ADMIN_NAV_GROUPS.map((group) => (
          <div key={group.labelKey} className="space-y-1">
            <h3 className="px-3 text-xs font-semibold uppercase tracking-wider text-gray-500 flex items-center gap-2 mb-1.5">
              <group.icon size={12} className="text-brand-primary opacity-80" />
              <span>{t(group.labelKey, group.labelFallback)}</span>
            </h3>
            <div className="space-y-0.5">
              {group.items.map((item) => {
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
                      'w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-semibold border text-left min-h-10',
                      isSelected
                        ? 'bg-brand-primary/15 text-white border-brand-primary/30 border-l-2 border-l-brand-primary'
                        : 'bg-transparent text-gray-400 border-transparent hover:bg-white/5 hover:text-white',
                    )}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <ItemIcon
                        size={16}
                        className={
                          isSelected ? 'text-brand-primary' : 'text-gray-400'
                        }
                      />
                      <span className="truncate">
                        {t(item.labelKey, item.labelFallback)}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {badge && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-brand-primary/20 text-brand-primary border border-brand-primary/30">
                          {badge}
                        </span>
                      )}
                      {isSelected && (
                        <ChevronRight
                          size={14}
                          className="text-brand-primary"
                        />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}

export type { AdminTab } from './adminNav';
