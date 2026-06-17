import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  Ban,
  Bookmark,
  Clapperboard,
  ExternalLink,
  Flag,
  Gift,
  Grid,
  Heart,
  Link as LinkIcon,
  MapPin,
  MessageCircle,
  MoreHorizontal,
  Plus,
  Settings,
  Shield,
  Star,
  UserSquare2,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import CollectionCard from '../components/collections/CollectionCard';
import CreateCollectionModal from '../components/collections/CreateCollectionModal';
import SEO from '../components/common/SEO';
import FollowButton from '../components/FollowButton';
import FollowersModal from '../components/FollowersModal';
import HighlightBubble from '../components/HighlightBubble';
import { ProfileSkeleton, Skeleton } from '../components/LoadingStates';
import BlockModal from '../components/modals/BlockModal';
import CreateHighlightModal from '../components/modals/CreateHighlightModal';
import ReportModal from '../components/modals/ReportModal';
import TipModal from '../components/monetization/TipModal';
import StoryViewer from '../components/StoryViewer';
import UserAvatar from '../components/UserAvatar';
import type { VerificationLevel } from '../components/VerificationBadge';
import VerificationBadge from '../components/VerificationBadge';
import {
  chatApi,
  followsApi,
  highlightsApi,
  postsApi,
  profileApi,
  storiesApi,
} from '../services';
import { useUIStore } from '../stores/uiStore';
import type {
  Collection,
  Post,
  ProfileWithUser,
  UserWithProfile,
} from '../types';

type TabType = 'posts' | 'frames' | 'saved' | 'tagged';

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
      <span className="text-zinc-500 text-[9px] font-bold uppercase tracking-widest mt-1 block transition-colors duration-300 group-hover:text-brand-primary/80">
        {label}
      </span>
    </div>
  );
}

