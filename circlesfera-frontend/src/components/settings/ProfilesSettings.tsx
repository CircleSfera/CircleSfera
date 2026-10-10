import { UserRoundPlus } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { profileLimit } from '../../services';
import CreateProfileForm from '../profiles/CreateProfileForm';
import OwnedProfileList, { useMyProfiles } from '../profiles/OwnedProfileList';
import { Button, Card } from '../ui';
import SettingsSection from './SettingsSection';

// Settings → Profiles: the account's Profiles, switching and creating one.
export default function ProfilesSettings() {
  const { t } = useTranslation();
  const [creating, setCreating] = useState(false);
  const { data: profiles } = useMyProfiles();
  const max = profileLimit(profiles);
  const atLimit = (profiles?.length ?? 0) >= max;

  return (
    <div className="max-w-xl space-y-6">
      <SettingsSection
        title={t('settings.profiles.title')}
        description={t('settings.profiles.description', {
          max,
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
                max,
              })}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
