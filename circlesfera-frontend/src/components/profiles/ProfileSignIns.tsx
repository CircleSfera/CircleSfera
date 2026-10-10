import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, Loader2 } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import {
  type ProfileSignIn,
  SIGN_INS_QUERY_KEY,
  signInsApi,
} from '../../services/signIns.service';
import { type SignInErrorField, signInError } from '../../utils/signInErrors';
import SettingsSection from '../settings/SettingsSection';
import { Button, Dialog, Input, Select } from '../ui';

const PASSWORD_MIN = 8;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function useProfileSignIns() {
  return useQuery({
    queryKey: SIGN_INS_QUERY_KEY,
    queryFn: () => signInsApi.list().then((res) => res.data),
  });
}

/**
 * Settings → Profiles: how each Profile signs in. A Profile shares the email
 * and password of another one, or has its own; the identity, the payments
 * and the payouts behind are the same either way.
 */
export default function ProfileSignIns() {
  const { t } = useTranslation();
  const { data: profiles, isLoading, isError, refetch } = useProfileSignIns();
  const [changing, setChanging] = useState<ProfileSignIn | null>(null);

  // The sign-ins a Profile could go back to: those of the other Profiles.
  const others = (profile: ProfileSignIn) => {
    const seen = new Map<string, { id: string; email: string }>();
    for (const one of profiles ?? []) {
      if (one.signIn && one.signIn.id !== profile.signIn?.id) {
        seen.set(one.signIn.id, one.signIn);
      }
    }
    return [...seen.values()];
  };

  return (
    <SettingsSection
      title={t('settings.signIns.title')}
      description={t('settings.signIns.description')}
    >
      {isLoading ? (
        <div className="flex justify-center py-6" aria-busy="true">
          <Loader2
            size={20}
            className="animate-spin text-white/40"
            aria-hidden
          />
        </div>
      ) : isError || !profiles ? (
        <div className="flex flex-col items-center gap-3 px-4 py-6 text-center">
          <p className="text-sm text-white/60">
            {t('settings.signIns.load_failed')}
          </p>
          <Button variant="secondary" size="md" onClick={() => void refetch()}>
            {t('settings.profiles.retry')}
          </Button>
        </div>
      ) : (
        <ul className="divide-y divide-white/5">
          {profiles.map((profile) => {
            const signIn = profile.signIn;
            // Its own sign-in can be shared again only if there is another
            // one to go to; a shared one can always become its own.
            const canChange =
              !!signIn && (signIn.shared || others(profile).length > 0);
            return (
              <li
                key={profile.profileId}
                className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-white">
                    @{profile.username}
                  </p>
                  <p className="mt-0.5 break-all text-sm text-white/70">
                    {signIn?.email}
                  </p>
                  <p className="mt-1 text-xs text-white/50">
                    {signIn?.shared
                      ? t('settings.signIns.shared')
                      : t('settings.signIns.own')}
                    {signIn && !signIn.emailVerified
                      ? ` · ${t('settings.signIns.unverified')}`
                      : ''}
                  </p>
                </div>
                {canChange ? (
                  <Button
                    variant="secondary"
                    size="md"
                    className="min-h-11 w-full shrink-0 gap-2 sm:w-auto"
                    onClick={() => setChanging(profile)}
                  >
                    <KeyRound size={16} aria-hidden />
                    {signIn?.shared
                      ? t('settings.signIns.give_own')
                      : t('settings.signIns.share_again')}
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      <Dialog
        isOpen={!!changing}
        onClose={() => setChanging(null)}
        title={
          changing?.signIn?.shared
            ? t('settings.signIns.own_form.title', {
                username: changing.username,
              })
            : t('settings.signIns.share_form.title', {
                username: changing?.username,
              })
        }
        maxWidth="md"
      >
        {changing?.signIn?.shared ? (
          <OwnSignInForm profile={changing} onDone={() => setChanging(null)} />
        ) : changing ? (
          <ShareSignInForm
            profile={changing}
            targets={others(changing)}
            onDone={() => setChanging(null)}
          />
        ) : null}
      </Dialog>
    </SettingsSection>
  );
}

type FieldErrors = Partial<Record<SignInErrorField, string>>;

// What the two forms share: what happens after the server answers.
function useSignInChange<Input>(
  change: (input: Input) => Promise<unknown>,
  doneMessage: string,
  onDone: () => void,
) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [errors, setErrors] = useState<FieldErrors>({});
  const mutation = useMutation({
    mutationFn: change,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: SIGN_INS_QUERY_KEY });
      toast.success(doneMessage);
      onDone();
    },
    onError: (error) => {
      const { field, message } = signInError(error, t);
      setErrors({ [field]: message });
    },
  });
  return { errors, setErrors, mutation };
}

function OwnSignInForm({
  profile,
  onDone,
}: {
  profile: ProfileSignIn;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const tr = (key: string) => t(`settings.signIns.own_form.${key}`);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const { errors, setErrors, mutation } = useSignInChange(
    signInsApi.giveOwn,
    t('settings.signIns.own_form.done', { username: profile.username }),
    onDone,
  );

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const found: FieldErrors = {};
    if (!EMAIL_PATTERN.test(email.trim())) found.email = tr('email_invalid');
    if (password.length < PASSWORD_MIN) found.form = tr('password_short');
    if (!currentPassword) {
      found.currentPassword = t('settings.signIns.current_password_required');
    }
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    mutation.mutate({
      profileId: profile.profileId,
      email: email.trim(),
      password,
      currentPassword,
    });
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4 p-4" noValidate>
      <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed text-white/70">
        <li>{tr('effect_new')}</li>
        <li>{tr('effect_others')}</li>
        <li>{tr('effect_notices')}</li>
        <li>{tr('effect_security')}</li>
      </ul>
      <Input
        id="own-sign-in-email"
        type="email"
        label={tr('email')}
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        maxLength={254}
        required
        error={errors.email}
      />
      <Input
        id="own-sign-in-password"
        type="password"
        label={tr('password')}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        autoComplete="new-password"
        maxLength={128}
        required
        error={errors.form === tr('password_short') ? errors.form : undefined}
      />
      <CurrentPasswordField
        value={currentPassword}
        onChange={setCurrentPassword}
        error={errors.currentPassword}
      />
      <FormError
        message={errors.form === tr('password_short') ? undefined : errors.form}
      />
      <FormButtons
        onCancel={onDone}
        submitLabel={tr('submit')}
        isPending={mutation.isPending}
      />
    </form>
  );
}

function ShareSignInForm({
  profile,
  targets,
  onDone,
}: {
  profile: ProfileSignIn;
  targets: { id: string; email: string }[];
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const tr = (key: string) => t(`settings.signIns.share_form.${key}`);
  const [signInId, setSignInId] = useState(targets[0]?.id ?? '');
  const [currentPassword, setCurrentPassword] = useState('');
  const { errors, setErrors, mutation } = useSignInChange(
    signInsApi.share,
    t('settings.signIns.share_form.done', { username: profile.username }),
    onDone,
  );

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!currentPassword) {
      setErrors({
        currentPassword: t('settings.signIns.current_password_required'),
      });
      return;
    }
    setErrors({});
    mutation.mutate({
      profileId: profile.profileId,
      signInId,
      currentPassword,
    });
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4 p-4" noValidate>
      <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed text-white/70">
        <li>
          {t('settings.signIns.share_form.effect_stops', {
            email: profile.signIn?.email,
          })}
        </li>
        <li>{tr('effect_sessions')}</li>
        <li>{tr('effect_security')}</li>
      </ul>
      <Select
        id="share-sign-in-target"
        label={tr('target')}
        value={signInId}
        onChange={(e) => setSignInId(e.target.value)}
      >
        {targets.map((target) => (
          <option
            key={target.id}
            value={target.id}
            className="bg-surface-raised"
          >
            {target.email}
          </option>
        ))}
      </Select>
      <CurrentPasswordField
        value={currentPassword}
        onChange={setCurrentPassword}
        error={errors.currentPassword}
      />
      <FormError message={errors.form} />
      <FormButtons
        onCancel={onDone}
        submitLabel={tr('submit')}
        isPending={mutation.isPending}
        danger
      />
    </form>
  );
}

// The password the person is signed in with: a session alone is not enough
// to create or remove a way to sign in.
function CurrentPasswordField({
  value,
  onChange,
  error,
}: {
  value: string;
  onChange: (value: string) => void;
  error?: string;
}) {
  const { t } = useTranslation();
  return (
    <div className="space-y-1.5">
      <Input
        id="sign-in-current-password"
        type="password"
        label={t('settings.signIns.current_password')}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="current-password"
        maxLength={128}
        required
        error={error}
      />
      {error ? null : (
        <p className="px-0.5 text-xs text-white/50">
          {t('settings.signIns.current_password_hint')}
        </p>
      )}
    </div>
  );
}

function FormError({ message }: { message?: string }) {
  return message ? (
    <p className="text-sm text-brand-secondary" role="alert">
      {message}
    </p>
  ) : null;
}

function FormButtons({
  onCancel,
  submitLabel,
  isPending,
  danger = false,
}: {
  onCancel: () => void;
  submitLabel: string;
  isPending: boolean;
  danger?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <Button
        type="button"
        variant="ghost"
        size="md"
        className="min-h-11"
        onClick={onCancel}
        disabled={isPending}
      >
        {t('common.cancel')}
      </Button>
      <Button
        type="submit"
        variant={danger ? 'danger' : 'primary'}
        size="md"
        className="min-h-11"
        isLoading={isPending}
      >
        {submitLabel}
      </Button>
    </div>
  );
}
