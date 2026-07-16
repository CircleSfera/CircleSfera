import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle,
  BadgeCheck,
  BarChart3,
  Bell,
  Camera,
  Check,
  CreditCard,
  DollarSign,
  Globe,
  Key,
  Loader2,
  LogOut,
  Shield,
  Star,
  User,
  UserPlus,
  Users,
  UserX,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';

import {
  MonetizationSettings,
  PasskeySettings,
  TwoFactorSettings,
} from '../components';
import CloseFriendsModal from '../components/modals/CloseFriendsModal';
import UserAvatar from '../components/UserAvatar';
import { Button, Input, Switch, Textarea } from '../components/ui';
import { usePushNotifications } from '../hooks/usePushNotifications';
import { followsApi, profileApi, uploadApi } from '../services';
import { paymentsApi } from '../services/payments.service';
import { usersApi } from '../services/users.service';
import { useAuthStore } from '../stores/authStore';
import type { Profile, UpdateProfileDto } from '../types';
import { logger } from '../utils/logger';

// Debounce hook
function useDebounce<T extends (...args: Parameters<T>) => void>(
  callback: T,
  delay: number,
): (...args: Parameters<T>) => void {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  return useCallback(
    (...args: Parameters<T>) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => {
        callback(...args);
      }, delay);
    },
    [callback, delay],
  );
}

