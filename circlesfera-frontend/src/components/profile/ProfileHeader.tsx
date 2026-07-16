import { type UseMutationResult } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  Ban,
  ExternalLink,
  Flag,
  Gift,
  Link as LinkIcon,
  MapPin,
  MoreHorizontal,
  Plus,
  Settings,
  Star,
  Wand2,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import type { ProfileWithUser } from '../../types';
import FollowButton from '../FollowButton';
import UserAvatar from '../UserAvatar';
import VerificationBadge, {
  type VerificationLevel,
} from '../VerificationBadge';

function AnimatedCounter({ value, label }: { value: number; label: string }) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let startTime: number;
    const duration = 1500;
    let animationFrameId: number;

    const animate = (currentTime: number) => {
      if (!startTime) startTime = currentTime;
      const progress = Math.min((currentTime - startTime) / duration, 1);
      const easeOutQuart = 1 - (1 - progress) ** 4;

      setCount(Math.floor(value * easeOutQuart));

      if (progress < 1) {
        animationFrameId = requestAnimationFrame(animate);
      }
    };

    animationFrameId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrameId);
  }, [value]);

  return (
    <div className="text-center md:text-left group cursor-pointer">
      <span className="block text-white font-black text-base md:text-xl leading-none transition-all duration-300 origin-center md:origin-left group-hover:scale-110 group-hover:text-transparent group-hover:bg-clip-text group-hover:bg-linear-to-r group-hover:from-brand-secondary group-hover:to-brand-primary">
        {count}
      </span>
      <span className="text-zinc-400 text-[10px] md:text-xs font-bold uppercase tracking-wide mt-1 block transition-colors duration-300 group-hover:text-brand-primary/80">
        {label}
      </span>
    </div>
  );
}

interface ProfileHeaderProps {
  profile: { data: ProfileWithUser };
  isMe: boolean;
  hasActiveStories: boolean;
  isCreatorModeActive: boolean;
  setCreatorMode: (active: boolean) => void;
  openCreateMenu: () => void;
  subscribeMutation: UseMutationResult<any, any, any, any>;
  isCreatingChat: boolean;
  handleMessageClick: () => void;
  setShowFollowsModal: (modal: 'followers' | 'following' | null) => void;
  setShowReportModal: (show: boolean) => void;
  setShowBlockModal: (show: boolean) => void;
  setShowTipModal: (show: boolean) => void;

  setIsStoryViewerOpen: (show: boolean) => void;
  showMenu: boolean;
  setShowMenu: (show: boolean) => void;
}

