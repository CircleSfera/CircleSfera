import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { profileApi, usersApi } from '../../services';
import type { UpdateProfileDto } from '../../types';
import { logger } from '../../utils/logger';
import { keepSavedOwnProfile } from '../../utils/ownProfileCache';
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
      setIsPrivate(!!profile.isPrivate);
    }
  }, [profile]);

  const updateProfileMutation = useMutation({
    mutationFn: (data: UpdateProfileDto) => profileApi.updateProfile(data),
    onSuccess: (response) => {
      keepSavedOwnProfile(queryClient, response);
      // Going public accepts the follow requests that were waiting.
      void queryClient.invalidateQueries({
        queryKey: ['pendingFollowRequests'],
      });
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
        <StorySharesRow />
      </SettingsSection>

      <p className="text-xs text-white/50 px-1">
        {t('settings.privacy.export_link_hint')}{' '}
        <Link
          to="/accounts/account"
          className="text-brand-primary-text hover:underline font-medium"
        >
          {t('settings.privacy.export_link')}
        </Link>
      </p>
    </div>
  );
}

/**
 * Whether others may share this Profile's posts and Frames to their
 * stories, on by default. Off stops new shares only.
 */
function StorySharesRow() {
  const { t } = useTranslation();
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    let live = true;
    usersApi
      .getSettings()
      .then((res) => {
        if (live) setAllowed(res.data?.allowStoryShares !== false);
      })
      .catch(() => {
        if (live) setAllowed(true);
      });
    return () => {
      live = false;
    };
  }, []);

  const change = (next: boolean) => {
    setAllowed(next);
    usersApi.updateSettings({ allowStoryShares: next }).catch(() => {
      setAllowed(!next);
      toast.error(t('settings.privacy.story_shares_error'));
    });
  };

  return (
    <SettingsRow
      label={t('settings.privacy.story_shares')}
      description={t('settings.privacy.story_shares_desc')}
      control={
        <Switch
          checked={allowed ?? true}
          disabled={allowed === null}
          onChange={(e) => change(e.target.checked)}
          aria-label={t('settings.privacy.story_shares')}
        />
      }
    />
  );
}
