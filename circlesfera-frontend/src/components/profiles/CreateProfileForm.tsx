import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, Loader2, X } from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { useProfileSwitch } from '../../hooks/useProfileSwitch';
import { type ProfileAccountType, profileApi } from '../../services';
import { Button, Input } from '../ui';
import { MY_PROFILES_QUERY_KEY } from './OwnedProfileList';

// Same rule the backend applies to every username.
const USERNAME_PATTERN = /^[a-zA-Z0-9._]{3,30}$/;
const FULL_NAME_MAX = 50;
const ACCOUNT_TYPES: ProfileAccountType[] = ['PERSONAL', 'CREATOR', 'BUSINESS'];

type Availability = 'idle' | 'invalid' | 'checking' | 'available' | 'taken';

function useUsernameAvailability(username: string): Availability {
  const [state, setState] = useState<Availability>('idle');

  useEffect(() => {
    if (!username) {
      setState('idle');
      return;
    }
    if (!USERNAME_PATTERN.test(username)) {
      setState('invalid');
      return;
    }
    setState('checking');
    let cancelled = false;
    const timer = setTimeout(() => {
      profileApi
        .checkUsername(username)
        .then(({ data }) => {
          if (!cancelled) setState(data.available ? 'available' : 'taken');
        })
        .catch(() => {
          // The create request validates again; do not block on a failed check.
          if (!cancelled) setState('idle');
        });
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [username]);

  return state;
}

// Creates another Profile under the signed-in account and switches to it.
// onCancel also closes the form once the Profile is created.
export default function CreateProfileForm({
  onCancel,
}: {
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [username, setUsername] = useState('');
  const [fullName, setFullName] = useState('');
  const [accountType, setAccountType] =
    useState<ProfileAccountType>('PERSONAL');
  const availability = useUsernameAvailability(username.trim());
  const queryClient = useQueryClient();
  const { switchTo } = useProfileSwitch();

  // Creating and switching fail separately: once the Profile exists, a
  // failed switch leaves it listed (the switch reports its own error).
  const create = useMutation({
    mutationFn: async () =>
      (
        await profileApi.createProfile({
          username: username.trim(),
          fullName: fullName.trim() || undefined,
          accountType,
        })
      ).data,
    onSuccess: (profile) => {
      void queryClient.invalidateQueries({ queryKey: MY_PROFILES_QUERY_KEY });
      onCancel();
      switchTo(profile.id);
    },
    onError: () => {
      toast.error(t('settings.profiles.form.failed'));
    },
  });

  const canSubmit =
    availability === 'available' && !create.isPending && !create.isSuccess;

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (canSubmit) create.mutate();
  };

  const trimmed = username.trim();
  const usernameMessage: Record<Availability, string> = {
    idle: t('settings.profiles.form.username_hint'),
    invalid: t('settings.profiles.form.username_invalid'),
    checking: t('settings.profiles.form.username_checking'),
    available: t('settings.profiles.form.username_available', {
      username: trimmed,
    }),
    taken: t('settings.profiles.form.username_taken', { username: trimmed }),
  };
  const usernameError =
    availability === 'invalid' || availability === 'taken'
      ? usernameMessage[availability]
      : undefined;

  return (
    <form onSubmit={onSubmit} className="space-y-5 p-4" noValidate>
      <div>
        <h3 className="text-base font-semibold text-white">
          {t('settings.profiles.form.title')}
        </h3>
        <p className="text-xs text-white/50 mt-1 leading-relaxed">
          {t('settings.profiles.form.description')}
        </p>
      </div>

      <div className="space-y-1.5">
        <Input
          label={t('settings.profiles.form.username')}
          value={username}
          onChange={(e) => setUsername(e.target.value.replace(/\s/g, ''))}
          placeholder={t('settings.profiles.form.username_placeholder')}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          maxLength={30}
          required
          error={usernameError}
          // Input links its own error text; otherwise point at the status line.
          {...(usernameError
            ? {}
            : { 'aria-describedby': 'new-profile-username-status' })}
          rightElement={<AvailabilityIcon state={availability} />}
        />
        {usernameError ? null : (
          <p
            id="new-profile-username-status"
            aria-live="polite"
            className={`text-xs px-0.5 ${
              availability === 'available'
                ? 'text-brand-primary'
                : 'text-white/50'
            }`}
          >
            {usernameMessage[availability]}
          </p>
        )}
      </div>

      <Input
        label={t('settings.profiles.form.full_name')}
        value={fullName}
        onChange={(e) => setFullName(e.target.value)}
        placeholder={t('settings.profiles.form.full_name_placeholder')}
        maxLength={FULL_NAME_MAX}
        autoComplete="off"
      />

      <fieldset className="space-y-2">
        <legend className="block text-xs font-bold text-gray-400/80 uppercase tracking-widest mb-1 px-0.5">
          {t('settings.profiles.form.type')}
        </legend>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {ACCOUNT_TYPES.map((type) => {
            const key = type.toLowerCase();
            const selected = accountType === type;
            return (
              <label
                key={type}
                className={`flex items-center gap-3 min-h-12 px-4 py-2 rounded-xl border cursor-pointer transition-colors ${
                  selected
                    ? 'border-brand-primary/60 bg-brand-primary/10'
                    : 'border-white/10 bg-white/5 hover:bg-white/10'
                }`}
              >
                <input
                  type="radio"
                  name="new-profile-type"
                  value={type}
                  checked={selected}
                  onChange={() => setAccountType(type)}
                  className="sr-only"
                />
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-medium text-white">
                    {t(`settings.profile.types.${key}.label`)}
                  </span>
                  <span className="block text-xs text-white/50">
                    {t(`settings.profile.types.${key}.desc`)}
                  </span>
                </span>
                {selected ? (
                  <Check
                    size={16}
                    className="text-brand-primary shrink-0"
                    aria-hidden
                  />
                ) : null}
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
        <Button
          type="button"
          variant="ghost"
          size="md"
          onClick={onCancel}
          disabled={create.isPending}
        >
          {t('settings.profiles.form.cancel')}
        </Button>
        <Button
          type="submit"
          size="lg"
          disabled={!canSubmit}
          isLoading={create.isPending}
        >
          {create.isPending
            ? t('settings.profiles.form.submitting')
            : t('settings.profiles.form.submit')}
        </Button>
      </div>
    </form>
  );
}

function AvailabilityIcon({ state }: { state: Availability }) {
  if (state === 'checking') {
    return (
      <Loader2 size={16} className="animate-spin text-white/40" aria-hidden />
    );
  }
  if (state === 'available') {
    return <Check size={16} className="text-brand-primary" aria-hidden />;
  }
  if (state === 'taken' || state === 'invalid') {
    return <X size={16} className="text-brand-secondary" aria-hidden />;
  }
  return null;
}
