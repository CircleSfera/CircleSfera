import { useQuery } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { profileApi } from '../../services';
import { LoadingSpinner } from '../LoadingStates';
import UserAvatar from '../UserAvatar';
import { Button } from '../ui';
import SettingsSection from './SettingsSection';

export default function ReferralsSettings() {
  const { t } = useTranslation();
  const { data, isLoading } = useQuery({
    queryKey: ['myReferrals'],
    queryFn: () => profileApi.getMyReferrals(),
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <LoadingSpinner size="sm" />
      </div>
    );
  }

  const inviteCode = data?.data?.inviteCode;
  const referrals = data?.data?.referrals || [];
  const maxReferrals = data?.data?.maxReferrals || 3;
  const referralCount = data?.data?.referralCount || 0;
  const inviteLink = `${window.location.origin}/accounts/signup?inviteCode=${inviteCode}`;
  const atMax = referralCount >= maxReferrals;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(inviteLink);
    toast.success(t('referralsSettings.copied'));
  };

  return (
    <div className="max-w-xl space-y-5">
      <SettingsSection
        title={t('referralsSettings.title')}
        description={t('referralsSettings.subtitle')}
        card={false}
      >
        <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-medium text-white">
              {t('referralsSettings.your_invite_link')}
            </h3>
            <span className="text-xs font-medium text-white/70 bg-white/5 border border-white/10 px-2.5 py-1 rounded-full">
              {t('referralsSettings.used_count', {
                count: referralCount,
                max: maxReferrals,
              })}
            </span>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              value={inviteLink}
              readOnly
              aria-label={t('referralsSettings.your_invite_link')}
              className="flex-1 min-h-11 min-w-0 rounded-xl border border-white/10 bg-white/5 px-4 font-mono text-sm text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/50"
            />
            <Button
              type="button"
              onClick={handleCopyLink}
              disabled={atMax}
              className="shrink-0"
            >
              {t('referralsSettings.copy')}
            </Button>
          </div>
          {atMax ? (
            <p className="text-xs text-brand-secondary">
              {t('referralsSettings.max_reached')}
            </p>
          ) : null}
        </div>
      </SettingsSection>

      <SettingsSection
        title={t('referralsSettings.users_invited')}
        card={false}
      >
        {referrals.length === 0 ? (
          <p className="text-sm text-white/50 text-center py-8 rounded-xl border border-white/5 bg-white/[0.02]">
            {t('referralsSettings.no_invites')}
          </p>
        ) : (
          <ul className="rounded-xl border border-white/5 bg-white/[0.02] divide-y divide-white/5">
            {referrals.map(
              (referral: {
                id: string;
                createdAt: string;
                profile?: {
                  avatar?: string;
                  fullName?: string;
                  username?: string;
                };
              }) => (
                <li
                  key={referral.id}
                  className="flex items-center gap-3 px-4 py-3"
                >
                  <UserAvatar
                    src={referral.profile?.avatar}
                    alt={
                      referral.profile?.fullName ||
                      referral.profile?.username ||
                      ''
                    }
                    size="md"
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white truncate">
                      {referral.profile?.fullName || referral.profile?.username}
                    </p>
                    <p className="text-xs text-white/45 truncate">
                      @{referral.profile?.username}{' '}
                      {t('referralsSettings.joined_on', {
                        date: new Date(referral.createdAt).toLocaleDateString(),
                      })}
                    </p>
                  </div>
                </li>
              ),
            )}
          </ul>
        )}
      </SettingsSection>
    </div>
  );
}