function ReferralsSettings() {
  const { data, isLoading } = useQuery({
    queryKey: ['myReferrals'],
    queryFn: () => profileApi.getMyReferrals(),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-10">
        <Loader2 className="animate-spin text-blue-500" size={32} />
      </div>
    );
  }

  const inviteCode = data?.data?.inviteCode;
  const referrals = data?.data?.referrals || [];
  const maxReferrals = data?.data?.maxReferrals || 3;
  const referralCount = data?.data?.referralCount || 0;
  const inviteLink = `${window.location.origin}/accounts/register?inviteCode=${inviteCode}`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(inviteLink);
    toast.success('Invite link copied!');
  };

  return (
    <div className="max-w-xl space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h2 className="text-xl font-black text-white tracking-tighter">
          Beta Invites
        </h2>
        <p className="text-gray-300 text-sm font-medium mt-1 uppercase tracking-wide italic opacity-60">
          Invite your friends to CircleSfera
        </p>
      </div>

      <div className="bg-white/2 p-5 rounded-xl border border-white/5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider">
            Your Invite Link
          </h3>
          <span className="text-xs font-bold bg-blue-500/20 text-blue-400 px-2 py-1 rounded-md">
            {referralCount} / {maxReferrals} Used
          </span>
        </div>

        <div className="flex gap-2 mb-2">
          <Input
            value={inviteLink}
            readOnly
            className="flex-1 font-mono text-sm"
          />
          <Button
            onClick={handleCopyLink}
            disabled={referralCount >= maxReferrals}
          >
            Copy
          </Button>
        </div>
        {referralCount >= maxReferrals && (
          <p className="text-xs text-red-400 font-bold uppercase tracking-wider">
            You have reached the maximum number of invites for this beta phase.
          </p>
        )}
      </div>

      <div className="bg-white/2 p-5 rounded-xl border border-white/5 space-y-4">
        <h3 className="text-sm font-bold text-white uppercase tracking-wider">
          Users you invited
        </h3>

        {referrals.length === 0 ? (
          <div className="text-center py-6 text-gray-500 text-sm font-medium">
            You haven't invited anyone yet.
          </div>
        ) : (
          <div className="space-y-3">
            {referrals.map((referral: any) => (
              <div
                key={referral.id}
                className="flex items-center gap-3 p-3 bg-white/5 rounded-lg"
              >
                <UserAvatar
                  src={referral.profile?.avatar}
                  alt={referral.profile?.fullName || referral.profile?.username}
                  size="md"
                />
                <div className="flex flex-col">
                  <span className="font-bold text-white text-sm">
                    {referral.profile?.fullName || referral.profile?.username}
                  </span>
                  <span className="text-xs text-gray-300">
                    @{referral.profile?.username} • Joined{' '}
                    {new Date(referral.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function NotificationsSettings() {
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

export default function Settings() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const logout = useAuthStore((state) => state.logout);
  const setProfile = useAuthStore((state) => state.setProfile);
  const [activeTab, setActiveTab] = useState<
    | 'profile'
    | 'privacy'
    | 'security'
    | 'billing'
    | 'requests'
    | 'mutes'
    | 'account'
    | 'close_friends'
    | 'notifications'
    | 'referrals'
    | 'monetization'
  >('profile');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { t, i18n } = useTranslation();

  const changeLanguage = (lng: string) => {
    i18n.changeLanguage(lng);
  };

  // --- Profile Data ---
  const { data: profileData } = useQuery({
    queryKey: ['myProfile'],
    queryFn: () => profileApi.getMyProfile(),
  });
  const profile = profileData?.data;

  // --- Blocked Users Data ---
  const { data: blockedUsersData, refetch: refetchBlocked } = useQuery({
    queryKey: ['blockedUsers'],
    queryFn: () => followsApi.getBlocked(),
    enabled: activeTab === 'mutes',
  });
  const blockedUsers = blockedUsersData?.data || [];

  // --- Muted Users Data ---
  const { data: mutedUsersData, refetch: refetchMuted } = useQuery({
    queryKey: ['mutedUsers'],
    queryFn: () => followsApi.getMuted(),
    enabled: activeTab === 'mutes',
  });
  const mutedUsers = mutedUsersData?.data || [];

  // --- Pending Follow Requests ---
  const { data: pendingRequestsData, refetch: refetchPending } = useQuery({
    queryKey: ['pendingFollowRequests'],
    queryFn: () => followsApi.getPending(),
    enabled: activeTab === 'requests',
  });
  const pendingRequests = pendingRequestsData?.data || [];

  // --- Form State ---
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');
  const [website, setWebsite] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [accountType, setAccountType] = useState<
    'PERSONAL' | 'CREATOR' | 'BUSINESS'
  >('PERSONAL');
  const [initialized, setInitialized] = useState(false);

  // Username availability state
  const [usernameStatus, setUsernameStatus] = useState<{
    checking: boolean;
    available: boolean | null;
    message: string;
  }>({ checking: false, available: null, message: '' });

  // Avatar upload state
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarSuccess, setAvatarSuccess] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);

  // --- Mutations ---
  const updateProfileMutation = useMutation({
    mutationFn: (data: UpdateProfileDto) => profileApi.updateProfile(data),
    onSuccess: (response) => {
      queryClient.setQueryData(['myProfile'], response); // Optimistic cache update
      setProfile(response.data);

      // Update local states if they match the response
      setFullName(response.data.fullName || '');
      setUsername(response.data.username || '');
      setBio(response.data.bio || '');
      setWebsite(response.data.website || '');
      setIsPrivate(response.data.isPrivate || false);

      if (response.data.username !== profile?.username) {
        navigate(`/${response.data.username}`);
      }
    },
  });

  const unblockMutation = useMutation({
    mutationFn: (targetUsername: string) => followsApi.unblock(targetUsername),
    onSuccess: () => {
      refetchBlocked();
    },
  });

  const unmuteMutation = useMutation({
    mutationFn: (targetUsername: string) => followsApi.unmute(targetUsername),
    onSuccess: () => {
      refetchMuted();
    },
  });

  const acceptRequestMutation = useMutation({
    mutationFn: (username: string) => followsApi.acceptRequest(username),
    onSuccess: () => {
      refetchPending();
      queryClient.invalidateQueries({ queryKey: ['myProfile'] });
    },
  });

  const rejectRequestMutation = useMutation({
    mutationFn: (username: string) => followsApi.rejectRequest(username),
    onSuccess: () => {
      refetchPending();
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: () => profileApi.deactivateAccount(),
    onSuccess: () => {
      logout();
      navigate('/accounts/login');
    },
    onError: () => toast.error(t('settings.account.disable.error')),
  });

  const verifyIdentityMutation = useMutation({
    mutationFn: () => usersApi.createIdentitySession(window.location.href),
    onSuccess: (data) => {
      window.location.href = data.url;
    },
    onError: () => {
      toast.error('Failed to initialize verification session');
    },
  });

  const deleteAccountMutation = useMutation({
    mutationFn: () => profileApi.deleteAccount(),
    onSuccess: () => {
      logout();
      navigate('/accounts/login');
    },
  });

  const exportDataMutation = useMutation({
    mutationFn: () => usersApi.requestExport(),
    onSuccess: () => {
      toast.success(
        t(
          'settings.account.export_success',
          'Data export started. You will receive an email when it is ready.',
        ),
      );
    },
    onError: () => {
      toast.error(
        t('settings.account.export_error', 'Failed to request data export.'),
      );
    },
  });

  const [isProcessingPortal, setIsProcessingPortal] = useState(false);

  const handleUpgrade = () => {
    navigate('/pricing');
  };

  const handleBillingPortal = async () => {
    try {
      setIsProcessingPortal(true);
      const response = await paymentsApi.getBillingPortalUrl();
      if (response.url) {
        window.location.href = response.url;
      }
    } catch {
      toast.error('Could not access billing portal.');
    } finally {
      setIsProcessingPortal(false);
    }
  };

  // --- Synchronization Effects ---
  useEffect(() => {
    if (profile && !initialized) {
      setFullName(profile.fullName || '');
      setUsername(profile.username || '');
      setBio(profile.bio || '');
      setWebsite(profile.website || '');
      setIsPrivate(profile.isPrivate || false);
      setAccountType(profile.user?.accountType || 'PERSONAL');
      setInitialized(true);
    }
  }, [profile, initialized]);

  useEffect(() => {
    if (activeTab === 'account' && profile?.user?.verificationLevel && profile.user.verificationLevel !== 'VERIFIED' && profile.user.verificationLevel !== 'BUSINESS' && profile.user.verificationLevel !== 'ELITE') {
      usersApi.syncIdentitySession().then((res) => {
        if (res?.status === 'verified') {
          queryClient.invalidateQueries({ queryKey: ['myProfile'] });
          toast.success(t('settings.account.verification.success', 'Your identity has been verified!'));
        }
      }).catch((err) => {
        logger.error('Failed to sync identity session:', err);
      });
    }
  }, [activeTab, profile?.user?.verificationLevel, queryClient, t]);

  // --- Handlers ---
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
          message: 'Username must be at least 3 characters',
        });
        return;
      }

      setUsernameStatus({ checking: true, available: null, message: '' });

      try {
        const response = await profileApi.checkUsername(newUsername);
        setUsernameStatus({
          checking: false,
          available: response.data.available,
          message: response.data.message,
        });
      } catch {
        setUsernameStatus({
          checking: false,
          available: false,
          message: 'Error checking username',
        });
      }
    },
    [profile?.username],
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

    const reader = new FileReader();
    reader.onloadend = () => {
      setAvatarPreview(reader.result as string);
    };
    reader.readAsDataURL(file);

    setAvatarUploading(true);
    setAvatarSuccess(false);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await uploadApi.upload(formData);
      const avatarUrl = response.data.url;

      await profileApi.updateProfile({ avatar: avatarUrl });
      queryClient.invalidateQueries({ queryKey: ['myProfile'] });

      if (profile) {
        setProfile({ ...profile, avatar: avatarUrl });
      }
      setAvatarSuccess(true);
      setTimeout(() => setAvatarSuccess(false), 3000);
    } catch (error) {
      logger.error('Failed to upload avatar:', error);
      setAvatarPreview(null);
    } finally {
      setAvatarUploading(false);
    }
  };

  const handleProfileSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const data: UpdateProfileDto = {
      fullName,
      bio,
      isPrivate,
    };

    if (website && website.trim() !== '') {
      data.website = website;
    } else {
      data.website = null;
    }

    if (username !== profile?.username && usernameStatus.available) {
      data.username = username;
    }

    updateProfileMutation.mutate(data);
  };

  const handlePrivacyToggle = () => {
    const newPrivateValue = !isPrivate;
    setIsPrivate(newPrivateValue); // Optimistic UI update

    const normalizedWebsite = website && website.trim() !== '' ? website : null;
    updateProfileMutation.mutate(
      {
        fullName,
        bio,
        website: normalizedWebsite,
        isPrivate: newPrivateValue,
      },
      {
        onError: (error) => {
          setIsPrivate(!newPrivateValue); // Revert on failure
          logger.error('Failed to update privacy settings:', error);
        },
      },
    );
  };

  const handleDeactivate = () => {
    if (
      window.confirm(
        'Are you sure you want to deactivate your account? You can reactivate it by logging in again.',
      )
    ) {
      deactivateMutation.mutate();
    }
  };

  const handleDelete = () => {
    if (
      window.confirm(
        'Are you sure you want to PERMANENTLY delete your account? This action cannot be undone.',
      )
    ) {
      deleteAccountMutation.mutate();
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/accounts/login');
  };

  const tabs = [
    {
      id: 'profile',
      label: t('settings.tabs.profile.label'),
      desc: t('settings.tabs.profile.desc'),
      icon: User,
    },
    {
      id: 'privacy',
      label: t('settings.tabs.privacy.label'),
      desc: t('settings.tabs.privacy.desc'),
      icon: Shield,
    },
    {
      id: 'notifications',
      label: t('settings.tabs.notifications.label'),
      desc: t('settings.tabs.notifications.desc'),
      icon: Bell,
    },
    {
      id: 'security',
      label: t('settings.tabs.security.label'),
      desc: t('settings.tabs.security.desc'),
      icon: Key,
    },
    {
      id: 'billing',
      label: t('settings.tabs.billing.label'),
      desc: t('settings.tabs.billing.desc'),
      icon: CreditCard,
    },
    {
      id: 'monetization',
      label: 'Monetization',
      desc: 'Manage Stripe Connect and payouts',
      icon: DollarSign,
    },
    {
      id: 'requests',
      label: t('settings.tabs.requests.label'),
      desc: t('settings.tabs.requests.desc'),
      icon: UserPlus,
    },
    {
      id: 'referrals',
      label: 'Referrals',
      desc: 'Invite friends and track referrals',
      icon: Users,
    },
    {
      id: 'close_friends',
      label: t('settings.tabs.close_friends.label'),
      desc: t('settings.tabs.close_friends.desc'),
      icon: Star,
    },
    {
      id: 'mutes',
      label: t('settings.tabs.mutes.label'),
      desc: t('settings.tabs.mutes.desc'),
      icon: UserX,
    },
    {
      id: 'account',
      label: t('settings.tabs.account.label'),
      desc: t('settings.tabs.account.desc'),
      icon: AlertTriangle,
    },
  ] as const;

  const canSubmit =
    username === profile?.username || usernameStatus.available === true;

  return (
    <div className="min-h-screen pb-32 pt-6">
      <div className="max-w-5xl mx-auto px-4 md:px-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-6 gap-3">
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">
              {t('settings.title')}
            </h1>
            <p className="text-gray-300 mt-1 font-medium italic">
              {t('settings.subtitle')}
            </p>
          </div>
          <motion.button
            type="button"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleLogout}
            className="flex items-center gap-2 px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg border border-red-500/20 transition-all self-start md:self-auto"
          >
            <LogOut size={18} />
            <span className="font-bold text-sm tracking-wide">
              {t('settings.logout')}
            </span>
          </motion.button>
        </div>

        <div className="glass-panel rounded-xl overflow-hidden flex flex-col md:flex-row min-h-[400px] md:min-h-[500px] border-white/5 shadow-lg relative">
          {/* Mobile Tabs / Desktop Sidebar */}
          <div className="w-full md:w-52 border-b md:border-b-0 md:border-r border-white/5 bg-black/40 md:bg-white/1 shrink-0 sticky top-0 md:top-0 z-20 md:z-10 backdrop-blur-2xl md:backdrop-blur-none">
            <div className="flex flex-row md:flex-col gap-2 md:gap-1 overflow-x-auto md:overflow-x-visible no-scrollbar p-3 md:p-4 sticky md:top-24 items-center md:items-stretch">
              {tabs.map((tab) => (
                <button
                  type="button"
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`flex flex-row md:flex-col items-center md:items-start gap-2 md:gap-0 px-3 py-2 rounded-lg transition-all relative group shrink-0 ${
                    activeTab === tab.id
                      ? 'bg-blue-500/10 text-white shadow-[0_0_15px_rgba(59,130,246,0.15)] ring-1 ring-blue-500/30'
                      : 'text-gray-300 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <tab.icon
                      size={16}
                      className={
                        activeTab === tab.id
                          ? 'text-blue-400 drop-shadow-[0_0_8px_rgba(59,130,246,0.5)]'
                          : 'group-hover:text-gray-200 transition-colors'
                      }
                    />
                    <span className="font-semibold text-xs tracking-wider uppercase whitespace-nowrap">
                      {t(`settings.tabs.${tab.id}.label`) || tab.label}
                    </span>
                  </div>
                  <span
                    className={`hidden md:block text-xs ml-6 font-medium leading-relaxed mt-0.5 ${activeTab === tab.id ? 'text-blue-300/80' : 'text-gray-500'}`}
                  >
                    {t(`settings.tabs.${tab.id}.desc`) || tab.desc}
                  </span>
                  {activeTab === tab.id && (
                    <motion.div
                      layoutId="activeTabIndicator"
                      className="absolute left-0 w-1 h-6 bg-blue-500 rounded-r-full hidden md:block drop-shadow-[0_0_5px_rgba(59,130,246,0.8)]"
                    />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Content Area */}
          <div className="flex-1 p-4 md:p-4">
            {activeTab === 'profile' && (
              <form
                onSubmit={handleProfileSubmit}
                className="space-y-5 max-w-xl animate-in fade-in slide-in-from-bottom-4 duration-500"
              >
                {/* Avatar Section */}
                <div className="flex flex-col sm:flex-row items-center gap-4 bg-white/1 p-4 rounded-lg border border-white/5 shadow-inner">
                  <button
                    type="button"
                    className="relative group cursor-pointer"
                    onClick={() => fileInputRef.current?.click()}
                    aria-label="Change profile picture"
                  >
                    <div className="w-16 h-16 rounded-full overflow-hidden border-[3px] border-white/10 group-hover:border-blue-500/50 transition-all duration-300 relative bg-zinc-800">
                      <UserAvatar
                        src={avatarPreview || profile?.avatar || undefined}
                        thumbnailUrl={
                          avatarPreview ? null : profile?.thumbnailUrl
                        }
                        standardUrl={
                          avatarPreview ? null : profile?.standardUrl
                        }
                        alt="Profile"
                        size="full"
                        className="w-full h-full object-cover flex items-center justify-center"
                      />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1">
                        <Camera size={20} className="text-white" />
                        <span className="text-xs font-bold text-white uppercase tracking-wider">
                          {t('settings.profile.change_avatar')}
                        </span>
                      </div>
                    </div>
                    {avatarUploading && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/60 rounded-full z-10">
                        <Loader2
                          size={24}
                          className="text-blue-400 animate-spin"
                        />
                      </div>
                    )}
                    {avatarSuccess && (
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        className="absolute -bottom-1 -right-1 bg-green-500 text-white p-1 rounded-full shadow-lg border-2 border-zinc-900"
                      >
                        <Check size={14} strokeWidth={4} />
                      </motion.div>
                    )}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleAvatarChange}
                    />
                  </button>

                  <div className="flex-1 text-center sm:text-left space-y-2">
                    <h3 className="text-lg font-bold text-white tracking-tight">
                      @{profile?.username}
                    </h3>
                    <p className="text-sm text-gray-300 leading-relaxed max-w-xs">
                      {t('settings.profile.avatar_desc')}
                    </p>
                    <div className="flex items-center justify-center sm:justify-start gap-4 pt-1">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="text-xs font-black uppercase tracking-wide text-blue-400 hover:text-blue-300 transition-colors bg-blue-400/5 hover:bg-blue-400/10 px-4 py-2 rounded-full border border-blue-400/10"
                        disabled={avatarUploading}
                      >
                        {avatarUploading
                          ? t('settings.profile.uploading')
                          : t('settings.profile.upload_new')}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Section 1: Public Identity */}
                <div className="bg-white/2 p-4 rounded-xl border border-white/5 space-y-4">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-blue-400/80 mb-2">
                    {t('settings.profile.public_identity')}
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Username */}
                    <Input
                      id="username"
                      label={t('settings.profile.username')}
                      type="text"
                      value={username}
                      onChange={handleUsernameChange}
                      placeholder={t('settings.profile.placeholders.username')}
                      className={`${usernameStatus.available === true ? 'border-green-500/30 focus-visible:ring-green-500/50' : usernameStatus.available === false ? 'border-red-500/30' : ''}`}
                      error={
                        usernameStatus.available === false
                          ? usernameStatus.message.toUpperCase()
                          : undefined
                      }
                      rightElement={
                        <>
                          {usernameStatus.checking && (
                            <Loader2
                              size={18}
                              className="text-blue-400 animate-spin"
                            />
                          )}
                          {!usernameStatus.checking &&
                            usernameStatus.available === true && (
                              <Check size={18} className="text-green-400" />
                            )}
                          {!usernameStatus.checking &&
                            usernameStatus.available === false && (
                              <X size={18} className="text-red-400" />
                            )}
                        </>
                      }
                    />
                    {usernameStatus.available === true &&
                      usernameStatus.message && (
                        <p className="text-xs font-bold mt-1 ml-1 tracking-wide text-green-400">
                          {usernameStatus.message.toUpperCase()}
                        </p>
                      )}

                    {/* Name */}
                    <Input
                      id="fullName"
                      label={t('settings.profile.display_name')}
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder={t('settings.profile.placeholders.name')}
                    />
                  </div>
                </div>

                {/* Section 2: Presence & Links */}
                <div className="bg-white/2 p-4 md:p-4 rounded-lg border border-white/5 space-y-4">
                  <h3 className="text-xs font-black uppercase tracking-wider text-blue-400/80 mb-2">
                    {t('settings.profile.presence_links')}
                  </h3>
                  <div className="space-y-4">
                    {/* Bio */}
                    <div className="space-y-1.5">
                      <div className="flex justify-between items-end">
                        <label
                          htmlFor="bio"
                          className="block text-sm font-medium text-gray-300 mb-1"
                        >
                          {t('settings.profile.bio')}
                        </label>
                        <span
                          className={`text-xs font-bold ${bio.length >= 140 ? 'text-red-400' : 'text-gray-600'}`}
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

                    {/* Website */}
                    <Input
                      id="website"
                      label={t('settings.profile.website')}
                      type="url"
                      value={website}
                      onChange={(e) => setWebsite(e.target.value)}
                      placeholder={t('settings.profile.placeholders.website')}
                    />
                  </div>
                </div>

                {/* Section 3: Professional Account (Already in cards) */}
                <div className="bg-white/2 p-4 md:p-4 rounded-xl border border-white/5 space-y-4">
                  <div className="flex items-center justify-between ml-1">
                    <span className="text-xs font-black uppercase tracking-wide text-blue-400/80">
                      {t('settings.profile.account_type')}
                    </span>
                    <span className="text-xs font-bold text-blue-400 capitalize bg-blue-400/10 px-2 py-0.5 rounded-full">
                      {accountType.toLowerCase()}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {[
                      {
                        id: 'PERSONAL',
                        icon: User,
                        label: 'Personal',
                        desc: 'Private use',
                      },
                      {
                        id: 'CREATOR',
                        icon: Star,
                        label: 'Creator',
                        desc: 'Best for artists',
                      },
                      {
                        id: 'BUSINESS',
                        icon: BarChart3,
                        label: 'Business',
                        desc: 'Brand tools',
                      },
                    ].map((type) => (
                      <button
                        key={type.id}
                        type="button"
                        onClick={() => {
                          const typeId = type.id as
                            | 'PERSONAL'
                            | 'CREATOR'
                            | 'BUSINESS';
                          setAccountType(typeId);
                          updateProfileMutation.mutate({ accountType: typeId });
                        }}
                        className={`relative p-4 rounded-lg text-left transition-all duration-300 border group overflow-hidden ${
                          accountType === type.id
                            ? 'bg-blue-500/10 border-blue-500/50 shadow-lg shadow-blue-500/10'
                            : 'bg-zinc-900/40 border-white/5 hover:border-white/10'
                        }`}
                      >
                        {accountType === type.id && (
                          <div className="absolute top-2 right-2 bg-blue-500 text-white p-1 rounded-full shadow-lg">
                            <Check size={8} strokeWidth={4} />
                          </div>
                        )}
                        <type.icon
                          size={18}
                          className={`mb-2 ${accountType === type.id ? 'text-blue-400' : 'text-gray-500 group-hover:text-gray-300 transition-colors'}`}
                        />
                        <h4
                          className={`text-xs font-bold tracking-tight ${accountType === type.id ? 'text-white' : 'text-gray-300'}`}
                        >
                          {t(
                            `settings.profile.types.${type.id.toLowerCase()}.label`,
                          )}
                        </h4>
                        <p
                          className={`text-xs font-bold uppercase tracking-wider mt-0.5 ${accountType === type.id ? 'text-blue-400/80' : 'text-gray-600'}`}
                        >
                          {t(
                            `settings.profile.types.${type.id.toLowerCase()}.desc`,
                          )}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>

                <AnimatePresence>
                  {updateProfileMutation.isSuccess && (
                    <motion.div
                      key="success-msg"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="flex items-center gap-2 text-green-400 text-sm bg-green-500/10 border border-green-500/20 rounded-lg p-4 shadow-lg shadow-green-500/5"
                    >
                      <Check size={18} />
                      <span className="font-bold tracking-tight text-xs uppercase">
                        {t('settings.profile.success')}
                      </span>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Sticky Guard Bar (Mobile Footer) */}
                <div className="sticky bottom-0 md:static -mx-6 md:mx-0 p-4 md:p-0 mt-8 z-30 bg-zinc-950/80 md:bg-transparent backdrop-blur-xl md:backdrop-blur-none border-t border-white/5 md:border-none">
                  <Button
                    type="submit"
                    variant="primary"
                    disabled={!canSubmit}
                    isLoading={updateProfileMutation.isPending}
                    className="w-full py-4 font-black text-sm uppercase tracking-wide shadow-xl"
                  >
                    {t('settings.profile.save')}
                  </Button>
                </div>
              </form>
            )}

            {activeTab === 'privacy' && (
              <div className="max-w-xl space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div>
                  <h2 className="text-xl font-black text-white tracking-tighter">
                    {t('settings.privacy.title')}
                  </h2>
                  <p className="text-gray-300 text-sm font-medium mt-1 uppercase tracking-wide italic opacity-60">
                    {t('settings.privacy.subtitle')}
                  </p>
                </div>

                <div className="bg-white/2 p-4 rounded-xl border border-white/5 border-l-blue-500/40 border-l-4">
                  <Switch
                    checked={isPrivate}
                    onChange={handlePrivacyToggle}
                    label={t('settings.privacy.private_account')}
                    description={t('settings.privacy.private_desc')}
                  />
                </div>
              </div>
            )}

            {activeTab === 'requests' && (
              <div className="max-w-xl space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div>
                  <h2 className="text-xl font-black text-white tracking-tighter">
                    {t('settings.requests.title')}
                  </h2>
                  <p className="text-gray-300 text-sm font-medium mt-1 uppercase tracking-wide italic opacity-60">
                    {t('settings.requests.subtitle')}
                  </p>
                </div>

                {pendingRequests.length === 0 ? (
                  <div className="text-center py-16 bg-white/1 rounded-xl border border-white/5 border-dashed">
                    <UserPlus
                      size={48}
                      className="mx-auto mb-4 text-gray-700"
                    />
                    <p className="text-gray-500 font-bold tracking-tight uppercase text-xs">
                      {t('settings.requests.empty')}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {pendingRequests.map(
                      (user: { id: string; profile?: Profile }) => (
                        <div
                          key={user.id}
                          className="bg-white/2 p-4 rounded-lg border border-white/5 hover:border-white/10 transition-all"
                        >
                          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                            <Link
                              to={`/${user.profile?.username}`}
                              className="flex items-center gap-4 self-start"
                            >
                              <UserAvatar
                                src={user.profile?.avatar || undefined}
                                thumbnailUrl={user.profile?.thumbnailUrl}
                                standardUrl={user.profile?.standardUrl}
                                alt={user.profile?.username || 'User'}
                                className="w-12 h-12 rounded-full object-cover"
                              />
                              <div>
                                <p className="font-bold text-white tracking-tight leading-none mb-1">
                                  {user.profile?.fullName ||
                                    user.profile?.username}
                                </p>
                                <p className="text-xs font-medium text-blue-400/60 uppercase tracking-wider">
                                  @{user.profile?.username}
                                </p>
                              </div>
                            </Link>
                            <div className="flex gap-2 w-full sm:w-auto">
                              <Button
                                onClick={() =>
                                  user.profile?.username &&
                                  acceptRequestMutation.mutate(
                                    user.profile.username,
                                  )
                                }
                                isLoading={acceptRequestMutation.isPending}
                                variant="primary"
                                className="flex-1 sm:flex-none py-1.5 text-xs font-black uppercase tracking-wide px-4"
                              >
                                {t('settings.requests.confirm')}
                              </Button>
                              <Button
                                onClick={() =>
                                  user.profile?.username &&
                                  rejectRequestMutation.mutate(
                                    user.profile.username,
                                  )
                                }
                                isLoading={rejectRequestMutation.isPending}
                                variant="ghost"
                                className="flex-1 sm:flex-none py-1.5 text-xs font-black uppercase tracking-wide px-4"
                              >
                                {t('settings.requests.delete')}
                              </Button>
                            </div>
                          </div>
                        </div>
                      ),
                    )}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'mutes' && (
              <div className="max-w-lg space-y-12">
                <div>
                  <h2 className="text-xl font-bold text-white mb-6">
                    {t('settings.mutes.blocked_title', 'Blocked Users')}
                  </h2>

                  {blockedUsers.length === 0 ? (
                    <div className="text-center text-gray-300 py-10 border border-white/5 rounded-xl bg-white/2">
                      <UserX size={48} className="mx-auto mb-4 opacity-50" />
                      <p>
                        {t('settings.mutes.blocked_empty', 'No blocked users')}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {blockedUsers.map(
                        (user: {
                          id: string;
                          username?: string;
                          profile?: Profile;
                        }) => (
                          <div
                            key={user.id}
                            className="bg-white/2 border border-white/5 flex items-center justify-between p-4 rounded-lg"
                          >
                            <div className="flex items-center gap-4">
                              <UserAvatar
                                src={user.profile?.avatar || undefined}
                                thumbnailUrl={user.profile?.thumbnailUrl}
                                standardUrl={user.profile?.standardUrl}
                                alt={user.profile?.username || 'User'}
                                className="w-12 h-12 rounded-full object-cover"
                              />
                              <div>
                                <p className="font-bold text-white tracking-tight leading-none mb-1">
                                  {user.profile?.username ||
                                    t('settings.mutes.unknown')}
                                </p>
                                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                                  {user.profile?.fullName}
                                </p>
                              </div>
                            </div>
                            <Button
                              onClick={() =>
                                user.profile?.username &&
                                unblockMutation.mutate(user.profile.username)
                              }
                              variant="outline"
                              className="py-2 text-xs font-black uppercase tracking-wide px-4"
                            >
                              {t('settings.mutes.unblock')}
                            </Button>
                          </div>
                        ),
                      )}
                    </div>
                  )}
                </div>

                <div>
                  <h2 className="text-xl font-bold text-white mb-6">
                    {t('settings.mutes.muted_title', 'Muted Users')}
                  </h2>

                  {mutedUsers.length === 0 ? (
                    <div className="text-center text-gray-300 py-10 border border-white/5 rounded-xl bg-white/2">
                      <UserX size={48} className="mx-auto mb-4 opacity-50" />
                      <p>{t('settings.mutes.muted_empty', 'No muted users')}</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {mutedUsers.map(
                        (user: {
                          id: string;
                          username?: string;
                          profile?: Profile;
                        }) => (
                          <div
                            key={user.id}
                            className="bg-white/2 border border-white/5 flex items-center justify-between p-4 rounded-lg"
                          >
                            <div className="flex items-center gap-4">
                              <UserAvatar
                                src={user.profile?.avatar || undefined}
                                thumbnailUrl={user.profile?.thumbnailUrl}
                                standardUrl={user.profile?.standardUrl}
                                alt={user.profile?.username || 'User'}
                                className="w-12 h-12 rounded-full object-cover"
                              />
                              <div>
                                <p className="font-bold text-white tracking-tight leading-none mb-1">
                                  {user.profile?.username ||
                                    t('settings.mutes.unknown')}
                                </p>
                                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                                  {user.profile?.fullName}
                                </p>
                              </div>
                            </div>
                            <Button
                              onClick={() =>
                                user.profile?.username &&
                                unmuteMutation.mutate(user.profile.username)
                              }
                              variant="outline"
                              className="py-2 text-xs font-black uppercase tracking-wide px-4"
                            >
                              {t('settings.mutes.unmute', 'Unmute')}
                            </Button>
                          </div>
                        ),
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'account' && (
              <div className="max-w-2xl space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">
                <div>
                  <h2 className="text-xl font-black text-white tracking-tighter">
                    {t('settings.account.title')}
                  </h2>
                  <p className="text-gray-300 text-sm font-medium mt-1 uppercase tracking-wide italic opacity-60">
                    {t('settings.account.subtitle')}
                  </p>
                </div>

                <div className="bg-blue-500/5 p-4 rounded-xl border border-blue-500/10 hover:bg-blue-500/10 transition-colors group mb-8">
                  <h3 className="font-bold text-blue-400 uppercase tracking-wide text-xs mb-2 flex items-center gap-2">
                    <LogOut size={14} className="rotate-90" />
                    {t('settings.account.export.title', 'Export Data')}
                  </h3>
                  <p className="text-sm text-gray-500 leading-relaxed font-medium mb-5">
                    {t(
                      'settings.account.export.desc',
                      'Download a copy of your data including your profile, posts, and messages. This process may take a few minutes.',
                    )}
                  </p>
                  <Button
                    onClick={() => exportDataMutation.mutate()}
                    isLoading={exportDataMutation.isPending}
                    variant="outline"
                    className="px-5 py-2 text-blue-400 border-blue-500/20 hover:bg-blue-500 hover:text-white font-black text-xs uppercase tracking-wide"
                  >
                    {t('settings.account.export.btn', 'Request Export')}
                  </Button>
                </div>

                {/* KYC Verification */}
                <div
                  className={`p-4 rounded-xl border transition-colors group mb-8 ${profile?.identityVerifiedAt ? 'bg-green-500/5 border-green-500/10 hover:bg-green-500/10' : 'bg-purple-500/5 border-purple-500/10 hover:bg-purple-500/10'}`}
                >
                  <h3
                    className={`font-bold uppercase tracking-wide text-xs mb-2 flex items-center gap-2 ${profile?.identityVerifiedAt ? 'text-green-400' : 'text-purple-400'}`}
                  >
                    <BadgeCheck size={16} />
                    {t(
                      'settings.account.verification.title',
                      'Identity Verification',
                    )}
                  </h3>
                  <p className="text-sm text-gray-300 leading-relaxed font-medium mb-5">
                    {profile?.identityVerifiedAt
                      ? t(
                          'settings.account.verification.verified_desc',
                          'Your identity has been successfully verified. This badge adds trust to your profile and helps keep the community safe.',
                        )
                      : t(
                          'settings.account.verification.unverified_desc',
                          'Verify your identity to get the verified badge and unlock additional security features for your account. You will need a valid ID or Passport.',
                        )}
                  </p>

                  {profile?.identityVerifiedAt ? (
                    <div className="flex items-center gap-2 text-green-400 font-bold text-xs uppercase tracking-wide px-2 py-1 bg-green-500/10 w-fit rounded-lg">
                      <Check size={14} strokeWidth={3} />
                      {t('settings.account.verification.verified', 'Verified')}
                    </div>
                  ) : (
                    <Button
                      onClick={() => verifyIdentityMutation.mutate()}
                      isLoading={verifyIdentityMutation.isPending}
                      variant="outline"
                      className="px-5 py-2 text-purple-400 border-purple-500/20 hover:bg-purple-500 hover:text-white font-black text-xs uppercase tracking-wide"
                    >
                      {t(
                        'settings.account.verification.btn',
                        'Verify Identity',
                      )}
                    </Button>
                  )}
                </div>

                {/* Language Switcher */}
                <div className="bg-white/2 p-4 rounded-xl border border-white/5 mb-8">
                  <h3 className="font-bold text-white tracking-wide text-xs uppercase mb-4 flex items-center gap-2">
                    <Globe size={14} className="text-blue-400" />{' '}
                    {t('settings.account.language')}
                  </h3>
                  <div className="flex gap-4">
                    <button
                      type="button"
                      onClick={() => changeLanguage('en')}
                      className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${
                        i18n.language.startsWith('en')
                          ? 'bg-blue-500 text-white'
                          : 'bg-white/5 text-gray-300 hover:bg-white/10'
                      }`}
                    >
                      English
                    </button>
                    <button
                      type="button"
                      onClick={() => changeLanguage('es')}
                      className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${
                        i18n.language.startsWith('es')
                          ? 'bg-blue-500 text-white'
                          : 'bg-white/5 text-gray-300 hover:bg-white/10'
                      }`}
                    >
                      Español
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-orange-500/5 p-4 rounded-xl border border-orange-500/10 hover:bg-orange-500/10 transition-colors group">
                    <h3 className="font-bold text-orange-400 uppercase tracking-wide text-xs mb-2 flex items-center gap-2">
                      <AlertTriangle size={14} />{' '}
                      {t('settings.account.disable.title')}
                    </h3>
                    <p className="text-sm text-gray-500 leading-relaxed font-medium mb-5">
                      {t('settings.account.disable.desc')}
                    </p>
                    <Button
                      onClick={handleDeactivate}
                      isLoading={deactivateMutation.isPending}
                      variant="outline"
                      className="w-full px-5 py-2 text-orange-400 border-orange-500/20 hover:bg-orange-500 hover:border-orange-500 hover:text-white font-black text-xs uppercase tracking-wide"
                    >
                      {t('settings.account.disable.btn')}
                    </Button>
                  </div>

                  <div className="bg-red-500/5 p-4 rounded-xl border border-red-500/10 hover:bg-red-500/10 transition-colors group">
                    <h3 className="font-bold text-red-400 uppercase tracking-wide text-xs mb-2 flex items-center gap-2">
                      <AlertTriangle size={14} />{' '}
                      {t('settings.account.delete.title')}
                    </h3>
                    <p className="text-sm text-gray-500 leading-relaxed font-medium mb-5">
                      {t('settings.account.delete.desc')}
                    </p>
                    <Button
                      onClick={handleDelete}
                      isLoading={deleteAccountMutation.isPending}
                      variant="danger"
                      className="w-full px-5 py-2 font-black text-xs uppercase tracking-wide"
                    >
                      {t('settings.account.delete.btn')}
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'billing' && (
              <div className="max-w-2xl space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div>
                  <h2 className="text-xl font-black text-white tracking-tighter">
                    {t('settings.billing.title')}
                  </h2>
                  <p className="text-gray-300 text-sm font-medium mt-1 uppercase tracking-wide italic opacity-60">
                    {t('settings.billing.subtitle')}
                  </p>
                </div>

                <div className="glass-panel p-6 rounded-xl border border-white/5 bg-linear-to-br from-blue-500/5 via-transparent to-transparent flex flex-col md:flex-row items-center justify-between gap-6">
                  <div>
                    <span className="text-xs font-black uppercase tracking-wide text-blue-400/80 mb-2 block">
                      {t('settings.billing.current_plan')}
                    </span>
                    <h3 className="text-2xl font-black text-white tracking-tighter italic uppercase">
                      {profile?.user?.verificationLevel === 'BASIC'
                        ? t('settings.billing.free')
                        : profile?.user?.verificationLevel}
                    </h3>
                    <p className="text-gray-500 text-xs font-bold uppercase tracking-wide mt-2">
                      {profile?.user?.verificationLevel === 'BASIC'
                        ? t('settings.billing.free_desc')
                        : t('settings.billing.active_desc')}
                    </p>
                  </div>
                  <Button
                    onClick={
                      profile?.user?.verificationLevel === 'BASIC'
                        ? handleUpgrade
                        : handleBillingPortal
                    }
                    isLoading={isProcessingPortal}
                    variant="white"
                    className="px-8 py-4 font-black text-xs uppercase tracking-wide hover:scale-105 shadow-xl shadow-white/5"
                  >
                    {profile?.user?.verificationLevel === 'BASIC'
                      ? t('settings.billing.view_plans')
                      : t('settings.billing.manage')}
                  </Button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-white/2 p-4 rounded-xl border border-white/5 flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
                      <Shield size={20} className="text-blue-400" />
                    </div>
                    <div>
                      <h4 className="text-white font-bold text-sm tracking-tight">
                        {t('settings.billing.verified_badge')}
                      </h4>
                      <p className="text-xs text-gray-300 font-bold uppercase tracking-wider">
                        {t('settings.billing.verified_desc')}
                      </p>
                    </div>
                  </div>
                  <div className="bg-white/2 p-4 rounded-xl border border-white/5 flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center">
                      <Star size={20} className="text-purple-400" />
                    </div>
                    <div>
                      <h4 className="text-white font-bold text-sm tracking-tight">
                        {t('settings.billing.pro_insights')}
                      </h4>
                      <p className="text-xs text-gray-300 font-bold uppercase tracking-wider">
                        {t('settings.billing.pro_desc')}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'close_friends' && (
              <CloseFriendsModal onClose={() => setActiveTab('profile')} />
            )}

            {activeTab === 'security' && (
              <div className="max-w-xl space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div>
                  <h2 className="text-xl font-black text-white tracking-tighter">
                    {t('settings.security.title')}
                  </h2>
                  <p className="text-gray-300 text-sm font-medium mt-1 uppercase tracking-wide italic opacity-60">
                    {t('settings.security.subtitle')}
                  </p>
                </div>

                <div className="bg-white/2 p-4 rounded-xl border border-white/5">
                  <PasskeySettings />
                </div>
                <div className="bg-white/2 p-4 rounded-xl border border-white/5">
                  <TwoFactorSettings />
                </div>
              </div>
            )}

            {activeTab === 'monetization' && <MonetizationSettings />}
            {activeTab === 'referrals' && <ReferralsSettings />}
            {activeTab === 'notifications' && <NotificationsSettings />}
          </div>
        </div>

        {/* Back to profile link */}
        {profile?.username && (
          <div className="mt-6 text-center">
            <Link
              to={`/${profile.username}`}
              className="text-gray-300 hover:text-white transition-colors"
            >
              {t('settings.back_to_profile')}
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