export default function ProfileHeader({
  profile,
  isMe,
  hasActiveStories,
  isCreatorModeActive,
  setCreatorMode,
  openCreateMenu,
  subscribeMutation,
  isCreatingChat,
  handleMessageClick,
  setShowFollowsModal,
  setShowReportModal,
  setShowBlockModal,
  setShowTipModal,
  setIsStoryViewerOpen,
  showMenu,
  setShowMenu,
}: ProfileHeaderProps) {
  const { t } = useTranslation();

  return (
    <div className="glass-panel rounded-xl md:rounded-[24px] p-4 md:p-6 mb-3 md:mb-4 overflow-hidden relative border border-white/5 shadow-2xl backdrop-blur-2xl">
      {/* Background Accent Gradient (Parallax Effect) */}
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 1.5, ease: 'easeOut' }}
        className="absolute -top-20 -right-20 w-64 md:w-96 h-64 md:h-96 bg-linear-to-br from-brand-primary/20 to-brand-secondary/20 blur-[100px] -z-10 rounded-full"
      />

      <div className="flex flex-col gap-3 md:gap-7">
        <div className="flex flex-col md:flex-row items-center md:items-start gap-3 md:gap-6">
          {/* Avatar - Compact size */}
          <div className="relative shrink-0">
            <UserAvatar
              src={profile.data.avatar}
              thumbnailUrl={profile.data.thumbnailUrl}
              standardUrl={profile.data.standardUrl}
              alt={profile.data.username}
              size="xl"
              hasStory={hasActiveStories}
              onClick={
                hasActiveStories ? () => setIsStoryViewerOpen(true) : undefined
              }
              className="transition-all duration-300"
            />
            {isMe && (
              <Link
                to="/accounts/edit"
                aria-label={t('profile.actions.edit_profile')}
                className="absolute -bottom-0.5 -right-0.5 p-1 bg-zinc-900 border border-white/10 rounded-full text-white hover:bg-zinc-800 transition-colors shadow-xl opacity-0 hover:opacity-100 group-hover:opacity-100 duration-300 z-20"
              >
                <Plus size={12} aria-hidden="true" />
              </Link>
            )}
          </div>

          {/* Stats & Identity Group */}
          <div className="flex-1 flex flex-col justify-center text-center md:text-left">
            <div className="flex flex-col md:flex-row items-center justify-between gap-3 md:gap-6 mb-1 md:mb-3">
              {/* Identity */}
              <div className="space-y-0">
                <div className="flex items-center justify-center md:justify-start gap-2.5">
                  <h1 className="text-2xl md:text-xl font-black tracking-tight text-white">
                    {profile.data.fullName}
                  </h1>
                  <VerificationBadge
                    level={profile.data.verificationLevel as VerificationLevel}
                    size={18}
                  />
                </div>
                <span className="text-white font-bold text-sm tracking-tight block">
                  @{profile.data.username}
                </span>
              </div>

              {/* Stats */}
              <div className="flex items-center justify-center md:justify-start gap-4 md:gap-6">
                <AnimatedCounter
                  value={profile.data.user?._count?.posts || 0}
                  label={t('profile.stats.posts')}
                />
                <button
                  type="button"
                  onClick={() => setShowFollowsModal('followers')}
                  aria-label={t('profile.stats.followers')}
                >
                  <AnimatedCounter
                    value={profile.data.user?._count?.followers || 0}
                    label={t('profile.stats.followers')}
                  />
                </button>
                <button
                  type="button"
                  onClick={() => setShowFollowsModal('following')}
                  aria-label={t('profile.stats.following')}
                >
                  <AnimatedCounter
                    value={profile.data.user?._count?.following || 0}
                    label={t('profile.stats.following')}
                  />
                </button>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="hidden md:flex items-center gap-2.5">
              {isMe ? (
                <>
                  <Link
                    to="/accounts/edit"
                    className="px-6 py-2 bg-white text-black hover:bg-zinc-200 rounded-lg font-black transition-all duration-300 flex items-center justify-center text-xs uppercase tracking-wide shadow-lg hover:shadow-white/20 hover:scale-105 active:scale-95"
                  >
                    {t('profile.actions.edit_profile')}
                  </Link>
                  <button
                    type="button"
                    onClick={openCreateMenu}
                    aria-label={t('profile.actions.create_post', {
                      defaultValue: 'Create new post',
                    })}
                    className="p-2 bg-brand-primary hover:bg-brand-secondary text-white rounded-lg border border-brand-primary/50 transition-all duration-300 hover:scale-105 active:scale-95 shadow-lg shadow-brand-primary/20"
                  >
                    <Plus size={18} strokeWidth={2.5} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setCreatorMode(!isCreatorModeActive)}
                    className={`px-2 py-1 rounded-lg border transition-all duration-300 hover:scale-105 active:scale-95 shadow-lg flex items-center gap-1 text-xs uppercase font-black tracking-wide
                      ${
                        isCreatorModeActive
                          ? 'bg-brand-primary text-white border-brand-primary/50 shadow-brand-primary/20'
                          : 'bg-white/5 text-gray-300 hover:text-white border-white/5 hover:bg-white/10 hover:shadow-[0_0_15px_rgba(255,255,255,0.1)]'
                      }`}
                    title={
                      isCreatorModeActive
                        ? 'Exit Creator Mode'
                        : 'Enter Creator Mode'
                    }
                  >
                    <Wand2 size={16} aria-hidden="true" />
                    {isCreatorModeActive ? 'Creator' : 'Consumer'}
                  </button>
                  <button
                    type="button"
                    aria-label={t('profile.actions.settings', {
                      defaultValue: 'Settings',
                    })}
                    className="p-2 bg-white/5 hover:bg-white/10 text-white rounded-lg border border-white/5 transition-all duration-300 hover:scale-105 active:scale-95 hover:shadow-[0_0_15px_rgba(255,255,255,0.1)]"
                  >
                    <Settings size={18} aria-hidden="true" />
                  </button>
                </>
              ) : (
                <>
                  <FollowButton username={profile.data.username} />

                  {profile.data.accountType === 'CREATOR' && (
                    <button
                      type="button"
                      onClick={() => subscribeMutation.mutate(undefined)}
                      disabled={subscribeMutation.isPending}
                      className="px-4 py-2 bg-linear-to-r from-yellow-500 to-orange-500 hover:from-yellow-400 hover:to-orange-400 text-white rounded-lg font-black text-xs uppercase tracking-wide transition-all duration-300 hover:scale-105 active:scale-95 shadow-lg flex items-center gap-1 disabled:opacity-50"
                    >
                      <Star size={14} fill="currentColor" aria-hidden="true" />
                      {t('profile.actions.subscribe')}
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => setShowTipModal(true)}
                    className="p-2 bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-500 rounded-lg border border-yellow-500/20 transition-all duration-300 hover:scale-105 active:scale-95"
                    title={t('profile.actions.send_tip')}
                    aria-label={t('profile.actions.send_tip')}
                  >
                    <Gift size={18} aria-hidden="true" />
                  </button>

                  <button
                    type="button"
                    onClick={handleMessageClick}
                    disabled={isCreatingChat}
                    className="px-6 py-2 bg-white/5 hover:bg-white/10 text-white rounded-lg border border-white/5 font-black text-xs uppercase tracking-wide transition-all duration-300 hover:scale-105 active:scale-95 hover:shadow-[0_0_15px_rgba(255,255,255,0.1)] disabled:opacity-50"
                  >
                    {isCreatingChat
                      ? t('profile.actions.opening')
                      : t('profile.actions.message')}
                  </button>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setShowMenu(!showMenu)}
                      aria-label={t('profile.actions.more_options', {
                        defaultValue: 'More options',
                      })}
                      aria-expanded={showMenu}
                      className="p-2 bg-white/5 hover:bg-white/10 text-white rounded-lg border border-white/5 transition-all duration-300 hover:scale-105 active:scale-95"
                    >
                      <MoreHorizontal size={18} aria-hidden="true" />
                    </button>

                    {showMenu && (
                      <div className="absolute top-full mt-2 right-0 bg-surface-raised border border-white/10 rounded-xl shadow-2xl overflow-hidden min-w-[180px] z-60 backdrop-blur-xl animate-in fade-in zoom-in-95">
                        <button
                          type="button"
                          onClick={() => {
                            setShowMenu(false);
                            setShowReportModal(true);
                          }}
                          className="w-full text-left px-2 py-1 text-red-400 hover:bg-white/5 flex items-center justify-between font-bold text-xs uppercase tracking-wider"
                        >
                          {t('profile.actions.report_profile')}
                          <Flag size={14} aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          className="w-full text-left px-2 py-1 text-red-400 hover:bg-white/5 flex items-center justify-between font-bold text-xs uppercase tracking-wider border-t border-white/5"
                          onClick={() => {
                            setShowMenu(false);
                            setShowBlockModal(true);
                          }}
                        >
                          {t('profile.actions.block_user')}
                          <Ban size={14} aria-hidden="true" />
                        </button>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Bio & Details Section */}
        <div className="space-y-4">
          <div className="max-w-xl text-center md:text-left mx-auto md:mx-0">
            {profile.data.bio && (
              <p className="text-zinc-400 text-sm md:text-base leading-relaxed whitespace-pre-wrap">
                {profile.data.bio}
              </p>
            )}

            {(profile.data.website || profile.data.location) && (
              <div className="flex flex-wrap justify-center md:justify-start gap-x-6 gap-y-2 mt-4 text-xs md:text-sm font-medium">
                {profile.data.location && (
                  <span className="flex items-center gap-2 text-zinc-400">
                    <MapPin
                      size={16}
                      className="text-brand-secondary"
                      aria-hidden="true"
                    />
                    {profile.data.location}
                  </span>
                )}
                {profile.data.website && (
                  <a
                    href={
                      profile.data.website.startsWith('http')
                        ? profile.data.website
                        : `https://${profile.data.website}`
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-brand-blue hover:text-blue-300 transition-colors"
                  >
                    <LinkIcon size={16} aria-hidden="true" />
                    <span className="underline decoration-white/10 underline-offset-4">
                      {profile.data.website.replace(/^https?:\/\/(www\.)?/, '')}
                    </span>
                    <ExternalLink
                      size={12}
                      className="opacity-40"
                      aria-hidden="true"
                    />
                  </a>
                )}
              </div>
            )}

            {isMe &&
              profile.data.accountType === 'CREATOR' &&
              profile.data.inviteCode && (
                <div className="mt-4 p-3 bg-white/5 border border-white/10 rounded-xl max-w-sm mx-auto md:mx-0 flex items-center justify-between gap-3 backdrop-blur-md">
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-gray-300 uppercase tracking-wide">
                      {t('profile.invite.title')}
                    </span>
                    <span className="font-mono text-brand-primary font-bold tracking-wider text-sm">
                      {profile.data.inviteCode}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(
                        `${window.location.origin}/register?inviteCode=${profile.data.inviteCode}`,
                      );
                      toast.success(t('profile.invite.copied'));
                    }}
                    className="px-4 py-2 bg-white text-black hover:bg-zinc-200 rounded-lg text-xs font-black uppercase tracking-wider transition-all"
                  >
                    {t('profile.actions.copy_link')}
                  </button>
                </div>
              )}
          </div>

          {/* Mobile Only Action Buttons */}
          <div className="flex md:hidden items-center gap-2 pt-1">
            {isMe ? (
              <>
                <Link
                  to="/accounts/edit"
                  className="flex-1 px-2 py-1 bg-white text-black hover:bg-zinc-200 rounded-xl font-black transition-all flex items-center justify-center text-xs uppercase tracking-wide shadow-lg shadow-white/5"
                >
                  {t('profile.actions.edit_profile')}
                </Link>
                <button
                  type="button"
                  onClick={() => setCreatorMode(!isCreatorModeActive)}
                  className={`flex-1 px-2 py-1 rounded-xl border transition-all flex items-center justify-center gap-1 text-xs uppercase font-black tracking-wide shadow-lg
                    ${
                      isCreatorModeActive
                        ? 'bg-brand-primary text-white border-brand-primary/50 shadow-brand-primary/20'
                        : 'bg-white/5 text-gray-300 border-white/5'
                    }`}
                >
                  <Wand2 size={14} aria-hidden="true" />
                  {isCreatorModeActive ? 'Creator' : 'Consumer'}
                </button>
              </>
            ) : (
              <div className="flex-1 flex gap-2">
                <FollowButton username={profile.data.username} />
                <button
                  type="button"
                  onClick={handleMessageClick}
                  disabled={isCreatingChat}
                  className="flex-1 px-5 py-3 bg-white/5 hover:bg-white/10 text-white rounded-xl border border-white/5 font-black text-xs uppercase tracking-wide transition-all disabled:opacity-50"
                >
                  {isCreatingChat
                    ? t('profile.actions.opening')
                    : t('profile.actions.message')}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
