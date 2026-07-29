import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Camera,
  Check,
  ChevronRight,
  Loader2,
  Sparkles,
  UserPlus,
} from 'lucide-react';
import { useState } from 'react';
import { toast } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import UserAvatar from '../components/UserAvatar';
import { Button } from '../components/ui';
import VerificationBadge from '../components/VerificationBadge';
import { followsApi, profileApi, usersApi } from '../services';
import { useAuthStore } from '../stores/authStore';
import type { SuggestedUser } from '../types';

export default function Onboarding() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const profile = useAuthStore((state) => state.profile);
  const checkSession = useAuthStore((state) => state.checkSession);

  const [step, setStep] = useState<1 | 2>(1);
  const [bio, setBio] = useState('');
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [followedIds, setFollowedIds] = useState<Set<string>>(new Set());

  // Queries
  const { data: suggestions, isLoading: isLoadingSuggestions } = useQuery({
    queryKey: ['suggestions'],
    queryFn: async () => {
      const res = await usersApi.getSuggestions(6);
      return res.data;
    },
    enabled: step === 2,
  });

  // Mutations
  const updateProfileMutation = useMutation({
    mutationFn: async () => {
      await profileApi.updateProfile({
        bio,
      });

      // Update UserSettings to isOnboarded = true
      await usersApi.updateSettings({
        isOnboarded: true,
      });
    },
    onSuccess: async () => {
      await checkSession();
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      navigate('/');
      toast.success(t('onboarding.success', 'Welcome to CircleSfera!'));
    },
    onError: () => {
      toast.error(t('onboarding.error', 'Something went wrong.'));
    },
  });

  const followMutation = useMutation({
    mutationFn: (username: string) => followsApi.toggle(username),
    onSuccess: (_, username) => {
      setFollowedIds((prev) => {
        const next = new Set(prev);
        next.add(username);
        return next;
      });
      toast.success(t('profile.followed', 'Followed successfully'));
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      const file = e.target.files[0];
      setAvatarPreview(URL.createObjectURL(file));
    }
  };

  const handleFinish = () => {
    updateProfileMutation.mutate();
  };

  return (
    <div className="min-h-dvh bg-black flex items-center justify-center relative overflow-hidden">
      {/* Dynamic Background Elements */}
      <div className="absolute top-1/4 -left-32 w-125 h-125 bg-brand-primary/20 rounded-full blur-[120px] pointer-events-none animate-[pulse_8s_ease-in-out_infinite]" />
      <div
        className="absolute bottom-1/4 -right-32 w-125 h-125 bg-brand-secondary/20 rounded-full blur-[120px] pointer-events-none animate-[pulse_10s_ease-in-out_infinite]"
        style={{ animationDelay: '1s' }}
      />

      <div className="relative z-10 w-full max-w-lg p-6">
        {/* Step Indicator */}
        <div className="flex justify-center mb-10 space-x-2">
          <div
            className={`h-1.5 rounded-full transition-all duration-500 ${step === 1 ? 'w-12 bg-brand-primary' : 'w-4 bg-white/20'}`}
          />
          <div
            className={`h-1.5 rounded-full transition-all duration-500 ${step === 2 ? 'w-12 bg-brand-primary' : 'w-4 bg-white/20'}`}
          />
        </div>

        <div className="relative w-full h-125">
          {/* Step 1: Personalize Profile */}
          <div
            className={`transition-all duration-700 absolute inset-0 ${step === 1 ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-full pointer-events-none'}`}
          >
            <div className="text-center mb-10">
              <h1 className="text-4xl font-black mb-3 tracking-tighter bg-clip-text text-transparent bg-linear-to-r from-white to-white/60">
                Welcome, {profile?.username || 'Creator'}!
              </h1>
              <p className="text-gray-400 text-sm font-medium">
                Let's set up your profile to make you stand out.
              </p>
            </div>

            <div className="flex flex-col items-center mb-10">
              <label className="relative cursor-pointer group block">
                <div className="w-32 h-32 rounded-full overflow-hidden bg-white/5 border border-white/10 ring-4 ring-black/50 group-hover:ring-brand-primary/50 transition-all duration-300 relative z-10">
                  {avatarPreview || profile?.avatar ? (
                    <img
                      src={avatarPreview || profile?.avatar || ''}
                      alt="Avatar"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-white/20">
                      <UserPlus size={40} strokeWidth={1.5} />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <Camera className="text-white" size={24} />
                  </div>
                </div>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleFileChange}
                />

                {/* Decorative rings */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-35 h-35 rounded-full border border-white/5 scale-90 group-hover:scale-100 transition-transform duration-500" />
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-39 h-39 rounded-full border border-white/5 scale-95 group-hover:scale-100 transition-transform duration-700 delay-75" />
              </label>
            </div>

            <div className="space-y-2 mb-10">
              <label
                htmlFor="bio-input"
                className="text-xs font-bold text-gray-500 uppercase tracking-wider ml-1"
              >
                Your Bio
              </label>
              <textarea
                id="bio-input"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Tell the world about yourself..."
                className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-white placeholder-gray-500 focus:outline-none focus:border-brand-primary/50 focus:bg-white/10 transition-all resize-none min-h-30"
                maxLength={160}
              />
              <div className="text-right text-[10px] text-gray-600 font-medium mt-1">
                {bio.length}/160
              </div>
            </div>

            <Button
              onClick={() => setStep(2)}
              className="w-full py-4 text-sm font-bold rounded-2xl group flex items-center justify-center gap-2"
            >
              Continue
              <ChevronRight
                size={16}
                className="group-hover:translate-x-1 transition-transform"
              />
            </Button>
          </div>

          {/* Step 2: Suggestions */}
          <div
            className={`transition-all duration-700 absolute inset-0 ${step === 2 ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-full pointer-events-none'}`}
          >
            <div className="text-center mb-8">
              <h1 className="text-3xl font-black mb-3 tracking-tighter flex items-center justify-center gap-2">
                <Sparkles className="text-brand-primary" /> Find your circle
              </h1>
              <p className="text-gray-400 text-sm font-medium">
                Follow some of our top creators to get started.
              </p>
            </div>

            <div className="glass-panel p-4 rounded-3xl mb-8 min-h-75">
              {isLoadingSuggestions ? (
                <div className="flex flex-col items-center justify-center h-full text-gray-500 gap-4 py-20">
                  <Loader2 className="animate-spin" size={32} />
                  <span className="text-sm font-medium uppercase tracking-widest">
                    Curating...
                  </span>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3">
                  {suggestions?.map((user: SuggestedUser) => {
                    const isFollowed = followedIds.has(user.id);
                    return (
                      <div
                        key={user.id}
                        className="flex items-center justify-between p-3 rounded-2xl bg-white/5 hover:bg-white/10 transition-colors group"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <UserAvatar
                            src={user.avatar || undefined}
                            alt={user.username}
                            size="md"
                            verificationLevel={user.verificationLevel as any}
                          />
                          <div className="min-w-0">
                            <div className="font-bold text-sm truncate flex items-center gap-1 text-white group-hover:text-brand-primary transition-colors">
                              {user.username}
                              <VerificationBadge
                                level={user.verificationLevel as any}
                                size={12}
                              />
                            </div>
                            <div className="text-xs text-gray-400 truncate">
                              {user.reason ||
                                `${user.followersCount} followers`}
                            </div>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() =>
                            !isFollowed && followMutation.mutate(user.username)
                          }
                          disabled={isFollowed || followMutation.isPending}
                          className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${
                            isFollowed
                              ? 'bg-white/10 text-white cursor-default'
                              : 'bg-brand-primary text-white hover:bg-brand-primary/90 active:scale-95'
                          }`}
                        >
                          {isFollowed ? (
                            <div className="flex items-center gap-1">
                              <Check size={12} strokeWidth={3} /> Following
                            </div>
                          ) : (
                            'Follow'
                          )}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setStep(1)}
                className="py-4 px-6 rounded-2xl"
              >
                Back
              </Button>
              <Button
                type="button"
                onClick={handleFinish}
                isLoading={updateProfileMutation.isPending}
                className="flex-1 py-4 text-sm font-bold rounded-2xl flex items-center justify-center gap-2"
              >
                Enter CircleSfera
                <Sparkles size={16} />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
