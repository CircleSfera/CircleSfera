import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Bookmark,
  Clapperboard,
  Grid,
  Heart,
  Link as LinkIcon,
  Lock,
  Menu,
  MessageCircle,
  MoreHorizontal,
  Plus,
  PlusSquare,
  Shield,
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
    <div className="text-center group cursor-pointer flex flex-col items-center">
      <span className="block text-white font-bold text-[17px] md:text-xl transition-all duration-300 origin-center md:origin-left group-hover:scale-110">
        {count}
      </span>
      <span className="text-white/90 text-[13px] md:text-sm mt-0.5 block transition-colors duration-300">
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
  const openCreateMenu = useUIStore((state) => state.openCreateMenu);

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
        {/* IG Style Mobile Top Bar (Only visible on mobile) */}
        <div className="md:hidden flex items-center justify-between py-3 mb-4">
          <div className="flex items-center gap-2">
            {profile.data.isPrivate && (
              <Lock size={18} className="text-white" />
            )}
            <h1 className="text-2xl font-bold text-white tracking-tight">
              {profile.data.username}
            </h1>
            <VerificationBadge
              level={profile.data.verificationLevel as VerificationLevel}
              size={18}
            />
          </div>
          <div className="flex items-center gap-6">
            {isMe && (
              <button
                type="button"
                onClick={openCreateMenu}
                className="text-white focus:outline-none"
              >
                <PlusSquare size={26} strokeWidth={2} />
              </button>
            )}
            <button
              type="button"
              onClick={() =>
                isMe ? navigate('/accounts/edit') : setShowMenu(!showMenu)
              }
              className="text-white focus:outline-none"
            >
              {isMe ? (
                <Menu size={28} strokeWidth={2} />
              ) : (
                <MoreHorizontal size={24} />
              )}
            </button>
          </div>
        </div>

        {/* Profile Card Refactored (IG Style) */}
        <div className="mb-6">
          <div className="flex items-center justify-between gap-4 mb-4">
            {/* Avatar Section */}
            <div className="relative shrink-0 ml-1">
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
                className="w-20 h-20 md:w-32 md:h-32 transition-all duration-300"
              />
              {isMe && (
                <button
                  type="button"
                  onClick={() => setIsHighlightModalOpen(true)}
                  className="absolute bottom-0 right-0 p-1 bg-brand-primary rounded-full text-white shadow-xl hover:scale-110 transition-transform z-20 border-2 border-black"
                >
                  <Plus size={16} strokeWidth={3} />
                </button>
              )}
            </div>

            {/* Stats Row */}
            <div className="flex-1 flex justify-around text-center ml-4">
              <div className="flex flex-col items-center">
                <AnimatedCounter
                  value={profile.data.user?._count?.posts || 0}
                  label={t('profile.stats.posts')}
                />
              </div>
              <button
                type="button"
                onClick={() => setShowFollowsModal('followers')}
                className="flex flex-col items-center"
              >
                <AnimatedCounter
                  value={profile.data.user?._count?.followers || 0}
                  label={t('profile.stats.followers')}
                />
              </button>
              <button
                type="button"
                onClick={() => setShowFollowsModal('following')}
                className="flex flex-col items-center"
              >
                <AnimatedCounter
                  value={profile.data.user?._count?.following || 0}
                  label={t('profile.stats.following')}
                />
              </button>
            </div>
          </div>

          {/* Bio Section */}
          <div className="px-1 mb-4">
            <h2 className="font-bold text-[15px] text-white">
              {profile.data.fullName}
            </h2>
            {profile.data.bio && (
              <p className="text-[14px] text-white mt-1 whitespace-pre-wrap leading-tight">
                {profile.data.bio}
              </p>
            )}
            {(profile.data.website || profile.data.location) && (
              <div className="mt-1 text-[14px]">
                {profile.data.location && (
                  <span className="block text-gray-400">
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
                    className="flex items-center gap-1 font-semibold text-brand-primary mt-1"
                  >
                    <LinkIcon size={14} />
                    {profile.data.website.replace(/^https?:\/\/(www\.)?/, '')}
                  </a>
                )}
              </div>
            )}
          </div>

          {/* Actions Row */}
          <div className="flex gap-2 mb-2">
            {isMe ? (
              <>
                <Link
                  to="/accounts/edit"
                  className="flex-1 bg-white/10 hover:bg-white/20 text-white py-[6px] px-4 rounded-[8px] font-semibold text-[14px] text-center transition-colors"
                >
                  {t('profile.actions.edit_profile', 'Editar perfil')}
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(
                      `${window.location.origin}/${profile.data.username}`,
                    );
                    toast.success('Enlace copiado al portapapeles');
                  }}
                  className="flex-1 bg-white/10 hover:bg-white/20 text-white py-[6px] px-4 rounded-[8px] font-semibold text-[14px] text-center transition-colors"
                >
                  {t('profile.actions.share_profile', 'Compartir perfil')}
                </button>
              </>
            ) : (
              <>
                <div className="flex-1">
                  <FollowButton username={profile.data.username} />
                </div>
                <button
                  type="button"
                  onClick={() => subscribeMutation.mutate()}
                  className="flex-1 bg-brand-primary hover:bg-brand-secondary text-white py-[6px] px-4 rounded-[8px] font-semibold text-[14px] text-center transition-colors"
                >
                  {t('profile.actions.subscribe', 'Suscribirse')}
                </button>
                <button
                  type="button"
                  onClick={handleMessageClick}
                  disabled={isCreatingChat}
                  className="flex-1 bg-white/10 hover:bg-white/20 text-white py-[6px] px-4 rounded-[8px] font-semibold text-[14px] text-center transition-colors disabled:opacity-50"
                >
                  {isCreatingChat
                    ? t('profile.actions.opening')
                    : t('profile.actions.message')}
                </button>
              </>
            )}
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
            <div className="flex justify-around border-t border-white/10 mt-4 mb-1">
              <button
                type="button"
                onClick={() => setActiveTab('posts')}
                className={`flex-1 flex justify-center items-center py-3 transition-colors ${
                  activeTab === 'posts'
                    ? 'border-b-2 border-white text-white'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                <Grid size={22} strokeWidth={activeTab === 'posts' ? 2 : 1.5} />
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('frames')}
                className={`flex-1 flex justify-center items-center py-3 transition-colors ${
                  activeTab === 'frames'
                    ? 'border-b-2 border-white text-white'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                <Clapperboard
                  size={22}
                  strokeWidth={activeTab === 'frames' ? 2 : 1.5}
                />
              </button>
              {isMe && (
                <button
                  type="button"
                  onClick={() => setActiveTab('saved')}
                  className={`flex-1 flex justify-center items-center py-3 transition-colors ${
                    activeTab === 'saved'
                      ? 'border-b-2 border-white text-white'
                      : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  <Bookmark
                    size={22}
                    strokeWidth={activeTab === 'saved' ? 2 : 1.5}
                  />
                </button>
              )}
              <button
                type="button"
                onClick={() => setActiveTab('tagged')}
                className={`flex-1 flex justify-center items-center py-3 transition-colors ${
                  activeTab === 'tagged'
                    ? 'border-b-2 border-white text-white'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                <UserSquare2
                  size={22}
                  strokeWidth={activeTab === 'tagged' ? 2 : 1.5}
                />
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
