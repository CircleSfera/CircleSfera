import { useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../stores/authStore';

// Switching Profile reissues the session cookies for the other Profile. The
// app then reloads from the home feed, so every query, socket and cached API
// response starts again as the new Profile instead of mixing two Profiles.
export function reloadAsNewProfile() {
  window.location.assign('/');
}

export function useProfileSwitch() {
  const { t } = useTranslation();
  const switchProfile = useAuthStore((state) => state.switchProfile);

  const mutation = useMutation({
    mutationFn: async (profileId: string) => {
      await switchProfile?.(profileId);
    },
    onSuccess: () => reloadAsNewProfile(),
    onError: () => {
      toast.error(t('settings.profiles.switch_failed'));
    },
  });

  return {
    switchTo: mutation.mutate,
    switchToAsync: mutation.mutateAsync,
    isSwitching: mutation.isPending,
    switchingId: mutation.isPending ? mutation.variables : undefined,
  };
}
