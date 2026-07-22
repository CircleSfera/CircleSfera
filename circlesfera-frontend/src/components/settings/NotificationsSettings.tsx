import { AlertTriangle, Eye, EyeOff } from 'lucide-react';
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { usePushNotifications } from '../../hooks/usePushNotifications';
import { usersApi } from '../../services/users.service';

export default function NotificationsSettings() {
  const {
    permission,
    isSubscribed,
    loading,
    requestPermission,
    unsubscribeUser,
  } = usePushNotifications();
  const { t } = useTranslation();

  const [pushNotifications, setPushNotifications] = useState(true);
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [contentPreference, setContentPreference] = useState<
    'GENERAL' | 'MATURE'
  >('GENERAL');
  const [blurSensitiveContent, setBlurSensitiveContent] = useState(true);
  const [settingsLoaded, setSettingsLoaded] = useState(false);

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
        if (settings.contentPreference !== undefined) {
          setContentPreference(settings.contentPreference);
        }
        if (settings.blurSensitiveContent !== undefined) {
          setBlurSensitiveContent(settings.blurSensitiveContent);
        }
        setSettingsLoaded(true);
      })
      .catch(() => {
        setSettingsLoaded(true);
      });
  }, []);

  const updateSetting = (key: string, value: any) => {
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

  const handlePushToggle = (enabled: boolean) => {
    setPushNotifications(enabled);
    updateSetting('pushNotifications', enabled);
  };

  const handleEmailToggle = (enabled: boolean) => {
    setEmailNotifications(enabled);
    updateSetting('emailNotifications', enabled);
  };

  const handleContentPreferenceChange = (pref: 'GENERAL' | 'MATURE') => {
    setContentPreference(pref);
    updateSetting('contentPreference', pref);
  };

  const handleBlurToggle = (enabled: boolean) => {
    setBlurSensitiveContent(enabled);
    updateSetting('blurSensitiveContent', enabled);
  };

  return (
    <div className="max-w-xl space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h2 className="text-xl font-black text-white tracking-tighter">
          {t('settings.notifications_tab.title')}
        </h2>
        <p className="text-gray-300 text-sm font-medium mt-1 uppercase tracking-wide italic opacity-60">
          {t('settings.notifications_tab.subtitle')}
        </p>
      </div>

      {/* Native Browser Push */}
      <div className="bg-white/2 p-4 rounded-xl border border-white/5 border-l-purple-500/40 border-l-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-bold text-white tracking-tight">
              {t('settings.notifications_tab.native_alerts')}
            </h3>
            <p className="text-sm text-gray-300 mt-1 leading-relaxed">
              {t('settings.notifications_tab.native_alerts_desc')}
            </p>
            {permission === 'denied' && (
              <p className="text-xs text-red-400 font-bold uppercase tracking-wider mt-2 flex items-center gap-1">
                <AlertTriangle size={12} />{' '}
                {t('settings.notifications_tab.blocked')}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={isSubscribed ? unsubscribeUser : requestPermission}
            disabled={loading || permission === 'denied'}
            className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-all duration-300 focus:outline-none ring-offset-2 ring-offset-zinc-900 focus:ring-2 focus:ring-purple-500/50 ${
              isSubscribed
                ? 'bg-purple-500 shadow-[0_0_15px_rgba(168,85,247,0.5)]'
                : 'bg-white/10'
            } disabled:opacity-30 disabled:grayscale`}
          >
            <span
              className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-lg transition-transform duration-300 ${
                isSubscribed ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
      </div>

      {/* Platform Notification Preferences */}
      {settingsLoaded && (
        <>
          <div className="bg-white/2 p-4 rounded-xl border border-white/5">
            <div className="flex items-center justify-between gap-4">
              <div className="flex-1 min-w-0">
                <h3 className="text-lg font-bold text-white tracking-tight">
                  {t(
                    'settings.notifications.push_notifications',
                    'Push Notifications',
                  )}
                </h3>
                <p className="text-sm text-gray-300 mt-1 leading-relaxed">
                  {t(
                    'settings.notifications.push_desc',
                    'Receive in-app notifications',
                  )}
                </p>
              </div>
              <button
                type="button"
                onClick={() => handlePushToggle(!pushNotifications)}
                className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-all duration-300 focus:outline-none ring-offset-2 ring-offset-zinc-900 focus:ring-2 focus:ring-blue-500/50 ${
                  pushNotifications
                    ? 'bg-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.5)]'
                    : 'bg-white/10'
                }`}
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-lg transition-transform duration-300 ${
                    pushNotifications ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>

          <div className="bg-white/2 p-4 rounded-xl border border-white/5">
            <div className="flex items-center justify-between gap-4">
              <div className="flex-1 min-w-0">
                <h3 className="text-lg font-bold text-white tracking-tight">
                  {t(
                    'settings.notifications.email_notifications',
                    'Email Notifications',
                  )}
                </h3>
                <p className="text-sm text-gray-300 mt-1 leading-relaxed">
                  {t(
                    'settings.notifications.email_desc',
                    'Receive email updates and alerts',
                  )}
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleEmailToggle(!emailNotifications)}
                className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-all duration-300 focus:outline-none ring-offset-2 ring-offset-zinc-900 focus:ring-2 focus:ring-blue-500/50 ${
                  emailNotifications
                    ? 'bg-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.5)]'
                    : 'bg-white/10'
                }`}
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-lg transition-transform duration-300 ${
                    emailNotifications ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Content Preferences */}
          <div className="space-y-4">
            <h3 className="text-xs font-black uppercase tracking-wider text-gray-500 ml-1">
              {t('settings.notifications.content_prefs', 'Content Preferences')}
            </h3>

            <div className="bg-white/2 p-4 rounded-xl border border-white/5 space-y-4">
              <div>
                <label
                  htmlFor="content-preference"
                  className="block text-sm font-medium text-gray-300 mb-2"
                >
                  {t('settings.notifications.content_filter', 'Content Filter')}
                </label>
                <select
                  id="content-preference"
                  value={contentPreference}
                  onChange={(e) =>
                    handleContentPreferenceChange(
                      e.target.value as 'GENERAL' | 'MATURE',
                    )
                  }
                  className="w-full bg-zinc-900/50 border border-white/10 rounded-lg px-4 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                >
                  <option value="GENERAL">
                    {t('settings.notifications.general', 'General Audiences')}
                  </option>
                  <option value="MATURE">
                    {t('settings.notifications.mature', 'Mature Content (18+)')}
                  </option>
                </select>
              </div>

              <div className="flex items-center justify-between gap-4 pt-2">
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-bold text-white tracking-tight flex items-center gap-2">
                    {blurSensitiveContent ? (
                      <EyeOff size={16} />
                    ) : (
                      <Eye size={16} />
                    )}
                    {t(
                      'settings.notifications.blur_sensitive',
                      'Blur Sensitive Content',
                    )}
                  </h3>
                  <p className="text-xs text-gray-400 mt-1">
                    {t(
                      'settings.notifications.blur_desc',
                      'Hide potentially sensitive images until you click',
                    )}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleBlurToggle(!blurSensitiveContent)}
                  className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-all duration-300 focus:outline-none ring-offset-2 ring-offset-zinc-900 focus:ring-2 focus:ring-blue-500/50 ${
                    blurSensitiveContent
                      ? 'bg-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.5)]'
                      : 'bg-white/10'
                  }`}
                >
                  <span
                    className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-lg transition-transform duration-300 ${
                      blurSensitiveContent ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      <div className="space-y-4">
        <h3 className="text-xs font-black uppercase tracking-wider text-gray-500 ml-1">
          {t('settings.notifications_tab.browser_capability')}
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="bg-white/1 p-4 rounded-lg border border-white/5">
            <p className="text-xs font-bold text-gray-600 uppercase tracking-tighter mb-1">
              {t('settings.notifications_tab.status')}
            </p>
            <p className="text-xs font-bold text-white uppercase">
              {permission.toUpperCase()}
            </p>
          </div>
          <div className="bg-white/1 p-4 rounded-lg border border-white/5">
            <p className="text-xs font-bold text-gray-600 uppercase tracking-tighter mb-1">
              {t('settings.notifications_tab.pwa_support')}
            </p>
            <p className="text-xs font-bold text-white uppercase">
              {'serviceWorker' in navigator
                ? t('settings.notifications_tab.enabled')
                : t('settings.notifications_tab.not_supported')}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
