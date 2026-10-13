import { clsx } from 'clsx';
import { Fragment } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink } from 'react-router-dom';
import { CREATOR_NAV_GROUPS } from './creatorNav';

// The sections on desktop: a row of tabs under the title, so the content keeps
// the width the app's navigation leaves. On a phone they are in the sheet.
export default function CreatorTabs() {
  const { t } = useTranslation();

  return (
    <nav
      data-testid="creator-tabs"
      aria-label={t('creator.nav_label')}
      className="hidden md:flex items-center gap-1 mb-6 border-b border-white/10 overflow-x-auto no-scrollbar"
    >
      {CREATOR_NAV_GROUPS.map((group, index) => (
        <Fragment key={group.labelKey}>
          {index > 0 ? (
            <span className="mx-2 h-5 w-px bg-white/10 shrink-0" aria-hidden />
          ) : null}
          {group.items.map((item) => {
            const ItemIcon = item.icon;
            return (
              <NavLink
                key={item.id}
                to={`/creator/${item.id}`}
                className={({ isActive }) =>
                  clsx(
                    'inline-flex items-center gap-2 h-11 px-3 -mb-px border-b-2 text-sm whitespace-nowrap transition-colors',
                    isActive
                      ? 'border-brand-primary text-white font-medium'
                      : 'border-transparent text-white/60 hover:text-white',
                  )
                }
              >
                <ItemIcon size={16} aria-hidden />
                {t(item.labelKey)}
              </NavLink>
            );
          })}
        </Fragment>
      ))}
    </nav>
  );
}
