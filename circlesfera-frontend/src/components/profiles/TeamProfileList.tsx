import { useQuery } from '@tanstack/react-query';
import { Check, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useProfileSwitch } from '../../hooks/useProfileSwitch';
import { teamApi } from '../../services/team.service';
import { useAuthStore } from '../../stores/authStore';
import UserAvatar from '../UserAvatar';

export const TEAM_PROFILES_QUERY_KEY = ['teamProfiles'] as const;

// The Business Profiles the person works on as a team member, under their
// own Profiles. Nothing is shown when there are none.
export default function TeamProfileList() {
  const { t } = useTranslation();
  const currentId = useAuthStore((state) => state.profile?.id);
  const { data: profiles } = useQuery({
    queryKey: TEAM_PROFILES_QUERY_KEY,
    queryFn: () => teamApi.profiles(),
  });
  const { switchTo, isSwitching, switchingId } = useProfileSwitch();

  if (!profiles?.length) return null;

  return (
    <section
      className="border-t border-white/5"
      aria-label={t('settings.team.switcher_title')}
    >
      <p className="px-4 pt-3 pb-1 text-xs font-medium text-white/50">
        {t('settings.team.switcher_title')}
      </p>
      <ul className="divide-y divide-white/5">
        {profiles.map((profile) => {
          const isCurrent = profile.id === currentId;
          const content = (
            <>
              <UserAvatar
                src={profile.avatar || undefined}
                alt=""
                size="md"
                className="w-10 h-10 rounded-full object-cover shrink-0"
              />
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-semibold text-white truncate">
                  @{profile.username}
                </span>
                <span className="block text-xs text-white/50 truncate">
                  {t(`settings.team.role.${profile.memberRole}`)}
                </span>
              </span>
              {switchingId === profile.id ? (
                <Loader2
                  size={18}
                  className="animate-spin text-white/60 shrink-0"
                  aria-label={t('settings.profiles.switching')}
                />
              ) : isCurrent ? (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-brand-primary-text shrink-0">
                  <Check size={16} aria-hidden />
                  {t('settings.profiles.current')}
                </span>
              ) : null}
            </>
          );
          const rowClass =
            'flex items-center gap-3 px-4 py-2 min-h-14 w-full text-left';
          return (
            <li key={profile.id}>
              {isCurrent ? (
                <div className={rowClass} aria-current="true">
                  {content}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => switchTo(profile.id)}
                  disabled={isSwitching}
                  aria-label={t('settings.profiles.switch_a11y', {
                    username: profile.username,
                  })}
                  className={`${rowClass} hover:bg-white/5 active:bg-white/10 transition-colors disabled:opacity-50`}
                >
                  {content}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
