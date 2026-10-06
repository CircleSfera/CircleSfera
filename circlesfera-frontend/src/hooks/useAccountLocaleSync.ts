import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { usersApi } from '../services/users.service';
import { useAuthStore } from '../stores/authStore';
import { toAppLocale } from '../utils/appLocale';

// Keeps the account language on the server equal to the language the app is
// shown in, so emails and notices arrive in the same language. Runs when the
// session is confirmed and whenever the language changes.
export function useAccountLocaleSync() {
  const { i18n } = useTranslation();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const isSessionChecked = useAuthStore((state) => state.isSessionChecked);
  const accountLocale = useAuthStore((state) => state.profile?.user?.locale);
  const appLocale = toAppLocale(i18n.resolvedLanguage ?? i18n.language);

  useEffect(() => {
    if (!isAuthenticated || !isSessionChecked) return;
    if (accountLocale === appLocale) return;
    usersApi
      .updateLocale(appLocale)
      .then(() => {
        const { profile, setProfile } = useAuthStore.getState();
        if (profile?.user) {
          setProfile({
            ...profile,
            user: { ...profile.user, locale: appLocale },
          });
        }
      })
      .catch(() => {
        // Not critical: the next app load or language change tries again.
      });
  }, [isAuthenticated, isSessionChecked, accountLocale, appLocale]);
}
