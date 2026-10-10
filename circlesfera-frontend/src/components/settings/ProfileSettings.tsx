import { Capacitor } from '@capacitor/core';
import { NativeBiometric } from '@capgo/capacitor-native-biometric';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import {
  BarChart3,
  Building2,
  Camera,
  Check,
  Loader2,
  MailWarning,
  Star,
  User,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { useDebounce } from '../../hooks/useDebounce';
import { authApi, profileApi, uploadApi } from '../../services';
import { useAuthStore } from '../../stores/authStore';
import { useSecurityStore } from '../../stores/securityStore';
import type { UpdateProfileDto } from '../../types';
import { apiErrorMessage } from '../../utils/apiErrorMessage';
import { logger } from '../../utils/logger';
import { pickNativeImage } from '../../utils/nativeFilePicker';
import { keepSavedOwnProfile } from '../../utils/ownProfileCache';
import { hasElitePlan } from '../../utils/plans';
import { PROFILE_COLOR_KEYS, PROFILE_COLORS } from '../../utils/profileColors';
import UserAvatar from '../UserAvatar';
import { Button, Input, Textarea } from '../ui';
import SettingsRow from './SettingsRow';
import SettingsSection from './SettingsSection';

export default function ProfileSettings() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const setProfile = useAuthStore((state) => state.setProfile);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { t } = useTranslation();

  const { data: profileData } = useQuery({
    queryKey: ['myProfile'],
    queryFn: () => profileApi.getMyProfile(),
  });
  const profile = profileData?.data;

  const [fullName, setFullName] = useState('');

  const isBiometricEnabled = useSecurityStore(
    (state) => state.isBiometricEnabled,
  );
  const setBiometricEnabled = useSecurityStore(
    (state) => state.setBiometricEnabled,
  );
  const [hasBiometric, setHasBiometric] = useState(false);

  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      NativeBiometric.isAvailable()
        .then((res) => {
          setHasBiometric(res.isAvailable);
        })
        .catch(() => setHasBiometric(false));
    }
  }, []);
  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');
  const [website, setWebsite] = useState('');
  const [accountType, setAccountType] = useState<
    'PERSONAL' | 'CREATOR' | 'BUSINESS'
  >('PERSONAL');
  // Colour of the profile page; null is the colour of the app.
  const [accentColor, setAccentColor] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [usernameStatus, setUsernameStatus] = useState<{
    checking: boolean;
    available: boolean | null;
    message: string;
  }>({ checking: false, available: null, message: '' });
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarSuccess, setAvatarSuccess] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarFailed, setAvatarFailed] = useState(false);

  const updateProfileMutation = useMutation({
    mutationFn: (data: UpdateProfileDto) => profileApi.updateProfile(data),
    onSuccess: (response) => {
      setProfile(keepSavedOwnProfile(queryClient, response));
      setFullName(response.data.fullName || '');
      setUsername(response.data.username || '');
      setBio(response.data.bio || '');
      setWebsite(response.data.website || '');
      if (response.data.username !== profile?.username) {
        navigate(`/${response.data.username}`);
      }
    },
  });

  useEffect(() => {
    if (profile && !initialized) {
      setFullName(profile.fullName || '');
      setUsername(profile.username || '');
      setBio(profile.bio || '');
      setWebsite(profile.website || '');
      setAccountType(profile.accountType || 'PERSONAL');
      setAccentColor(profile.accentColor ?? null);
      setInitialized(true);
    }
  }, [profile, initialized]);

  const checkUsernameAvailability = useCallback(
    async (newUsername: string) => {
      if (!newUsername || newUsername === profile?.username) {
        setUsernameStatus({ checking: false, available: null, message: '' });
        return;
      }
      if (newUsername.length < 3) {
        setUsernameStatus({
          checking: false,
          available: false,
          message: t('settings.profile.username_min'),
        });
        return;
      }
      setUsernameStatus({ checking: true, available: null, message: '' });
      try {
        const response = await profileApi.checkUsername(newUsername);
        // The server's text is English only; the app writes its own.
        setUsernameStatus({
          checking: false,
          available: response.data.available,
          message: t(
            response.data.available
              ? 'settings.profiles.form.username_available'
              : /^[a-zA-Z0-9._]{3,30}$/.test(newUsername)
                ? 'settings.profiles.form.username_taken'
                : 'settings.profiles.form.username_invalid',
            { username: newUsername },
          ),
        });
      } catch {
        setUsernameStatus({
          checking: false,
          available: false,
          message: t('settings.profile.username_check_error'),
        });
      }
    },
    [profile?.username, t],
  );

  const debouncedCheckUsername = useDebounce(checkUsernameAvailability, 500);

  const handleUsernameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/[^a-zA-Z0-9._]/g, '');
    setUsername(value);
    debouncedCheckUsername(value);
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Emptied so the same picture can be chosen again, to retry a failed
    // upload: a choice equal to the last one is not a change.
    e.target.value = '';
    // A picture that could not be saved is not shown, also when the device
    // finishes reading it after the upload has already failed.
    let failed = false;
    const reader = new FileReader();
    reader.onloadend = () => {
      if (!failed) setAvatarPreview(reader.result as string);
    };
    reader.readAsDataURL(file);
    setAvatarUploading(true);
    setAvatarSuccess(false);
    setAvatarFailed(false);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const response = await uploadApi.upload(formData);
      const avatarUrl = response.data.url;
      await profileApi.updateProfile({ avatar: avatarUrl });
      queryClient.invalidateQueries({ queryKey: ['myProfile'] });
      if (profile) setProfile({ ...profile, avatar: avatarUrl });
      setAvatarSuccess(true);
      setTimeout(() => setAvatarSuccess(false), 3000);
    } catch (error) {
      logger.error('Failed to upload avatar:', error);
      failed = true;
      setAvatarPreview(null);
      setAvatarFailed(true);
    } finally {
      setAvatarUploading(false);
    }
  };

  const canChooseColour = hasElitePlan(profile?.verificationLevel);

  const isDirty =
    initialized &&
    (fullName !== (profile?.fullName || '') ||
      username !== (profile?.username || '') ||
      bio !== (profile?.bio || '') ||
      website !== (profile?.website || '') ||
      accountType !== (profile?.accountType || 'PERSONAL') ||
      accentColor !== (profile?.accentColor ?? null));

  const canSubmit =
    isDirty &&
    profile?.emailConfirmed !== false &&
    (username === profile?.username || usernameStatus.available === true);

  const handleProfileSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    const data: UpdateProfileDto = {
      fullName,
      bio,
      accountType,
    };
    if (website && website.trim() !== '') {
      data.website = website;
    } else {
      data.website = null;
    }
    if (username !== profile?.username && usernameStatus.available) {
      data.username = username;
    }
    // Sent only when it changes: choosing a colour needs a plan, and a
    // profile without one must still be able to save everything else.
    if (accentColor !== (profile?.accentColor ?? null)) {
      data.accentColor = accentColor;
    }
    updateProfileMutation.mutate(data);
  };

  const resendVerificationMutation = useMutation({
    mutationFn: () => authApi.resendVerification(),
  });

  const accountTypes = [
    { id: 'PERSONAL' as const, icon: User },
    { id: 'CREATOR' as const, icon: Star },
    { id: 'BUSINESS' as const, icon: BarChart3 },
  ];

  return (
    <form onSubmit={handleProfileSubmit} className="space-y-5 max-w-xl">
      {profile && profile.emailConfirmed === false && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl border border-brand-secondary/30 bg-brand-secondary/10 text-brand-secondary">
          <div className="flex items-start sm:items-center gap-3">
            <MailWarning size={20} className="shrink-0 mt-0.5 sm:mt-0" />
            <div className="text-sm">
              <p className="font-semibold">
                {t('settings.profile.email_unverified_title')}
              </p>
              <p className="opacity-90 mt-0.5">
                {t('settings.profile.email_unverified_desc')}
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="danger"
            size="sm"
            className="shrink-0"
            disabled={resendVerificationMutation.isSuccess}
            isLoading={resendVerificationMutation.isPending}
            onClick={() => resendVerificationMutation.mutate()}
          >
            {resendVerificationMutation.isSuccess
              ? t('settings.profile.email_sent')
              : t('settings.profile.resend_email')}
          </Button>
        </div>
      )}
      <div className="flex items-center gap-4 p-4 rounded-xl border border-white/5 bg-white/2">
        <button
          type="button"
          className="relative group shrink-0"
          onClick={async (e) => {
            e.preventDefault();
            const handled = await pickNativeImage(fileInputRef);
            if (!handled) {
              fileInputRef.current?.click();
            }
          }}
          aria-label={t('settings.profile.change_avatar')}
        >
          <div className="w-14 h-14 rounded-full overflow-hidden border-2 border-white/10 group-hover:border-brand-primary/50 transition-colors bg-surface-raised">
            {avatarPreview ? (
              // The picture just chosen, read from the device. Shown as it
              // is: the avatar piece expects an address on a server.
              <img
                src={avatarPreview}
                alt=""
                className="w-full h-full object-cover"
              />
            ) : (
              <UserAvatar
                src={profile?.avatar || undefined}
                thumbnailUrl={profile?.thumbnailUrl}
                standardUrl={profile?.standardUrl}
                alt=""
                size="full"
                className="w-full h-full object-cover"
              />
            )}
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-full">
              <Camera size={18} className="text-white" />
            </div>
          </div>
          {avatarUploading && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60 rounded-full z-10">
              <Loader2 size={20} className="text-brand-primary animate-spin" />
            </div>
          )}
          {avatarSuccess && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="absolute -bottom-0.5 -right-0.5 bg-green-500 text-white p-0.5 rounded-full border-2 border-surface-elevated"
            >
              <Check size={12} strokeWidth={4} />
            </motion.div>
          )}
        </button>
        {/* Outside the button: a press on it would reach the button again,
            which cancels the file dialog and asks for it once more, without
            end. */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleAvatarChange}
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-white truncate">
            @{profile?.username}
          </p>
          <p className="text-xs text-white/50 mt-0.5">
            {t('settings.profile.avatar_desc')}
          </p>
          <button
            type="button"
            onClick={async (e) => {
              e.preventDefault();
              const handled = await pickNativeImage(fileInputRef);
              if (!handled) {
                fileInputRef.current?.click();
              }
            }}
            disabled={avatarUploading}
            className="mt-2 text-sm font-medium text-brand-primary hover:text-brand-primary/80 min-h-11 inline-flex items-center"
          >
            {avatarUploading
              ? t('settings.profile.uploading')
              : t('settings.profile.upload_new')}
          </button>
          {avatarFailed && (
            <p role="alert" className="text-xs text-brand-secondary">
              {t('settings.profile.avatar_error')}
            </p>
          )}
        </div>
      </div>

      <SettingsSection
        title={t('settings.profile.public_identity')}
        card={false}
      >
        <div className="space-y-4 rounded-xl border border-white/5 bg-white/2 p-4">
          <Input
            id="username"
            label={t('settings.profile.username')}
            type="text"
            value={username}
            onChange={handleUsernameChange}
            placeholder={t('settings.profile.placeholders.username')}
            className={
              usernameStatus.available === true
                ? 'border-green-500/30'
                : usernameStatus.available === false
                  ? 'border-brand-secondary/30'
                  : ''
            }
            error={
              usernameStatus.available === false
                ? usernameStatus.message
                : undefined
            }
            rightElement={
              <>
                {usernameStatus.checking && (
                  <Loader2
                    size={18}
                    className="text-brand-primary animate-spin"
                  />
                )}
                {!usernameStatus.checking &&
                  usernameStatus.available === true && (
                    <Check size={18} className="text-green-400" />
                  )}
                {!usernameStatus.checking &&
                  usernameStatus.available === false && (
                    <X size={18} className="text-brand-secondary" />
                  )}
              </>
            }
          />
          <Input
            id="fullName"
            label={t('settings.profile.display_name')}
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder={t('settings.profile.placeholders.name')}
          />
        </div>
      </SettingsSection>

      <SettingsSection
        title={t('settings.profile.presence_links')}
        card={false}
      >
        <div className="space-y-4 rounded-xl border border-white/5 bg-white/2 p-4">
          <div className="space-y-1.5">
            <div className="flex justify-between items-end">
              <label
                htmlFor="bio"
                className="block text-sm font-medium text-white/70"
              >
                {t('settings.profile.bio')}
              </label>
              <span
                className={`text-xs ${bio.length >= 140 ? 'text-brand-secondary' : 'text-white/40'}`}
              >
                {bio.length}/150
              </span>
            </div>
            <Textarea
              id="bio"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={3}
              maxLength={150}
              placeholder={t('settings.profile.placeholders.bio')}
              className="resize-none"
            />
          </div>
          <Input
            id="website"
            label={t('settings.profile.website')}
            type="url"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            placeholder={t('settings.profile.placeholders.website')}
          />
        </div>
      </SettingsSection>

      <SettingsSection title={t('settings.profile.colour.title')}>
        <div className="p-4">
          <p className="mb-3 text-sm text-white/60">
            {canChooseColour
              ? t('settings.profile.colour.hint')
              : t('settings.profile.colour.plan_hint')}
          </p>
          <div
            role="radiogroup"
            aria-label={t('settings.profile.colour.title')}
            className="flex flex-wrap gap-2"
          >
            {[null, ...PROFILE_COLOR_KEYS].map((key) => {
              const selected = accentColor === key;
              return (
                // biome-ignore lint/a11y/useSemanticElements: a swatch, not a native radio
                <button
                  key={key ?? 'default'}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  aria-label={t(
                    `settings.profile.colour.options.${key ?? 'default'}`,
                  )}
                  disabled={!canChooseColour && key !== null}
                  onClick={() => setAccentColor(key)}
                  className={`flex h-11 w-11 items-center justify-center rounded-full border-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60 disabled:cursor-not-allowed disabled:opacity-35 ${
                    selected ? 'border-white' : 'border-transparent'
                  }`}
                >
                  <span
                    className="h-8 w-8 rounded-full"
                    style={{
                      background: key ? PROFILE_COLORS[key].hex : '#884cff',
                    }}
                  />
                </button>
              );
            })}
          </div>
          {!canChooseColour && (
            <Link
              to="/pricing"
              className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-brand-primary hover:underline"
            >
              {t('creator.advanced.plan_cta')}
            </Link>
          )}
        </div>
      </SettingsSection>

      {profile?.verificationLevel === 'BUSINESS' && (
        <SettingsSection title={t('settings.profile.company.title')}>
          <div className="p-4">
            {profile.companyVerified ? (
              <p className="flex items-center gap-2 text-sm font-semibold text-white">
                <Building2
                  size={18}
                  className="text-brand-primary"
                  aria-hidden
                />
                {t('profile.company_verified')}
              </p>
            ) : (
              <>
                <p className="mb-3 text-sm text-white/60">
                  {t('settings.profile.company.hint')}
                </p>
                <Link
                  to="/creator/monetization"
                  className="inline-flex h-11 items-center justify-center rounded-xl border border-brand-primary/30 px-5 text-sm font-semibold text-white btn-gradient-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60"
                >
                  {t('settings.profile.company.verify')}
                </Link>
              </>
            )}
          </div>
        </SettingsSection>
      )}

      <SettingsSection title={t('settings.profile.account_type')}>
        {accountTypes.map((type) => {
          const selected = accountType === type.id;
          const Icon = type.icon;
          return (
            <SettingsRow
              key={type.id}
              as="button"
              label={t(`settings.profile.types.${type.id.toLowerCase()}.label`)}
              description={t(
                `settings.profile.types.${type.id.toLowerCase()}.desc`,
              )}
              onClick={() => {
                setAccountType(type.id);
              }}
              control={
                <span className="flex items-center gap-2">
                  <Icon
                    size={16}
                    className={
                      selected ? 'text-brand-primary' : 'text-white/40'
                    }
                    aria-hidden
                  />
                  {selected ? (
                    <span className="w-5 h-5 rounded-full bg-brand-primary flex items-center justify-center">
                      <Check size={12} className="text-white" strokeWidth={3} />
                    </span>
                  ) : (
                    <span className="w-5 h-5 rounded-full border border-white/20" />
                  )}
                </span>
              }
              className={selected ? 'bg-brand-primary/10' : ''}
            />
          );
        })}
      </SettingsSection>

      {hasBiometric && (
        <SettingsSection title={t('settings.security.title')}>
          <div className="space-y-2">
            <SettingsRow
              label={t('settings.security.biometric_label')}
              description={t('settings.security.biometric_desc')}
              control={
                <button
                  type="button"
                  role="switch"
                  aria-checked={isBiometricEnabled}
                  aria-label={t('settings.security.biometric_label')}
                  onClick={() => setBiometricEnabled(!isBiometricEnabled)}
                  className="inline-flex min-h-11 min-w-11 items-center justify-center"
                >
                  <span
                    className={`w-11 h-6 rounded-full transition-colors relative ${isBiometricEnabled ? 'bg-brand-primary' : 'bg-white/20'}`}
                  >
                    <span
                      className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${isBiometricEnabled ? 'translate-x-5' : ''}`}
                    />
                  </span>
                </button>
              }
            />
          </div>
        </SettingsSection>
      )}

      <AnimatePresence>
        {updateProfileMutation.isSuccess && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="flex items-center gap-2 text-green-400 text-sm bg-green-500/10 border border-green-500/20 rounded-lg p-3"
          >
            <Check size={16} />
            <span className="font-medium text-sm">
              {t('settings.profile.success')}
            </span>
          </motion.div>
        )}
        {updateProfileMutation.isError && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="flex items-center gap-2 text-brand-secondary text-sm bg-brand-secondary/10 border border-brand-secondary/20 rounded-lg p-3"
          >
            <X size={16} className="shrink-0" />
            <span className="font-medium text-sm">
              {apiErrorMessage(
                updateProfileMutation.error,
                t,
                'settings.profile.error_saving',
              )}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      <Button
        type="submit"
        variant="primary"
        disabled={!canSubmit}
        isLoading={updateProfileMutation.isPending}
        className="w-full min-h-11 text-sm font-semibold"
      >
        {t('settings.profile.save')}
      </Button>
    </form>
  );
}
