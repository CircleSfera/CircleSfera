import { useTranslation } from 'react-i18next';
import CloseFriendsManager from '../close-friends/CloseFriendsManager';
import SettingsSection from './SettingsSection';

export default function CloseFriendsSettings() {
  const { t } = useTranslation();

  return (
    <div className="max-w-xl">
      <SettingsSection
        title={t('settings.close_friends_modal.title')}
        description={t('settings.close_friends_modal.list_desc')}
        card={false}
      >
        <CloseFriendsManager showHeader={false} />
      </SettingsSection>
    </div>
  );
}
