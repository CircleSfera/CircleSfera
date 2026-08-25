import { AlertTriangle } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { usePushNotifications } from '../../hooks/usePushNotifications';
import { usersApi } from '../../services/users.service';
import { Switch } from '../ui';
import SettingsRow from './SettingsRow';
import SettingsSection from './SettingsSection';

export default function NotificationsSettings() {
  const {
    isSupported,
    hasServiceWorker,
    permission,
    isSubscribed,
    loading,
    requestPermission,
    unsubscribeUser,
  } = usePushNotifications();
  const { t } = useTranslation();

  const [pushNotifications, setPushNotifications] = useState(true);
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const togglingNativeRef = useRef(false);

  useEffect(() => {
    usersApi
      .getSettings()
      .then((response) => {
        const settings = response.data;
        if (settings.pushNotifications !== undefined) {
          setPushNotifications(settings.pushNotifications);
        }
        if (settings.emailNotifications !== undefined) {
          setEmailNotifications(settings.emailNotifications);
        }
        setSettingsLoaded(true);
      })
      .catch(() => {
        setSettingsLoaded(true);
      });
  }, []);

  const updateSetting = (key: string, value: boolean) => {
    usersApi
      .updateSettings({ [key]: value })
      .then(() => {
        toast.success(t('settings.notifications.updated', 'Settings updated'));
      })
      .catch(() => {
        toast.error(
          t('settings.notifications.update_error', 'Failed to update settings'),
        );
      });
  };

  const toggleNativeAlerts = async () => {
    if (
      togglingNativeRef.current ||
      loading ||
      permission === 'denied' ||
      !isSupported
    ) {
      return;
    }

    togglingNativeRef.current = true;
    const enabling = !isSubscribed;
    try {
      const success = enabling
        ? await requestPermission()
        : await unsubscribeUser();

      if (success) {
        toast.success(
          enabling
            ? t('settings.notifications_tab.subscribe_success')
            : t('settings.notifications_tab.unsubscribe_success'),
        );
        return;
      }

      const denied =
        typeof Notification !== 'undefined' &&
        Notification.permission === 'denied';
      toast.error(
        denied
          ? t('settings.notifications_tab.blocked')
          : enabling
            ? t('settings.notifications_tab.subscribe_error')
            : t('settings.notifications_tab.unsubscribe_error'),
      );
    } finally {
      togglingNativeRef.current = false;
    }
  };

  const nativeDisabled = permission === 'denied' || !isSupported;
  const pwaStatus = !('serviceWorker' in navigator)
    ? t('settings.notifications_tab.not_supported')
    : hasServiceWorker
      ? t('settings.notifications_tab.enabled')
      : t('settings.notifications_tab.not_registered');

  return (
    <div className="max-w-xl space-y-5">
      <SettingsSection
        title={t('settings.notifications_tab.title')}
        description={t('settings.notifications_tab.subtitle')}
        card={false}
      >
        <div className="space-y-3">
          <div className="rounded-xl border border-white/5 bg-white/[0.02] divide-y divide-white/5">
            <SettingsRow
              label={t(
                'settings.notifications_tab.native_alerts',
                'Native alerts',
              )}
              description={t('settings.notifications_tab.native_alerts_desc')}
              control={
                <button
                  type="button"
                  role="switch"
                  aria-checked={isSubscribed}
                  aria-busy={loading}
                  disabled={nativeDisabled}
                  onClick={() => {
                    void toggleNativeAlerts();
                  }}
                  aria-label={t(
                    'settings.notifications_tab.native_alerts',
                    'Native alerts',
                  )}
                  className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border border-white/10 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-primary/50 disabled:opacity-50 disabled:cursor-not-allowed ${
                    isSubscribed ? 'bg-brand-primary' : 'bg-white/10'
                  }`}
                >
                  <span
                    aria-hidden
                    className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
                      isSubscribed ? 'translate-x-5' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              }
            >
              {permission === 'denied' && (
                <p className="text-xs text-brand-secondary font-medium mt-2 flex items-center gap-1">
                  <AlertTriangle size={12} aria-hidden />{' '}
                  {t('settings.notifications_tab.blocked')}
                </p>
              )}
              {loading && (
                <p className="text-xs text-white/50 mt-2">
                  {isSubscribed
                    ? t('settings.notifications_tab.disabling')
                    : t('settings.notifications_tab.enabling')}
                </p>
              )}
            </SettingsRow>
          </div>

          {settingsLoaded && (
            <div className="rounded-xl border border-white/5 bg-white/[0.02] divide-y divide-white/5">
              <SettingsRow
                label={t(
                  'settings.notifications.push_notifications',
                  'Push notifications',
                )}
                description={t(
                  'settings.notifications.push_desc',
                  'Receive in-app notifications',
                )}
                control={
                  <Switch
                    checked={pushNotifications}
                    onChange={(e) => {
                      setPushNotifications(e.target.checked);
                      updateSetting('pushNotifications', e.target.checked);
                    }}
                    aria-label={t(
                      'settings.notifications.push_notifications',
                      'Push notifications',
                    )}
                  />
                }
              />
              <SettingsRow
                label={t(
                  'settings.notifications.email_notifications',
                  'Email notifications',
                )}
                description={t(
                  'settings.notifications.email_desc',
                  'Receive email updates and alerts',
                )}
                control={
                  <Switch
                    checked={emailNotifications}
                    onChange={(e) => {
                      setEmailNotifications(e.target.checked);
                      updateSetting('emailNotifications', e.target.checked);
                    }}
                    aria-label={t(
                      'settings.notifications.email_notifications',
                      'Email notifications',
                    )}
                  />
                }
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
              <p className="text-xs text-white/40 mb-1">
                {t('settings.notifications_tab.status')}
              </p>
              <p className="text-sm font-medium text-white capitalize">
                {permission}
              </p>
            </div>
            <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
              <p className="text-xs text-white/40 mb-1">
                {t('settings.notifications_tab.pwa_support')}
              </p>
              <p className="text-sm font-medium text-white">{pwaStatus}</p>
            </div>
          </div>
        </div>
      </SettingsSection>
    </div>
  );
}
