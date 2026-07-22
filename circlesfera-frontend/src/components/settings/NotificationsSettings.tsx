import { AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { usePushNotifications } from '../../hooks/usePushNotifications';

export default function NotificationsSettings() {
  const {
    permission,
    isSubscribed,
    loading,
    requestPermission,
    unsubscribeUser,
  } = usePushNotifications();
  const { t } = useTranslation();

  return (
    <div className="max-w-xl space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h2 className="text-xl font-black text-white tracking-tighter">
          {t('settings.notifications_tab.title')}
        </h2>
        <p className="text-gray-300 text-sm font-medium mt-1 uppercase tracking-wide italic opacity-60">
          {t('settings.notifications_tab.subtitle')}
        </p>
      </div>

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
