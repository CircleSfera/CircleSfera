import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Bookmark,
  Clapperboard,
  Plus,
  Shield,
  UserSquare2,
} from 'lucide-react';
import { lazy, Suspense, useState } from 'react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';

import CollectionCard from '../components/collections/CollectionCard';
import SEO from '../components/common/SEO';
import HighlightBubble from '../components/HighlightBubble';
import { ProfileSkeleton, Skeleton } from '../components/LoadingStates';
import PostGrid from '../components/profile/PostGrid';
import ProfileHeader from '../components/profile/ProfileHeader';
import ProfileTabs, { type TabType } from '../components/profile/ProfileTabs';
import StoryViewer from '../components/StoryViewer';
import {
  chatApi,
  followsApi,
  highlightsApi,
  postsApi,
  profileApi,
  storiesApi,
} from '../services';
import { useAuthStore } from '../stores/authStore';
import { useUIStore } from '../stores/uiStore';
import type { Collection, ProfileWithUser, UserWithProfile } from '../types';

const CreateCollectionModal = lazy(
  () => import('../components/collections/CreateCollectionModal'),
);
const FollowersModal = lazy(() => import('../components/FollowersModal'));
const BlockModal = lazy(() => import('../components/modals/BlockModal'));
const CreateHighlightModal = lazy(
  () => import('../components/modals/CreateHighlightModal'),
);
const ReportModal = lazy(() => import('../components/modals/ReportModal'));
const TipModal = lazy(() => import('../components/monetization/TipModal'));

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
  const { isCreatorModeActive, setCreatorMode } = useAuthStore();

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
        <div className="glass-panel inline-block p-8 rounded-lg">
          <h2 className="text-2xl font-bold text-white">
            {t('profile.blocked.title')}
          </h2>
          <p className="text-gray-400 mt-2">{t('profile.blocked.subtitle')}</p>
        </div>
      </div>
    );
  }

  // Helper to render grid

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
          <PostGrid
            items={savedPosts?.data.data || []}
            emptyMessage={t('profile.saved.no_posts_yet')}
            emptySubtext={t('profile.saved.save_to_see')}
            icon={<Bookmark size={32} className="text-white/40" />}
          />
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
          <PostGrid
            items={savedPosts?.data.data || []}
            emptyMessage={t('profile.saved.save')}
            emptySubtext={t('profile.saved.save_desc')}
            icon={<Bookmark size={32} className="text-white/40" />}
          />
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <button
              type="button"
              onClick={() => setIsCreateCollectionModalOpen(true)}
              className="aspect-4/5 rounded-lg border-2 border-dashed border-white/20 flex flex-col items-center justify-center gap-4 hover:bg-white/5 transition-colors group"
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
    <div className="min-h-screen pt-2 md:pt-4 pb-32">
      <SEO
        title={`${profile.data.fullName} (@${profile.data.username})`}
        description={
          profile.data.bio ||
          `See posts and frames from @${profile.data.username} on CircleSfera.`
        }
        ogImage={profile.data.avatar || undefined}
      />
      <div className="max-w-3xl mx-auto px-3 md:px-4">
        {/* Profile Card */}
        <ProfileHeader
          profile={profile}
          isMe={isMe}
          hasActiveStories={!!hasActiveStories}
          isCreatorModeActive={isCreatorModeActive}
          setCreatorMode={setCreatorMode}
          openCreateMenu={openCreateMenu}
          subscribeMutation={subscribeMutation}
          isCreatingChat={isCreatingChat}
          handleMessageClick={handleMessageClick}
          setShowFollowsModal={setShowFollowsModal}
          setShowReportModal={setShowReportModal}
          setShowBlockModal={setShowBlockModal}
          setShowTipModal={setShowTipModal}
          setIsStoryViewerOpen={setIsStoryViewerOpen}
          showMenu={showMenu}
          setShowMenu={setShowMenu}
        />

        {/* Story Highlights */}
        {((highlights?.data && highlights.data.length > 0) || isMe) && (
          <div className="px-2 md:px-4 mb-6 overflow-hidden">
            <div className="flex items-center gap-4 overflow-x-auto pb-4 no-scrollbar scroll-smooth">
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
          <Suspense fallback={null}>
            <CreateHighlightModal
              isOpen={isHighlightModalOpen}
              onClose={() => setIsHighlightModalOpen(false)}
            />
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
          </Suspense>

          {isStoryViewerOpen && hasActiveStories && (
            <StoryViewer
              stories={activeStories}
              initialIndex={0}
              onClose={() => setIsStoryViewerOpen(false)}
            />
          )}

          {/* Tabs */}
          <ProfileTabs
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            isMe={isMe}
            canView={!!canView}
          />
        </div>

        {/* Content Area Grid */}
        <div className="px-0.5 md:px-0">
          {canView ? (
            <>
              {activeTab === 'posts' && (
                <PostGrid
                  items={posts?.data.data || []}
                  emptyMessage={
                    isMe
                      ? t('profile.empty.share_photos')
                      : t('profile.empty.no_posts_yet')
                  }
                  emptySubtext={isMe ? t('profile.empty.share_desc') : ''}
                  icon={
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
                    </svg>
                  }
                />
              )}

              {activeTab === 'frames' && (
                <PostGrid
                  items={frames?.data.data || []}
                  emptyMessage={t('profile.empty.frames')}
                  emptySubtext={t('profile.empty.frames_desc')}
                  icon={<Clapperboard size={32} className="text-white/40" />}
                />
              )}

              {activeTab === 'saved' && renderSavedContent()}

              {activeTab === 'tagged' && (
                <PostGrid
                  items={taggedPosts?.data.data || []}
                  emptyMessage={
                    isMe
                      ? t('profile.empty.tagged_you')
                      : t('profile.empty.tagged_them', {
                          username: profile.data.username,
                        })
                  }
                  emptySubtext={
                    isMe
                      ? t('profile.empty.tagged_desc_you')
                      : t('profile.empty.tagged_desc_them')
                  }
                  icon={<UserSquare2 size={32} className="text-white/40" />}
                />
              )}
            </>
          ) : (
            /* Private Account View */
            <div className="bg-white/5 border border-white/5 rounded-[40px] p-16 text-center animate-in fade-in slide-in-from-bottom-8 duration-700">
              <div className="w-24 h-24 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-8 shadow-2xl">
                <Shield size={40} className="text-zinc-600" />
              </div>
              <h3 className="text-xl font-black text-white mb-4 tracking-tight">
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
      <Suspense fallback={null}>
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
      </Suspense>
    </div>
  );
}
