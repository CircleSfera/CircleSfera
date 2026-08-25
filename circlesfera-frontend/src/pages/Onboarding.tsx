import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Camera, Check, ChevronRight, UserPlus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import logoSrc from '../assets/logo.png';
import { ErrorState } from '../components/ErrorEmptyStates';
import { LoadingSpinner } from '../components/LoadingStates';
import UserAvatar from '../components/UserAvatar';
import { Button, Textarea } from '../components/ui';
import VerificationBadge from '../components/VerificationBadge';
import { followsApi, profileApi, usersApi } from '../services';
import { useAuthStore } from '../stores/authStore';
import type { SuggestedUser } from '../types';
import { pickNativeImage } from '../utils/nativeFilePicker';
import { OnboardingEmptyCircle } from './OnboardingEmptyCircle';

export default function Onboarding() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const profile = useAuthStore((state) => state.profile);
  const setProfile = useAuthStore((state) => state.setProfile);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<1 | 2>(1);
  const [bio, setBio] = useState('');
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [followedUsernames, setFollowedUsernames] = useState<Set<string>>(
    () => new Set(),
  );

  useEffect(() => {
    return () => {
      if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    };
  }, [avatarPreview]);

  const {
    data: suggestions,
    isLoading: isLoadingSuggestions,
    isError: isSuggestionsError,
    refetch: refetchSuggestions,
  } = useQuery({
    queryKey: ['suggestions'],
    queryFn: async () => {
      const res = await usersApi.getSuggestions(6);
      return res.data;
    },
    enabled: step === 2,
  });

  const updateProfileMutation = useMutation({
    mutationFn: async () => {
      await profileApi.updateProfile({
        bio,
      });
      await usersApi.updateSettings({
        isOnboarded: true,
      });
    },
    onSuccess: async () => {
      try {
        const { data } = await profileApi.getMyProfile();
        setProfile(data);
        queryClient.invalidateQueries({ queryKey: ['profile'] });
        navigate('/');
        toast.success(t('onboarding.success', 'Welcome to CircleSfera!'));
      } catch {
        toast.error(t('onboarding.reload_error', 'Failed to reload profile'));
      }
    },
    onError: () => {
      toast.error(t('onboarding.error', 'Something went wrong.'));
    },
  });

  const followMutation = useMutation({
    mutationFn: (username: string) => followsApi.toggle(username),
    onMutate: (username) => {
      setFollowedUsernames((prev) => {
        const next = new Set(prev);
        next.add(username);
        return next;
      });
    },
    onError: (_err, username) => {
      setFollowedUsernames((prev) => {
        const next = new Set(prev);
        next.delete(username);
        return next;
      });
      toast.error(
        t('onboarding.follow_error', "Couldn't follow this account."),
      );
    },
    onSuccess: (_data, username) => {
      queryClient.invalidateQueries({ queryKey: ['follow', username] });
      toast.success(t('onboarding.followed', 'Followed successfully'));
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarPreview(URL.createObjectURL(file));
  };

  const handleFinish = () => {
    updateProfileMutation.mutate();
  };

  const displayName = profile?.username || t('onboarding.creator', 'Creator');

  return (
    <div className="min-h-dvh flex items-center justify-center p-4">
      <div className="relative z-10 w-full max-w-md">
        <div className="flex items-center justify-center gap-2.5 mb-6">
          <img
            src={logoSrc}
            alt=""
            className="h-8 w-auto object-contain drop-shadow-[0_0_12px_rgba(var(--brand-primary-rgb),0.4)]"
            aria-hidden
          />
          <span className="brand-wordmark text-2xl font-black tracking-tight">
            CircleSfera
          </span>
        </div>

        <div
          className="glass-panel rounded-2xl p-5 sm:p-6 relative overflow-hidden border border-white/10"
          aria-live="polite"
        >
          <div className="absolute top-0 left-0 right-0 h-1 bg-linear-to-r from-brand-secondary via-brand-primary to-brand-blue opacity-90" />

          <div
            className="flex justify-center mb-5"
            role="tablist"
            aria-label={t('onboarding.steps_label', 'Onboarding steps')}
          >
            <div className="inline-flex items-center p-1 rounded-full bg-black/75 border border-white/12 gap-1">
              {([1, 2] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  role="tab"
                  aria-selected={step === tab}
                  onClick={() => {
                    if (tab === 1 || step === 2) setStep(tab);
                  }}
                  className={`relative px-4 min-h-11 text-xs font-bold rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60 ${
                    step === tab
                      ? 'text-white bg-white/15 border border-white/20'
                      : 'text-white/50 hover:text-white'
                  }`}
                >
                  {tab === 1
                    ? t('onboarding.step_profile', 'Profile')
                    : t('onboarding.step_circle', 'Circle')}
                </button>
              ))}
            </div>
          </div>

          {step === 1 ? (
            <div>
              <div className="text-center mb-5">
                <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white mb-1.5">
                  {t('onboarding.welcome', {
                    username: displayName,
                    defaultValue: `Welcome, ${displayName}!`,
                  })}
                </h1>
                <p className="text-white/50 text-sm font-medium">
                  {t(
                    'onboarding.step1_subtitle',
                    'Set up your profile so people know who you are.',
                  )}
                </p>
              </div>

              <div className="flex flex-col items-center mb-5">
                <label
                  className="relative cursor-pointer group block focus-within:ring-2 focus-within:ring-brand-primary/60 rounded-full"
                  onClick={async (e) => {
                    e.preventDefault();
                    const handled = await pickNativeImage(fileInputRef);
                    if (!handled) {
                      fileInputRef.current?.click();
                    }
                  }}
                  onKeyDown={async (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      const handled = await pickNativeImage(fileInputRef);
                      if (!handled) {
                        fileInputRef.current?.click();
                      }
                    }
                  }}
                >
                  <div className="w-24 h-24 rounded-full overflow-hidden bg-white/5 border border-white/10 group-hover:border-brand-primary/50 transition-colors relative">
                    {avatarPreview || profile?.avatar ? (
                      <img
                        src={avatarPreview || profile?.avatar || ''}
                        alt={t('onboarding.avatar_alt', 'Your avatar')}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-white/25">
                        <UserPlus size={32} strokeWidth={1.5} aria-hidden />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <Camera className="text-white" size={20} aria-hidden />
                    </div>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={handleFileChange}
                    aria-label={t('onboarding.change_avatar', 'Change photo')}
                  />
                </label>
              </div>

              <div className="mb-5">
                <label
                  htmlFor="bio-input"
                  className="block text-xs font-bold text-white/45 uppercase tracking-widest mb-1 px-1"
                >
                  {t('onboarding.bio_label', 'Bio')}
                </label>
                <Textarea
                  id="bio-input"
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder={t(
                    'onboarding.bio_placeholder',
                    'Tell the world about you...',
                  )}
                  maxLength={160}
                  className="h-24 resize-none"
                />
                <div className="text-right text-[10px] text-white/40 font-medium mt-1">
                  {bio.length}/160
                </div>
              </div>

              <Button
                type="button"
                onClick={() => setStep(2)}
                size="lg"
                data-testid="onboarding-continue"
                className="w-full font-bold"
              >
                {t('onboarding.continue', 'Continue')}
                <ChevronRight size={16} aria-hidden />
              </Button>
            </div>
          ) : (
            <div>
              <div className="text-center mb-5">
                <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white mb-1.5">
                  {t('onboarding.find_circle', 'Find your circle')}
                </h1>
                <p className="text-white/50 text-sm font-medium">
                  {!isLoadingSuggestions &&
                  !isSuggestionsError &&
                  !suggestions?.length
                    ? t(
                        'onboarding.find_circle_empty_subtitle',
                        'No one to follow yet — you can skip this step.',
                      )
                    : t(
                        'onboarding.find_circle_subtitle',
                        'Follow a few creators to start your feed.',
                      )}
                </p>
              </div>

              <div className="mb-5 max-h-[50vh] overflow-y-auto rounded-xl border border-white/8 bg-black/40">
                {isLoadingSuggestions ? (
                  <div
                    className="flex flex-col items-center justify-center gap-3 py-16"
                    aria-busy="true"
                  >
                    <LoadingSpinner size="sm" />
                    <span className="text-xs font-semibold uppercase tracking-wider text-white/40">
                      {t('onboarding.curating', 'Finding creators...')}
                    </span>
                  </div>
                ) : isSuggestionsError ? (
                  <ErrorState
                    title={t(
                      'onboarding.suggestions_error_title',
                      "Couldn't load suggestions",
                    )}
                    message={t(
                      'onboarding.suggestions_error_message',
                      'Something went wrong. Try again, or continue to Home.',
                    )}
                    onRetry={() => refetchSuggestions()}
                  />
                ) : !suggestions?.length ? (
                  <OnboardingEmptyCircle onRetry={() => refetchSuggestions()} />
                ) : (
                  <ul className="divide-y divide-white/8">
                    {suggestions.map((user: SuggestedUser) => {
                      const isFollowed = followedUsernames.has(user.username);
                      const isPending =
                        followMutation.isPending &&
                        followMutation.variables === user.username;

                      return (
                        <li
                          key={user.id}
                          className="flex items-center justify-between gap-3 px-3 py-2.5"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <UserAvatar
                              src={user.avatar || undefined}
                              alt={user.username}
                              size="md"
                              verificationLevel={user.verificationLevel}
                            />
                            <div className="min-w-0">
                              <div className="font-bold text-sm truncate flex items-center gap-1 text-white">
                                {user.username}
                                <VerificationBadge
                                  level={user.verificationLevel}
                                  size={12}
                                />
                              </div>
                              <div className="text-xs text-white/45 truncate">
                                {user.reason ||
                                  t('onboarding.followers_count', {
                                    count: user.followersCount,
                                    defaultValue: `${user.followersCount} followers`,
                                  })}
                              </div>
                            </div>
                          </div>

                          <Button
                            type="button"
                            size="md"
                            variant={isFollowed ? 'secondary' : 'primary'}
                            data-testid={`onboarding-follow-${user.username}`}
                            aria-pressed={isFollowed}
                            aria-label={
                              isFollowed
                                ? t('onboarding.following_user', {
                                    username: user.username,
                                    defaultValue: `Following ${user.username}`,
                                  })
                                : t('onboarding.follow_user', {
                                    username: user.username,
                                    defaultValue: `Follow ${user.username}`,
                                  })
                            }
                            onClick={() => {
                              if (!isFollowed) {
                                followMutation.mutate(user.username);
                              }
                            }}
                            disabled={isFollowed || isPending}
                            isLoading={isPending}
                            className="min-w-24 px-4 shrink-0"
                          >
                            {isFollowed ? (
                              <>
                                <Check size={14} strokeWidth={3} aria-hidden />
                                {t('onboarding.following', 'Following')}
                              </>
                            ) : (
                              t('onboarding.follow', 'Follow')
                            )}
                          </Button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              <div className="flex gap-3">
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  onClick={() => setStep(1)}
                  className="px-6 font-semibold"
                >
                  {t('onboarding.back', 'Back')}
                </Button>
                <Button
                  type="button"
                  size="lg"
                  onClick={handleFinish}
                  isLoading={updateProfileMutation.isPending}
                  data-testid="onboarding-enter"
                  className="flex-1 font-bold"
                >
                  {t('onboarding.enter', 'Enter CircleSfera')}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
