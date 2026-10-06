import { useQuery } from '@tanstack/react-query';
import { Check, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useProfileSwitch } from '../../hooks/useProfileSwitch';
import { type OwnedProfile, profileApi } from '../../services';
import { useAuthStore } from '../../stores/authStore';
import UserAvatar from '../UserAvatar';
import { Button } from '../ui';

export const MY_PROFILES_QUERY_KEY = ['myProfiles'] as const;

export function useMyProfiles() {
  return useQuery({
    queryKey: MY_PROFILES_QUERY_KEY,
    queryFn: async () => (await profileApi.getMyProfiles()).data,
  });
}

// The Profiles of the signed-in account. Tapping another usable Profile
// switches to it; banned or suspended Profiles are listed but cannot be used.
export default function OwnedProfileList() {
  const { t } = useTranslation();
  const currentId = useAuthStore((state) => state.profile?.id);
  const { data: profiles, isLoading, isError, refetch } = useMyProfiles();
  const { switchTo, isSwitching, switchingId } = useProfileSwitch();

  if (isLoading) {
    return (
      <div className="flex justify-center py-6" aria-busy="true">
        <Loader2 size={20} className="animate-spin text-white/40" aria-hidden />
      </div>
    );
  }

  if (isError || !profiles) {
    return (
      <div className="flex flex-col items-center gap-3 py-6 px-4 text-center">
        <p className="text-sm text-white/60">
          {t('settings.profiles.load_failed')}
        </p>
        <Button variant="secondary" size="md" onClick={() => void refetch()}>
          {t('settings.profiles.retry')}
        </Button>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-white/5">
      {profiles.map((profile) => (
        <li key={profile.id}>
          <ProfileRow
            profile={profile}
            isCurrent={profile.id === currentId}
            isSwitchingHere={switchingId === profile.id}
            disabled={isSwitching}
            onSwitch={() => switchTo(profile.id)}
          />
        </li>
      ))}
    </ul>
  );
}

function ProfileRow({
  profile,
  isCurrent,
  isSwitchingHere,
  disabled,
  onSwitch,
}: {
  profile: OwnedProfile;
  isCurrent: boolean;
  isSwitchingHere: boolean;
  disabled: boolean;
  onSwitch: () => void;
}) {
  const { t } = useTranslation();
  const restriction = profile.isAccountBanned
    ? t('settings.profiles.banned')
    : profile.isSuspended
      ? t('settings.profiles.suspended')
      : null;
  const canSwitch = !isCurrent && !restriction;

  const content = (
    <>
      <UserAvatar
        src={profile.avatar || undefined}
        thumbnailUrl={profile.thumbnailUrl}
        standardUrl={profile.standardUrl}
        alt=""
        size="md"
        className="w-10 h-10 rounded-full object-cover shrink-0"
      />
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-semibold text-white truncate">
          @{profile.username}
        </span>
        <span className="block text-xs text-white/50 truncate">
          {[
            profile.fullName,
            t(
              `settings.profile.types.${profile.accountType.toLowerCase()}.label`,
            ),
          ]
            .filter(Boolean)
            .join(' · ')}
        </span>
      </span>
      {isSwitchingHere ? (
        <Loader2
          size={18}
          className="animate-spin text-white/60 shrink-0"
          aria-label={t('settings.profiles.switching')}
        />
      ) : isCurrent ? (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-brand-primary shrink-0">
          <Check size={16} aria-hidden />
          {t('settings.profiles.current')}
        </span>
      ) : restriction ? (
        <span className="px-2 py-0.5 rounded-full bg-brand-secondary/10 border border-brand-secondary/30 text-[11px] font-medium text-brand-secondary shrink-0">
          {restriction}
        </span>
      ) : null}
    </>
  );

  const rowClass =
    'flex items-center gap-3 px-4 py-2 min-h-14 w-full text-left';

  if (!canSwitch) {
    return (
      <div
        className={`${rowClass} ${restriction ? 'opacity-60' : ''}`}
        aria-current={isCurrent ? 'true' : undefined}
      >
        {content}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onSwitch}
      disabled={disabled}
      aria-label={t('settings.profiles.switch_a11y', {
        username: profile.username,
      })}
      className={`${rowClass} hover:bg-white/5 active:bg-white/10 transition-colors disabled:opacity-50`}
    >
      {content}
    </button>
  );
}
