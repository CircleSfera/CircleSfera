import { AlertTriangle } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { usePushNotifications } from '../../hooks/usePushNotifications';
import { usersApi } from '../../services/users.service';
import { Switch } from '../ui';
import SettingsRow from './SettingsRow';
import SettingsSection from './SettingsSection';

// The groups a Profile switches push by, in the order shown.
const PUSH_GROUPS = [
  'pushLikes',
  'pushComments',
  'pushFollows',
  'pushMessages',
  'pushLive',
] as const;

type PushGroupKey = (typeof PUSH_GROUPS)[number];

const PUSH_GROUP_LABEL: Record<PushGroupKey, string> = {
  pushLikes: 'likes',
  pushComments: 'comments',
  pushFollows: 'follows',
  pushMessages: 'messages',
  pushLive: 'live',
};

export default function NotificationsSettings() {
  const {
    isSupported,
    isAndroidApp,
    permission,
    isSubscribed,
    loading,
    requestPermission,
    unsubscribeUser,
  } = usePushNotifications();
  const { t } = useTranslation();

  const [pushNotifications, setPushNotifications] = useState(true);
  const [pushGroups, setPushGroups] = useState<Record<PushGroupKey, boolean>>({
    pushLikes: true,
    pushComments: true,
    pushFollows: true,
    pushMessages: true,
    pushLive: true,
  });
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [newsletter, setNewsletter] = useState(true);
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
        setPushGroups((current) => {
          const next = { ...current };
          for (const key of PUSH_GROUPS) {
            if (typeof settings[key] === 'boolean') next[key] = settings[key];
          }
          return next;
        });
        if (settings.emailNotifications !== undefined) {
          setEmailNotifications(settings.emailNotifications);
        }
        if (settings.newsletter !== undefined) {
          setNewsletter(settings.newsletter);
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
        toast.success(t('settings.notifications.updated'));
      })
      .catch(() => {
        toast.error(t('settings.notifications.update_error'));
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
              label={t('settings.notifications_tab.native_alerts')}
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
                  aria-label={t('settings.notifications_tab.native_alerts')}
                  className="group/switch inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {/* The switch to look at, inside 44 px to touch. */}
                  <span
                    aria-hidden
                    className={`relative inline-flex h-6 w-11 items-center rounded-full border border-white/10 transition-colors group-focus-visible/switch:ring-2 group-focus-visible/switch:ring-brand-primary/50 ${
                      isSubscribed ? 'bg-brand-primary' : 'bg-white/10'
                    }`}
                  >
                    <span
                      className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
                        isSubscribed ? 'translate-x-5' : 'translate-x-0.5'
                      }`}
                    />
                  </span>
                </button>
              }
            >
              {isAndroidApp && (
                <p className="text-xs text-white/60 mt-2">
                  {t('settings.notifications_tab.android_unavailable')}
                </p>
              )}
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
              {/* On means paused: every push of this profile stops. */}
              <SettingsRow
                label={t('settings.notifications.pause_all')}
                description={t('settings.notifications.pause_all_desc')}
                control={
                  <Switch
                    checked={!pushNotifications}
                    onChange={(e) => {
                      setPushNotifications(!e.target.checked);
                      updateSetting('pushNotifications', !e.target.checked);
                    }}
                    aria-label={t('settings.notifications.pause_all')}
                  />
                }
              />
              {PUSH_GROUPS.map((key) => {
                const label = t(
                  `settings.notifications.push_group.${PUSH_GROUP_LABEL[key]}`,
                );
                return (
                  <SettingsRow
                    key={key}
                    label={label}
                    control={
                      <Switch
                        checked={pushGroups[key]}
                        disabled={!pushNotifications}
                        onChange={(e) => {
                          const on = e.target.checked;
                          setPushGroups((current) => ({
                            ...current,
                            [key]: on,
                          }));
                          updateSetting(key, on);
                        }}
                        aria-label={label}
                      />
                    }
                  />
                );
              })}
              <p className="px-4 py-3 text-xs text-white/50 leading-relaxed">
                {t('settings.notifications.push_always')}
              </p>
            </div>
          )}

          {settingsLoaded && (
            <div className="rounded-xl border border-white/5 bg-white/[0.02] divide-y divide-white/5">
              <SettingsRow
                label={t('settings.notifications.email_notifications')}
                description={t('settings.notifications.email_desc')}
                control={
                  <Switch
                    checked={emailNotifications}
                    onChange={(e) => {
                      setEmailNotifications(e.target.checked);
                      updateSetting('emailNotifications', e.target.checked);
                    }}
                    aria-label={t('settings.notifications.email_notifications')}
                  />
                }
              />
              <SettingsRow
                label={t('settings.notifications.newsletter')}
                description={t('settings.notifications.newsletter_desc')}
                control={
                  <Switch
                    checked={newsletter}
                    onChange={(e) => {
                      setNewsletter(e.target.checked);
                      updateSetting('newsletter', e.target.checked);
                    }}
                    aria-label={t('settings.notifications.newsletter')}
                  />
                }
              />
            </div>
          )}

          {/* Why notifications do or do not arrive: what the browser allows. */}
          <div>
            <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-3">
              <p className="text-xs text-white/40 mb-1">
                {t('settings.notifications_tab.status')}
              </p>
              <p className="text-sm font-medium text-white">
                {t(`settings.notifications_tab.permission.${permission}`, {
                  defaultValue: permission,
                })}
              </p>
            </div>
          </div>
        </div>
      </SettingsSection>
    </div>
  );
}
