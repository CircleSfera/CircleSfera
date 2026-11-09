import { FAVORITES_MAX } from '@circlesfera/shared';
import { useTranslation } from 'react-i18next';
import FavoritesManager from '../favorites/FavoritesManager';
import SettingsSection from './SettingsSection';

export default function FavoritesSettings() {
  const { t } = useTranslation();

  return (
    <div className="max-w-xl">
      <SettingsSection
        title={t('favorites.title')}
        description={t('favorites.desc', { max: FAVORITES_MAX })}
        card={false}
      >
        <FavoritesManager />
      </SettingsSection>
    </div>
  );
}
