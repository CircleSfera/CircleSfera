import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BadgeCheck,
  Check,
  ChevronRight,
  Download,
  Globe,
  Info,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { profileApi } from '../../services';
import * as dataExportApi from '../../services/data-export.service';
import { usersApi } from '../../services/users.service';
import { useAuthStore } from '../../stores/authStore';
import { logger } from '../../utils/logger';
import AboutAccountDialog, {
  aboutAccountFromProfile,
} from '../profile/AboutAccountDialog';
import { Button } from '../ui';
import SettingsDangerZone from './SettingsDangerZone';
import SettingsSection from './SettingsSection';

export default function AccountSettings() {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const logout = useAuthStore((state) => state.logout);
  const [showAbout, setShowAbout] = useState(false);

  const { data: profileData } = useQuery({
    queryKey: ['myProfile'],
    queryFn: () => profileApi.getMyProfile(),
  });
  const profile = profileData?.data;
  const aboutAccount = aboutAccountFromProfile(profile);

  const { data: latestExport, refetch: refetchExport } = useQuery({
    queryKey: ['data-export-latest'],
    queryFn: dataExportApi.getLatestDataExport,
    retry: false,
  });

  useEffect(() => {
    if (!profile || profile.identityVerifiedAt) return;
    usersApi
      .syncIdentitySession()
      .then((res) => {
        if (res?.status === 'verified') {
          queryClient.invalidateQueries({ queryKey: ['myProfile'] });
          toast.success(
            t(
              'settings.account.verification.success',
              'Your identity has been verified!',
            ),
          );
        }
      })
      .catch((err) => {
        logger.error('Failed to sync identity session:', err);
      });
  }, [profile, queryClient, t]);

  const deactivateMutation = useMutation({
    mutationFn: () => profileApi.deactivateAccount(),
    onSuccess: () => {
      logout();
      navigate('/accounts/login');
    },
    onError: () => toast.error(t('settings.account.disable.error')),
  });

  const deleteAccountMutation = useMutation({
    mutationFn: () => usersApi.scheduleDeletion(),
    onSuccess: () => {
      toast.success(
        t(
          'settings.account.delete_scheduled',
          'Account scheduled for deletion. Log in within 30 days to restore it.',
        ),
      );
      logout();
      navigate('/accounts/login');
    },
  });

  const cancelDeletionMutation = useMutation({
    mutationFn: () => usersApi.cancelScheduledDeletion(),
    onSuccess: () => {
      toast.success(
        t(
          'settings.account.delete_cancelled',
          'Account deletion cancelled. Your account is active again.',
        ),
      );
    },
    onError: () => {
      toast.error(
        t(
          'settings.account.delete_cancel_error',
          'Could not cancel deletion. Try logging in again within the grace period.',
        ),
      );
    },
  });

  const requestExportMutation = useMutation({
    mutationFn: dataExportApi.requestDataExport,
    onSuccess: () => {
      toast.success(
        t(
          'settings.privacy.export_requested',
          'Export request created. We will notify you when it is ready.',
        ),
      );
      refetchExport();
    },
    onError: (error: { response?: { data?: { message?: string } } }) => {
      toast.error(
        error.response?.data?.message ||
          t('settings.account.export_error', 'Failed to request data export.'),
      );
    },
  });

  const verifyIdentityMutation = useMutation({
    mutationFn: () =>
      usersApi.createIdentitySession(
        `${window.location.origin}/accounts/account`,
      ),
    onSuccess: (data) => {
      window.location.href = data.url;
    },
    onError: () => {
      toast.error(
        t(
          'settings.account.verification.error',
          'Failed to initialize verification session',
        ),
      );
    },
  });

  const changeLanguage = (lng: string) => {
    i18n.changeLanguage(lng);
  };

  return (
    <div className="max-w-xl space-y-5 pb-8">
      {aboutAccount ? (
        <AboutAccountDialog
          isOpen={showAbout}
          onClose={() => setShowAbout(false)}
          account={aboutAccount}
        />
      ) : null}

      <SettingsSection
        title={t('settings.account.title')}
        description={t('settings.account.subtitle')}
        card={false}
      >
        <div className="space-y-4">
          {aboutAccount ? (
            <ul className="rounded-xl border border-white/5 bg-white/[0.02] divide-y divide-white/5 overflow-hidden">
              <li>
                <button
                  type="button"
                  onClick={() => setShowAbout(true)}
                  className="flex items-center gap-3 px-4 py-3 min-h-11 w-full text-left hover:bg-white/5 transition-colors"
                >
                  <Info
                    size={18}
                    className="text-white/50 shrink-0"
                    aria-hidden
                  />
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-medium text-white truncate">
                      {t('settings.hub.about', 'About this account')}
                    </span>
                    <span className="block text-xs text-white/50 mt-0.5 truncate">
                      {t(
                        'settings.hub.about_hint',
                        'Joined date, verification, and account status',
                      )}
                    </span>
                  </span>
                  <ChevronRight
                    size={16}
                    className="text-white/30 shrink-0"
                    aria-hidden
                  />
                </button>
              </li>
            </ul>
          ) : null}

          <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
            <h3 className="text-sm font-medium text-white flex items-center gap-2 mb-3">
              <Globe size={14} className="text-brand-primary" aria-hidden />
              {t('settings.account.language')}
            </h3>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => changeLanguage('en')}
                className={`min-h-11 px-4 rounded-xl text-sm font-medium transition-colors ${
                  i18n.language.startsWith('en')
                    ? 'bg-brand-primary text-white'
                    : 'bg-white/5 text-white/70 hover:bg-white/10'
                }`}
              >
                English
              </button>
              <button
                type="button"
                onClick={() => changeLanguage('es')}
                className={`min-h-11 px-4 rounded-xl text-sm font-medium transition-colors ${
                  i18n.language.startsWith('es')
                    ? 'bg-brand-primary text-white'
                    : 'bg-white/5 text-white/70 hover:bg-white/10'
                }`}
              >
                Español
              </button>
            </div>
          </div>

          <div
            className={`rounded-xl border p-4 ${
              profile?.identityVerifiedAt
                ? 'border-green-500/20 bg-green-500/5'
                : 'border-brand-primary/20 bg-brand-primary/5'
            }`}
          >
            <h3
              className={`text-sm font-semibold flex items-center gap-2 mb-2 ${
                profile?.identityVerifiedAt
                  ? 'text-green-400'
                  : 'text-brand-primary'
              }`}
            >
              <BadgeCheck size={16} aria-hidden />
              {t(
                'settings.account.verification.title',
                'Identity Verification',
              )}
            </h3>
            <p className="text-xs text-white/50 leading-relaxed mb-3">
              {profile?.identityVerifiedAt
                ? t(
                    'settings.account.verification.verified_desc',
                    'Your identity has been successfully verified.',
                  )
                : t(
                    'settings.account.verification.unverified_desc',
                    'Verify your identity to get the verified badge. You will need a valid ID or Passport.',
                  )}
            </p>
            {profile?.identityVerifiedAt ? (
              <div className="inline-flex items-center gap-2 text-green-400 font-medium text-xs px-2 py-1 bg-green-500/10 rounded-lg">
                <Check size={14} strokeWidth={3} />
                {t('settings.account.verification.verified', 'Verified')}
              </div>
            ) : (
              <Button
                onClick={() => verifyIdentityMutation.mutate()}
                isLoading={verifyIdentityMutation.isPending}
                variant="outline"
                className="min-h-11 text-sm font-semibold"
              >
                {t('settings.account.verification.btn', 'Verify Identity')}
              </Button>
            )}
          </div>

          <div className="rounded-xl border border-brand-primary/15 bg-brand-primary/5 p-4">
            <h3 className="text-sm font-semibold text-brand-primary flex items-center gap-2 mb-2">
              <Download size={14} aria-hidden />
              {t('settings.account.export.title', 'Export Data')}
            </h3>
            <p className="text-xs text-white/50 leading-relaxed mb-3">
              {t(
                'settings.account.export.desc',
                'Download a copy of your data including your profile, posts, and messages.',
              )}
            </p>
            {latestExport && latestExport.status === 'PENDING' ? (
              <p className="text-sm text-brand-accent font-medium">
                {t(
                  'settings.account.export.processing',
                  'Processing your request…',
                )}
              </p>
            ) : latestExport &&
              latestExport.status === 'COMPLETED' &&
              latestExport.url ? (
              <div className="space-y-2">
                <a
                  href={latestExport.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex"
                >
                  <Button
                    variant="primary"
                    className="min-h-11 text-sm font-semibold gap-2"
                  >
                    <Download size={16} />
                    {t('settings.account.export.download', 'Download data')}
                  </Button>
                </a>
                <Button
                  variant="ghost"
                  onClick={() => requestExportMutation.mutate()}
                  isLoading={requestExportMutation.isPending}
                  className="text-xs min-h-11"
                >
                  {t(
                    'settings.account.export.request_new',
                    'Request a new export',
                  )}
                </Button>
              </div>
            ) : (
              <Button
                onClick={() => requestExportMutation.mutate()}
                isLoading={requestExportMutation.isPending}
                variant="outline"
                className="min-h-11 text-sm font-semibold"
              >
                {t('settings.account.export.btn', 'Request Export')}
              </Button>
            )}
          </div>
        </div>
      </SettingsSection>

      <div className="grid grid-cols-1 gap-4">
        <SettingsDangerZone
          variant="warning"
          title={t('settings.account.disable.title')}
          description={t('settings.account.disable.desc')}
          actionLabel={t('settings.account.disable.btn')}
          confirmTitle={t('settings.account.disable.title')}
          confirmBody={t(
            'settings.account.disable.confirm',
            'Are you sure you want to deactivate your account? You can reactivate it by logging in again.',
          )}
          confirmLabel={t('settings.account.disable.btn')}
          onConfirm={() => deactivateMutation.mutate()}
          isLoading={deactivateMutation.isPending}
        />

        <SettingsDangerZone
          variant="danger"
          title={t('settings.account.delete.title')}
          description={t(
            'settings.account.delete.desc',
            'Schedules deletion with a 30-day grace period. Log in again within that window to restore your account.',
          )}
          actionLabel={t('settings.account.delete.btn')}
          confirmTitle={t('settings.account.delete.title')}
          confirmBody={t(
            'settings.account.delete.confirm',
            'Schedule permanent deletion? You can restore by logging in within 30 days.',
          )}
          confirmLabel={t('settings.account.delete.btn')}
          onConfirm={() => deleteAccountMutation.mutate()}
          isLoading={deleteAccountMutation.isPending}
          secondaryAction={
            <Button
              onClick={() => cancelDeletionMutation.mutate()}
              isLoading={cancelDeletionMutation.isPending}
              variant="outline"
              className="w-full min-h-11 text-sm font-semibold border-white/15 text-white/70"
            >
              {t(
                'settings.account.delete.cancel_btn',
                'Cancel scheduled deletion',
              )}
            </Button>
          }
        />
      </div>
    </div>
  );
}
