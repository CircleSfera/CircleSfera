import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import { NavLink } from 'react-router-dom';
import { CREATOR_NAV_GROUPS } from './creatorNav';

interface CreatorNavListProps {
  onNavigate?: () => void;
}

export default function CreatorNavList({ onNavigate }: CreatorNavListProps) {
  const { t } = useTranslation();

  return (
    <div className="space-y-5">
      {CREATOR_NAV_GROUPS.map((group) => (
        <div key={group.labelKey}>
          <p className="text-[11px] font-semibold text-white/40 uppercase tracking-wide mb-1.5 px-2">
            {t(group.labelKey, group.labelFallback)}
          </p>
          <ul className="space-y-0.5">
            {group.items.map((item) => {
              const ItemIcon = item.icon;
              return (
                <li key={item.id}>
                  <NavLink
                    to={`/creator/${item.id}`}
                    onClick={onNavigate}
                    className={({ isActive }) =>
                      clsx(
                        'flex items-center gap-2.5 px-2.5 py-2 min-h-11 rounded-lg text-sm transition-colors',
                        isActive
                          ? 'bg-brand-primary/15 text-white font-medium'
                          : 'text-white/60 hover:text-white hover:bg-white/5',
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <ItemIcon
                          size={18}
                          className={
                            isActive ? 'text-brand-primary' : 'text-white/40'
                          }
                          aria-hidden
                        />
                        <span className="truncate">
                          {t(item.labelKey, item.labelFallback)}
                        </span>
                      </>
                    )}
                  </NavLink>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
