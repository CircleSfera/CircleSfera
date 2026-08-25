import { useTranslation } from 'react-i18next';
import { TwoFactorSettings } from '../TwoFactorSettings';
import { ActiveSessionsSettings } from './ActiveSessionsSettings';
import PasskeySettings from './PasskeySettings';
import SettingsSection from './SettingsSection';

export default function SecuritySettings() {
  const { t } = useTranslation();

  return (
    <div className="max-w-xl space-y-5">
      <SettingsSection
        title={t('settings.security.title')}
        description={t('settings.security.subtitle')}
        card={false}
      >
        <div className="space-y-4">
          <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
            <ActiveSessionsSettings />
          </div>
          <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
            <PasskeySettings />
          </div>
          <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
            <TwoFactorSettings />
          </div>
        </div>
      </SettingsSection>
    </div>
  );
}
