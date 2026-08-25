import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { profileApi } from '../../services';
import type { UpdateProfileDto } from '../../types';
import { logger } from '../../utils/logger';
import { Switch } from '../ui';
import SettingsRow from './SettingsRow';
import SettingsSection from './SettingsSection';

export default function PrivacySettings() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const { data: profileData } = useQuery({
    queryKey: ['myProfile'],
    queryFn: () => profileApi.getMyProfile(),
  });
  const profile = profileData?.data;

  const [isPrivate, setIsPrivate] = useState(false);

  useEffect(() => {
    if (profile) {
      setIsPrivate(
        !!(
          profile.isPrivate ||
          profile.user?.settings?.privacyLevel === 'PRIVATE'
        ),
      );
    }
  }, [profile]);

  const updateProfileMutation = useMutation({
    mutationFn: (data: UpdateProfileDto) => profileApi.updateProfile(data),
    onSuccess: (response) => {
      queryClient.setQueryData(['myProfile'], response);
    },
  });

  const handlePrivacyToggle = () => {
    const newPrivateValue = !isPrivate;
    setIsPrivate(newPrivateValue);
    updateProfileMutation.mutate(
      { isPrivate: newPrivateValue },
      {
        onError: () => {
          setIsPrivate(!newPrivateValue);
          logger.error('Failed to update privacy settings');
        },
      },
    );
  };

  return (
    <div className="max-w-xl space-y-5">
      <SettingsSection
        title={t('settings.privacy.title')}
        description={t('settings.privacy.subtitle')}
      >
        <SettingsRow
          label={t('settings.privacy.private_account')}
          description={t('settings.privacy.private_desc')}
          control={
            <Switch
              checked={isPrivate}
              onChange={() => handlePrivacyToggle()}
              aria-label={t('settings.privacy.private_account')}
            />
          }
        />
      </SettingsSection>

      <p className="text-xs text-white/50 px-1">
        {t('settings.privacy.export_link_hint', 'Need a copy of your data?')}{' '}
        <Link
          to="/accounts/account"
          className="text-brand-primary hover:underline font-medium"
        >
          {t('settings.privacy.export_link', 'Export from Account')}
        </Link>
      </p>
    </div>
  );
}
