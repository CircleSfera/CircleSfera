import { UserRoundPlus } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MAX_PROFILES_PER_ACCOUNT } from '../../services';
import CreateProfileForm from '../profiles/CreateProfileForm';
import OwnedProfileList, { useMyProfiles } from '../profiles/OwnedProfileList';
import { Button, Card } from '../ui';
import SettingsSection from './SettingsSection';

// Settings → Profiles: the account's Profiles, switching and creating one.
export default function ProfilesSettings() {
  const { t } = useTranslation();
  const [creating, setCreating] = useState(false);
  const { data: profiles } = useMyProfiles();
  const atLimit = (profiles?.length ?? 0) >= MAX_PROFILES_PER_ACCOUNT;

  return (
    <div className="max-w-xl space-y-6">
      <SettingsSection
        title={t('settings.profiles.title')}
        description={t('settings.profiles.description', {
          max: MAX_PROFILES_PER_ACCOUNT,
        })}
      >
        <OwnedProfileList />
      </SettingsSection>

      {creating ? (
        <Card variant="glass">
          <CreateProfileForm onCancel={() => setCreating(false)} />
        </Card>
      ) : profiles ? (
        <div className="space-y-2">
          <Button
            variant="secondary"
            size="md"
            className="w-full gap-2"
            onClick={() => setCreating(true)}
            disabled={atLimit}
          >
            <UserRoundPlus size={18} aria-hidden />
            {t('settings.profiles.create')}
          </Button>
          {atLimit ? (
            <p className="text-xs text-white/50 text-center">
              {t('settings.profiles.limit_reached', {
                max: MAX_PROFILES_PER_ACCOUNT,
              })}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
