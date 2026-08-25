import { useTranslation } from 'react-i18next';
import CreatorNavList from './CreatorNavList';

export default function CreatorSidebar() {
  const { t } = useTranslation();

  return (
    <nav
      data-testid="creator-sidebar"
      aria-label={t('creator.nav_label', 'Creator Studio')}
      className="hidden md:block w-56 shrink-0"
    >
      <div className="sticky top-24">
        <CreatorNavList />
      </div>
    </nav>
  );
}