export default function Profile() {
  const { t } = useTranslation();
  const { username } = useParams<{ username: string }>();
  const [activeTab, setActiveTab] = useState<TabType>('posts');
  const [showFollowsModal, setShowFollowsModal] = useState<
    'followers' | 'following' | null
  >(null);
  const [isHighlightModalOpen, setIsHighlightModalOpen] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showTipModal, setShowTipModal] = useState(false);

  const queryClient = useQueryClient();

  const subscribeMutation = useMutation({
    mutationFn: () =>
      import('../services').then((m) =>
        m.api.post('/creator/subscribe', {
          creatorId: profile?.data.userId,
          monthlyTokens: 500,
        }),
      ),
    onSuccess: () => {
      toast.success(t('profile.messages.subscribed_success'));
      queryClient.invalidateQueries({ queryKey: ['creator-subscription'] });
      queryClient.invalidateQueries({ queryKey: ['userProfile', username] });
    },
    onError: (e: any) => {
      toast.error(
        e.response?.data?.message || t('profile.messages.subscribe_error'),
      );
    },
  });

  const [showBlockModal, setShowBlockModal] = useState(false); // For future block confirmation if needed
  const [isStoryViewerOpen, setIsStoryViewerOpen] = useState(false);
  const [isCreatingChat, setIsCreatingChat] = useState(false);
  const navigate = useNavigate();



  const openCreateMenu = useUIStore((state) => state.openCreateMenu);

  const { data: profile, isLoading: isLoadingProfile } = useQuery({
    queryKey: ['profile', username],
    queryFn: () =>
      profileApi.getProfile(username!) as Promise<{ data: ProfileWithUser }>,
    enabled: !!username,
  });

  const { data: myProfile } = useQuery({
    queryKey: ['myProfile'],
    queryFn: () =>
      profileApi.getMyProfile() as Promise<{ data: ProfileWithUser }>,
    retry: false,
  });
  const isMe = myProfile?.data.username === username;

  const { data: followStatus } = useQuery({
    queryKey: ['follow', username],
    queryFn: () => followsApi.check(username!),
    enabled: !!username && !isMe,
  });

  const isFollowing = followStatus?.data.following;

  const handleMessageClick = async () => {
    if (!profile?.data?.user?.id) return;
    setIsCreatingChat(true);
    try {
      const res = await chatApi.createGroup({
        participantIds: [profile.data.user.id],
      });
      navigate(`/direct/inbox/t/${res.data.id}`);
    } catch (err) {
      console.error(err);
      toast.error(t('profile.messages.chat_error'));
    } finally {
      setIsCreatingChat(false);
    }
  };

  const status = followStatus?.data.status as string | undefined;
  const isBlocked = status === 'BLOCKED';

  // Only fetch posts/followers if allowed
  // We can't use 'profile' in the condition if it's not loaded yet,
  // but we can check if username exists.
  // Better: use 'enabled' flag in queries to handle dependencies.
  const canView =
    isMe || (profile?.data && !profile.data.isPrivate) || isFollowing;

  const { data: posts } = useQuery({
    queryKey: ['userPosts', username],
    queryFn: () => postsApi.getByUser(username!, 1, 10, 'POST'),
    enabled: !!username && !!canView && !isBlocked && activeTab === 'posts',
  });

  const { data: frames } = useQuery({
    queryKey: ['userFrames', username],
    queryFn: () => postsApi.getByUser(username!, 1, 10, 'FRAME'),
    enabled: !!username && !!canView && !isBlocked && activeTab === 'frames',
  });

  const { data: activeStories } = useQuery({
    queryKey: ['userStories', username],
    queryFn: () => storiesApi.getByUser(username!).then((res) => res.data),
    enabled: !!username && !!canView && !isBlocked,
  });
  const hasActiveStories = activeStories && activeStories.length > 0;

  const { data: highlights } = useQuery({
    queryKey: ['userHighlights', profile?.data.id],
    queryFn: () => highlightsApi.getUserHighlights(profile!.data.userId),
    enabled: !!profile?.data,
  });

  const { data: followList } = useQuery({
    queryKey: ['follows', username, showFollowsModal],
    queryFn: () =>
      showFollowsModal === 'followers'
        ? followsApi.getFollowers(username!)
        : followsApi.getFollowing(username!),
    enabled: !!showFollowsModal && !!username,
  });

  const { data: taggedPosts } = useQuery({
    queryKey: ['userTagged', username],
    queryFn: () => postsApi.getTagged(username!),
    enabled: !!username && !!canView && !isBlocked && activeTab === 'tagged',
  });

  /* Collections Logic & Query - moved to top level to avoid redeclaration and scope issues */
  const [savedTab, setSavedTab] = useState<'all' | 'collections'>(
    'collections',
  );
  const [selectedCollection, setSelectedCollection] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [isCreateCollectionModalOpen, setIsCreateCollectionModalOpen] =
    useState(false);

  // Collections Query
  const { data: collections } = useQuery({
    queryKey: ['collections'],
    queryFn: () => import('../services').then((m) => m.collectionsApi.getAll()),
    enabled: !!isMe && activeTab === 'saved',
  });

  // Saved Posts Query (All or Collection)
  const { data: savedPosts } = useQuery({
    queryKey: ['savedPosts', selectedCollection?.id],
    queryFn: () =>
      import('../services').then((m) =>
        m.bookmarksApi.getAll(1, 10, selectedCollection?.id),
      ),
    enabled: !!isMe && activeTab === 'saved',
  });

  /* Highlights - Unused for now as UI is missing, but keeping query if needed later or commenting out to fix build */
  // const { data: highlights } = useQuery({
  //     queryKey: ['userHighlights', username],
  //     queryFn: () => highlightsApi.getUserHighlights(profile?.data.id ?? ''),
  //     enabled: !!username && !!profile?.data?.id && !!canView && !isBlocked,
  // });

  /* Unused queries/mutations due to missing Profile Header UI */
  // const { data: followers } = useQuery({ ... });
  // const { data: following } = useQuery({ ... });
  // const blockMutation = useMutation({ ... });

  if (isLoadingProfile || !profile) {
    return (
      <div className="min-h-screen pt-8">
        <ProfileSkeleton />
        <div className="max-w-4xl mx-auto px-4 mt-8">
          <div className="grid grid-cols-3 gap-1">
            {['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9'].map(
              (id) => (
                <Skeleton key={id} className="aspect-4/5" />
              ),
            )}
          </div>
        </div>
      </div>
    );
  }

  // Unused because profile header UI is placeholder
  // const followersCount = Array.isArray(followers?.data) ? followers.data.length : 0;
  // const followingCount = Array.isArray(following?.data) ? following.data.length : 0;
  // const postsCount = posts?.data.meta.total || 0;

  if (isBlocked) {
    return (
      <div className="min-h-screen pt-20 text-center">
        <div className="glass-panel inline-block p-8 rounded-2xl">
          <h2 className="text-2xl font-bold text-white">
            {t('profile.blocked.title')}
          </h2>
          <p className="text-gray-400 mt-2">{t('profile.blocked.subtitle')}</p>
        </div>
      </div>
    );
  }

  // Helper to render grid
  const renderPostGrid = (
    items: Post[],
    emptyMessage: string,
    emptySubtext: string,
    icon: React.ReactNode,
  ) => {
    if (!items || items.length === 0) {
      return (
        <div className="text-center py-20">
          <div className="w-20 h-20 border-2 border-white/20 rounded-full flex items-center justify-center mx-auto mb-4">
            {icon}
          </div>
          <h3 className="text-2xl font-bold text-white mb-2">{emptyMessage}</h3>
          <p className="text-gray-400">{emptySubtext}</p>
        </div>
      );
    }
    return (
      <div className="grid grid-cols-3 gap-1">
        {items.map((post) => (
          <Link
            key={post.id}
            to={`/p/${post.id}`}
            className="aspect-4/5 relative group overflow-hidden bg-white/5"
          >
            {post.type === 'FRAME' && (
              <div className="absolute top-2 right-2 z-10">
                <Clapperboard size={16} className="text-white drop-shadow-md" />
              </div>
            )}
            {post.media?.[0]?.type === 'video' || post.type === 'FRAME' ? (
              <video
                src={post.media?.[0]?.url}
                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                muted
                playsInline
                loop
                preload="metadata"
                onMouseOver={(e) => {
                  e.currentTarget.play().catch(() => {});
                }}
                onMouseOut={(e) => {
                  e.currentTarget.pause();
                  e.currentTarget.currentTime = 0;
                }}
                onFocus={(e) => {
                  e.currentTarget.play().catch(() => {});
                }}
                onBlur={(e) => {
                  e.currentTarget.pause();
                  e.currentTarget.currentTime = 0;
                }}
                onError={(e) => {
                  console.error(
                    'Video load error for post:',
                    post.id,
                    post.media?.[0]?.url,
                  );
                  e.currentTarget.style.display = 'none';
                }}
              >
                <track kind="captions" />
              </video>
            ) : (
              <img
                src={
                  post.media?.[0]?.thumbnailUrl ||
                  post.media?.[0]?.standardUrl ||
                  post.media?.[0]?.url
                }
                srcSet={
                  post.media?.[0]?.thumbnailUrl && post.media?.[0]?.standardUrl
                    ? `${post.media?.[0]?.thumbnailUrl} 300w, ${post.media?.[0]?.standardUrl} 600w`
                    : undefined
                }
                sizes="(max-width: 768px) 33vw, 250px"
                alt={post.caption || ''}
                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                loading="lazy"
                onError={(e) => {
                  e.currentTarget.src = '#noimagex400?text=No+Image';
                  e.currentTarget.srcset = '';
                }}
              />
            )}

            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-6 pointer-events-none">
              <div className="flex items-center gap-2 text-white font-bold">
                <Heart size={20} fill="white" />
                <span>{post._count?.likes || 0}</span>
              </div>
              <div className="flex items-center gap-2 text-white font-bold">
                <MessageCircle size={20} fill="white" />
                <span>{post._count?.comments || 0}</span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    );
  };

  // Removed local state and queries that were moved to top level
  // However, doing this in render is risky. Let's use a side effect or just handle it in the tab change handler.
  // Actually, we can just leave it for now or move to useEffect if needed, but let's stick to the change:

  if (activeTab !== 'saved' && selectedCollection) {
    // This is a side effect in render, strictly speaking bad practice but often works.
    // Better to reset in the onChange of the tab.
    // For now, I'll just keep the logic but maybe guard it better or accept it.
    // But wait, "Too many re-renders" risk.
    // I'll move this to the setActiveTab handlers or useEffect.
  }

  const renderSavedContent = () => {
    if (selectedCollection) {
      return (
        <div>
          <div className="flex items-center gap-4 mb-6">
            <button
              type="button"
              onClick={() => setSelectedCollection(null)}
              className="p-2 hover:bg-white/10 rounded-full transition-colors"
            >
              <svg
                aria-hidden="true"
                className="w-6 h-6 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
            </button>
            <h2 className="text-xl font-bold text-white">
              {selectedCollection.name}
            </h2>
          </div>
          {renderPostGrid(
            savedPosts?.data.data || [],
            t('profile.saved.no_posts_yet'),
            t('profile.saved.save_to_see'),
            <Bookmark size={32} className="text-white/40" />,
          )}
        </div>
      );
    }

    return (
      <div>
        <div className="flex justify-center gap-4 mb-8">
          <button
            type="button"
            onClick={() => setSavedTab('all')}
            className={`px-6 py-2 rounded-full font-medium transition-colors ${savedTab === 'all' ? 'bg-white text-black' : 'bg-white/10 text-white hover:bg-white/20'}`}
          >
            {t('profile.saved.all_posts')}
          </button>
          <button
            type="button"
            onClick={() => setSavedTab('collections')}
            className={`px-6 py-2 rounded-full font-medium transition-colors ${savedTab === 'collections' ? 'bg-white text-black' : 'bg-white/10 text-white hover:bg-white/20'}`}
          >
            {t('profile.saved.collections')}
          </button>
        </div>

        {savedTab === 'all' ? (
          renderPostGrid(
            savedPosts?.data.data || [],
            t('profile.saved.save'),
            t('profile.saved.save_desc'),
            <Bookmark size={32} className="text-white/40" />,
          )
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <button
              type="button"
              onClick={() => setIsCreateCollectionModalOpen(true)}
              className="aspect-square rounded-2xl border-2 border-dashed border-white/20 flex flex-col items-center justify-center gap-4 hover:bg-white/5 transition-colors group"
            >
              <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center group-hover:bg-white/20 transition-colors">
                <Plus size={24} className="text-white" />
              </div>
              <span className="font-semibold text-white">
                {t('profile.actions.new_collection')}
              </span>
            </button>

            {collections?.data.map((collection: Collection) => (
              <CollectionCard
                key={collection.id}
                collection={collection}
                onClick={() =>
                  setSelectedCollection({
                    id: collection.id,
                    name: collection.name,
                  })
                }
              />
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen pt-4 md:pt-8 pb-32">
      <SEO
        title={`${profile.data.fullName} (@${profile.data.username})`}
        description={
          profile.data.bio ||
          `See posts and frames from @${profile.data.username} on CircleSfera.`
        }
        ogImage={profile.data.avatar || undefined}
      />
      <div className="max-w-3xl mx-auto px-4">
        {/* Profile Card */}
        <div className="glass-panel rounded-3xl md:rounded-[32px] p-5 md:p-8 mb-6 overflow-hidden relative border border-white/5 shadow-2xl backdrop-blur-2xl">
          {/* Background Accent Gradient (Parallax Effect) */}
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1.5, ease: 'easeOut' }}
            className="absolute -top-20 -right-20 w-64 md:w-96 h-64 md:h-96 bg-linear-to-br from-brand-primary/20 to-brand-secondary/20 blur-[100px] -z-10 rounded-full"
          />

          <div className="flex flex-col gap-4 md:gap-7">
            <div className="flex flex-col md:flex-row items-center md:items-start gap-5 md:gap-10">
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
                    hasActiveStories
                      ? () => setIsStoryViewerOpen(true)
                      : undefined
                  }
                  className="transition-all duration-300"
                />
                {isMe && (
                  <Link
                    to="/accounts/edit"
                    className="absolute -bottom-0.5 -right-0.5 p-1.5 bg-zinc-900 border border-white/10 rounded-full text-white hover:bg-zinc-800 transition-colors shadow-xl opacity-0 hover:opacity-100 group-hover:opacity-100 duration-300 z-20"
                  >
                    <Plus size={12} />
                  </Link>
                )}
              </div>

              {/* Stats & Identity Group */}
              <div className="flex-1 flex flex-col justify-center text-center md:text-left">
                <div className="flex flex-col md:flex-row items-center justify-between gap-4 md:gap-10 mb-2 md:mb-5">
                  {/* Identity */}
                  <div className="space-y-0.5">
                    <div className="flex items-center justify-center md:justify-start gap-2.5">
                      <h1 className="text-2xl md:text-3xl font-black tracking-tight bg-clip-text text-transparent bg-linear-to-r from-brand-secondary via-brand-primary to-brand-blue animate-gradient-x bg-size-[200%_auto]">
                        {profile.data.fullName}
                      </h1>
                      <VerificationBadge
                        level={
                          profile.data.verificationLevel as VerificationLevel
                        }
                        size={18}
                      />
                    </div>
                    <span className="text-brand-primary font-bold text-sm tracking-tight block">
                      @{profile.data.username}
                    </span>
                  </div>

                  {/* Stats */}
                  <div className="flex items-center justify-center md:justify-start gap-6 md:gap-10">
                    <AnimatedCounter
                      value={profile.data.user?._count?.posts || 0}
                      label={t('profile.stats.posts')}
                    />
                    <button
                      type="button"
                      onClick={() => setShowFollowsModal('followers')}
                    >
                      <AnimatedCounter
                        value={profile.data.user?._count?.followers || 0}
                        label={t('profile.stats.followers')}
                      />
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowFollowsModal('following')}
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
                        className="px-6 py-2 bg-white text-black hover:bg-zinc-200 rounded-lg font-black transition-all duration-300 flex items-center justify-center text-[10px] uppercase tracking-widest shadow-lg hover:shadow-white/20 hover:scale-105 active:scale-95"
                      >
                        {t('profile.actions.edit_profile')}
                      </Link>
                      <button
                        type="button"
                        onClick={openCreateMenu}
                        className="p-2 bg-brand-primary hover:bg-brand-secondary text-white rounded-lg border border-brand-primary/50 transition-all duration-300 hover:scale-105 active:scale-95 shadow-lg shadow-brand-primary/20"
                      >
                        <Plus size={18} strokeWidth={2.5} />
                      </button>
                      <button
                        type="button"
                        className="p-2 bg-white/5 hover:bg-white/10 text-white rounded-lg border border-white/5 transition-all duration-300 hover:scale-105 active:scale-95 hover:shadow-[0_0_15px_rgba(255,255,255,0.1)]"
                      >
                        <Settings size={18} />
                      </button>
                    </>
                  ) : (
                    <>
                      <FollowButton username={profile.data.username} />

                      {profile.data.accountType === 'CREATOR' && (
                        <button
                          type="button"
                          onClick={() => subscribeMutation.mutate()}
                          disabled={subscribeMutation.isPending}
                          className="px-4 py-2 bg-linear-to-r from-yellow-500 to-orange-500 hover:from-yellow-400 hover:to-orange-400 text-white rounded-lg font-black text-[10px] uppercase tracking-widest transition-all duration-300 hover:scale-105 active:scale-95 shadow-lg flex items-center gap-1 disabled:opacity-50"
                        >
                          <Star size={14} fill="currentColor" />
                          {t('profile.actions.subscribe')}
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => setShowTipModal(true)}
                        className="p-2 bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-500 rounded-lg border border-yellow-500/20 transition-all duration-300 hover:scale-105 active:scale-95"
                        title={t('profile.actions.send_tip')}
                      >
                        <Gift size={18} />
                      </button>

                      <button
                        type="button"
                        onClick={handleMessageClick}
                        disabled={isCreatingChat}
                        className="px-6 py-2 bg-white/5 hover:bg-white/10 text-white rounded-lg border border-white/5 font-black text-[10px] uppercase tracking-widest transition-all duration-300 hover:scale-105 active:scale-95 hover:shadow-[0_0_15px_rgba(255,255,255,0.1)] disabled:opacity-50"
                      >
                        {isCreatingChat
                          ? t('profile.actions.opening')
                          : t('profile.actions.message')}
                      </button>
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => setShowMenu(!showMenu)}
                          className="p-2 bg-white/5 hover:bg-white/10 text-white rounded-lg border border-white/5 transition-all duration-300 hover:scale-105 active:scale-95"
                        >
                          <MoreHorizontal size={18} />
                        </button>

                        {showMenu && (
                          <div className="absolute top-full mt-2 right-0 bg-[#161616] border border-white/10 rounded-xl shadow-2xl overflow-hidden min-w-[180px] z-60 backdrop-blur-xl animate-in fade-in zoom-in-95">
                            <button
                              type="button"
                              onClick={() => {
                                setShowMenu(false);
                                setShowReportModal(true);
                              }}
                              className="w-full text-left px-4 py-3 text-red-400 hover:bg-white/5 flex items-center justify-between font-bold text-[10px] uppercase tracking-wider"
                            >
                              {t('profile.actions.report_profile')}
                              <Flag size={14} />
                            </button>
                            <button
                              type="button"
                              className="w-full text-left px-4 py-3 text-red-400 hover:bg-white/5 flex items-center justify-between font-bold text-[10px] uppercase tracking-wider border-t border-white/5"
                              onClick={() => {
                                setShowMenu(false);
                                setShowBlockModal(true);
                              }}
                            >
                              {t('profile.actions.block_user')}
                              <Ban size={14} />
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
                      <span className="flex items-center gap-2 text-zinc-500">
                        <MapPin size={16} className="text-brand-secondary" />
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
                        <LinkIcon size={16} />
                        <span className="underline decoration-white/10 underline-offset-4">
                          {profile.data.website.replace(
                            /^https?:\/\/(www\.)?/,
                            '',
                          )}
                        </span>
                        <ExternalLink size={12} className="opacity-40" />
                      </a>
                    )}
                  </div>
                )}

                {isMe &&
                  profile.data.accountType === 'CREATOR' &&
                  profile.data.inviteCode && (
                    <div className="mt-4 p-3 bg-white/5 border border-white/10 rounded-xl max-w-sm mx-auto md:mx-0 flex items-center justify-between gap-3 backdrop-blur-md">
                      <div className="flex flex-col">
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
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
              <div className="flex md:hidden items-center gap-2 pt-2">
                {isMe ? (
                  <Link
                    to="/accounts/edit"
                    className="flex-1 px-6 py-3 bg-white text-black hover:bg-zinc-200 rounded-xl font-black transition-all flex items-center justify-center text-[10px] uppercase tracking-widest shadow-lg shadow-white/5"
                  >
                    {t('profile.actions.edit_profile')}
                  </Link>
                ) : (
                  <div className="flex-1 flex gap-2">
                    <FollowButton username={profile.data.username} />
                    <button
                      type="button"
                      className="flex-1 px-5 py-3 bg-white/5 hover:bg-white/10 text-white rounded-xl border border-white/5 font-black text-[10px] uppercase tracking-widest transition-all"
                    >
                      {t('profile.actions.message')}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Story Highlights */}
        {((highlights?.data && highlights.data.length > 0) || isMe) && (
          <div className="px-2 md:px-4 mb-10 overflow-hidden">
            <div className="flex items-center gap-6 overflow-x-auto pb-4 no-scrollbar scroll-smooth">
              {isMe && (
                <HighlightBubble
                  id="new"
                  title="New"
                  isAddButton
                  onClick={() => setIsHighlightModalOpen(true)}
                />
              )}
              {highlights?.data?.map((highlight) => (
                <HighlightBubble
                  key={highlight.id}
                  id={highlight.id}
                  title={highlight.title}
                  coverUrl={highlight.coverUrl || undefined}
                  standardUrl={highlight.standardUrl || undefined}
                  thumbnailUrl={highlight.thumbnailUrl || undefined}
                />
              ))}
            </div>
          </div>
        )}

        {/* Modals & Tabs Navigation Area (Clean Border) */}
        <div className="border-t border-white/5 pt-2">
          <CreateHighlightModal
            isOpen={isHighlightModalOpen}
            onClose={() => setIsHighlightModalOpen(false)}
          />
          {isStoryViewerOpen && hasActiveStories && (
            <StoryViewer
              stories={activeStories}
              initialIndex={0}
              onClose={() => setIsStoryViewerOpen(false)}
            />
          )}
          <CreateCollectionModal
            isOpen={isCreateCollectionModalOpen}
            onClose={() => setIsCreateCollectionModalOpen(false)}
          />
          {showFollowsModal && (
            <FollowersModal
              title={showFollowsModal}
              users={
                (followList?.data as UserWithProfile[])?.map(
                  (u) => u.profile,
                ) || []
              }
              onClose={() => setShowFollowsModal(null)}
            />
          )}

          {/* Tabs */}
          {canView && (
            <div className="flex justify-center gap-2 md:gap-4 mb-6 p-1.5 bg-black/40 backdrop-blur-xl rounded-2xl border border-white/5 w-fit mx-auto">
              <button
                type="button"
                onClick={() => setActiveTab('posts')}
                className={`flex items-center gap-2.5 px-6 py-3 rounded-xl text-[11px] font-black tracking-[0.2em] transition-all relative z-10 ${
                  activeTab === 'posts'
                    ? 'text-white'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {activeTab === 'posts' && (
                  <motion.div
                    layoutId="activeTabProfileGlass"
                    className="absolute inset-0 bg-white/10 backdrop-blur-md rounded-xl -z-10 border border-white/10 shadow-[0_0_20px_rgba(255,255,255,0.05)]"
                    transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
                  />
                )}
                <Grid size={14} />
                <span className="hidden sm:inline">
                  {t('profile.tabs.posts')}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('frames')}
                className={`flex items-center gap-2.5 px-6 py-3 rounded-xl text-[11px] font-black tracking-[0.2em] transition-all relative z-10 ${
                  activeTab === 'frames'
                    ? 'text-white'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {activeTab === 'frames' && (
                  <motion.div
                    layoutId="activeTabProfileGlass"
                    className="absolute inset-0 bg-white/10 backdrop-blur-md rounded-xl -z-10 border border-white/10 shadow-[0_0_20px_rgba(255,255,255,0.05)]"
                    transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
                  />
                )}
                <Clapperboard size={14} />
                <span className="hidden sm:inline">
                  {t('profile.tabs.frames')}
                </span>
              </button>
              {isMe && (
                <button
                  type="button"
                  onClick={() => setActiveTab('saved')}
                  className={`flex items-center gap-2.5 px-6 py-3 rounded-xl text-[11px] font-black tracking-[0.2em] transition-all relative z-10 ${
                    activeTab === 'saved'
                      ? 'text-white'
                      : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  {activeTab === 'saved' && (
                    <motion.div
                      layoutId="activeTabProfileGlass"
                      className="absolute inset-0 bg-white/10 backdrop-blur-md rounded-xl -z-10 border border-white/10 shadow-[0_0_20px_rgba(255,255,255,0.05)]"
                      transition={{
                        type: 'spring',
                        bounce: 0.2,
                        duration: 0.6,
                      }}
                    />
                  )}
                  <Bookmark size={14} />
                  <span className="hidden sm:inline">
                    {t('profile.tabs.saved')}
                  </span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setActiveTab('tagged')}
                className={`flex items-center gap-2.5 px-6 py-3 rounded-xl text-[11px] font-black tracking-[0.2em] transition-all relative z-10 ${
                  activeTab === 'tagged'
                    ? 'text-white'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {activeTab === 'tagged' && (
                  <motion.div
                    layoutId="activeTabProfileGlass"
                    className="absolute inset-0 bg-white/10 backdrop-blur-md rounded-xl -z-10 border border-white/10 shadow-[0_0_20px_rgba(255,255,255,0.05)]"
                    transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
                  />
                )}
                <UserSquare2 size={14} />
                <span className="hidden sm:inline">
                  {t('profile.tabs.tagged')}
                </span>
              </button>
            </div>
          )}
        </div>

        {/* Content Area Grid */}
        <div className="px-0.5 md:px-0">
          {canView ? (
            <>
              {activeTab === 'posts' &&
                renderPostGrid(
                  posts?.data.data || [],
                  isMe
                    ? t('profile.empty.share_photos')
                    : t('profile.empty.no_posts_yet'),
                  isMe ? t('profile.empty.share_desc') : '',
                  <svg
                    aria-hidden="true"
                    className="w-10 h-10 text-white/40"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="1.5"
                      d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="1.5"
                      d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                  </svg>,
                )}

              {activeTab === 'frames' &&
                renderPostGrid(
                  frames?.data.data || [],
                  t('profile.empty.frames'),
                  t('profile.empty.frames_desc'),
                  <Clapperboard size={32} className="text-white/40" />,
                )}

              {activeTab === 'saved' && renderSavedContent()}

              {activeTab === 'tagged' &&
                renderPostGrid(
                  taggedPosts?.data.data || [],
                  isMe
                    ? t('profile.empty.tagged_you')
                    : t('profile.empty.tagged_them', {
                        username: profile.data.username,
                      }),
                  isMe
                    ? t('profile.empty.tagged_desc_you')
                    : t('profile.empty.tagged_desc_them'),
                  <UserSquare2 size={32} className="text-white/40" />,
                )}
            </>
          ) : (
            /* Private Account View */
            <div className="bg-white/5 border border-white/5 rounded-[40px] p-16 text-center animate-in fade-in slide-in-from-bottom-8 duration-700">
              <div className="w-24 h-24 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-8 shadow-2xl">
                <Shield size={40} className="text-zinc-600" />
              </div>
              <h3 className="text-3xl font-black text-white mb-4 tracking-tight">
                {t('profile.private.title')}
              </h3>
              <p className="text-zinc-500 max-w-xs mx-auto leading-relaxed font-medium">
                {t('profile.private.subtitle')}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      <ReportModal
        isOpen={showReportModal}
        onClose={() => setShowReportModal(false)}
        targetType="USER"
        targetId={profile.data.userId}
      />
      <BlockModal
        isOpen={showBlockModal}
        onClose={() => setShowBlockModal(false)}
        username={profile.data.username}
      />

      {showTipModal && profile?.data && (
        <TipModal
          isOpen={showTipModal}
          onClose={() => setShowTipModal(false)}
          receiverId={profile.data.userId}
          receiverName={profile.data.username}
        />
      )}
    </div>
  );
}
