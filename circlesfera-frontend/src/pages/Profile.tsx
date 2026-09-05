import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { Bookmark, Clapperboard, Plus, UserSquare2 } from 'lucide-react';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';

import CollectionCard from '../components/collections/CollectionCard';
import SEO from '../components/common/SEO';
import { EmptyState } from '../components/ErrorEmptyStates';
import HighlightBubble from '../components/HighlightBubble';
import { ProfileSkeleton, Skeleton } from '../components/LoadingStates';
import PostGrid from '../components/profile/PostGrid';
import ProfileHeader from '../components/profile/ProfileHeader';
import ProfileTabs, { type TabType } from '../components/profile/ProfileTabs';
import { profileTabFromParam } from '../components/profile/profileTabUtils';
import {
  bookmarksApi,
  chatApi,
  followsApi,
  highlightsApi,
  postsApi,
  profileApi,
  storiesApi,
} from '../services';
import { useAuthStore } from '../stores/authStore';
import { useStoryStore } from '../stores/storyStore';
import { useUIStore } from '../stores/uiStore';
import type { Collection, ProfileWithUser } from '../types';

const CreateCollectionModal = lazy(
  () => import('../components/collections/CreateCollectionModal'),
);
const FollowersModal = lazy(() => import('../components/FollowersModal'));
const BlockModal = lazy(() => import('../components/modals/BlockModal'));
const CreateHighlightModal = lazy(
  () => import('../components/modals/CreateHighlightModal'),
);
const CloseFriendsModal = lazy(
  () => import('../components/modals/CloseFriendsModal'),
);
const ReportModal = lazy(() => import('../components/modals/ReportModal'));
const TipModal = lazy(() => import('../components/monetization/TipModal'));

const PROFILE_PAGE_SIZE = 18;

export default function Profile() {
  const { t } = useTranslation();
  const { username } = useParams<{ username: string }>();
  const [showFollowsModal, setShowFollowsModal] = useState<
    'followers' | 'following' | null
  >(null);
  const [isHighlightModalOpen, setIsHighlightModalOpen] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showTipModal, setShowTipModal] = useState(false);

  const queryClient = useQueryClient();

  const [showBlockModal, setShowBlockModal] = useState(false);
  const [showCloseFriendsModal, setShowCloseFriendsModal] = useState(false);
  const [isCreatingChat, setIsCreatingChat] = useState(false);
  const openStories = useStoryStore((state) => state.openStories);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const handledCheckoutReturn = useRef(false);

  const openCreateMenu = useUIStore((state) => state.openCreateMenu);
  const isCreatorModeActive = useAuthStore(
    (state) => state.isCreatorModeActive,
  );
  const setCreatorMode = useAuthStore((state) => state.setCreatorMode);

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
  const activeTab = profileTabFromParam(searchParams.get('tab'), isMe);

  const [savedTab, setSavedTab] = useState<'all' | 'collections'>(
    'collections',
  );
  const [selectedCollection, setSelectedCollection] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const setActiveTab = (tab: TabType) => {
    const next = new URLSearchParams(searchParams);
    if (tab === 'posts') {
      next.delete('tab');
    } else {
      next.set('tab', tab);
    }
    setSearchParams(next, { replace: true });
    if (tab !== 'saved') {
      setSelectedCollection(null);
    }
  };

  // Create menu Destacadas deep-link (legacy query)
  useEffect(() => {
    if (!isMe) return;
    if (searchParams.get('action') !== 'highlights') return;
    setIsHighlightModalOpen(true);
    const next = new URLSearchParams(searchParams);
    next.delete('action');
    setSearchParams(next, { replace: true });
  }, [isMe, searchParams, setSearchParams]);

  useEffect(() => {
    if (handledCheckoutReturn.current) return;
    const success = searchParams.get('success') === 'true';
    const canceled = searchParams.get('canceled') === 'true';
    if (!success && !canceled) return;

    handledCheckoutReturn.current = true;

    if (success) {
      toast.success(
        t(
          'profile.messages.checkout_success',
          'Payment successful. Thanks for your support!',
        ),
      );
      queryClient.invalidateQueries({
        queryKey: ['creator-subscription', profile?.data.userId],
      });
      queryClient.invalidateQueries({ queryKey: ['profile', username] });
      queryClient.invalidateQueries({ queryKey: ['userPosts', username] });
    } else {
      toast.error(
        t('profile.messages.checkout_canceled', 'Checkout was canceled.'),
      );
    }

    const next = new URLSearchParams(searchParams);
    next.delete('success');
    next.delete('canceled');
    next.delete('session_id');
    setSearchParams(next, { replace: true });
  }, [
    profile?.data.userId,
    queryClient,
    searchParams,
    setSearchParams,
    t,
    username,
  ]);

  const { data: followStatus } = useQuery({
    queryKey: ['follow', username],
    queryFn: () => followsApi.check(username!),
    enabled: !!username && !isMe,
  });

  const isFollowing = followStatus?.data.following;

  const handleMessageClick = async () => {
    if (!profile?.data?.id) return;
    setIsCreatingChat(true);
    try {
      const res = await chatApi.createGroup({
        participantIds: [profile.data.id],
      });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
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

  const isPrivateAccount = !!(
    profile?.data?.isPrivate ||
    profile?.data?.user?.settings?.privacyLevel === 'PRIVATE'
  );
  const canView = isMe || !isPrivateAccount || isFollowing;

  const {
    data: postsPages,
    fetchNextPage: fetchNextPosts,
    hasNextPage: hasNextPosts,
    isFetchingNextPage: isFetchingNextPosts,
  } = useInfiniteQuery({
    queryKey: ['userPosts', username],
    queryFn: async ({ pageParam }) => {
      const res = await postsApi.getByUser(
        username!,
        pageParam as number,
        PROFILE_PAGE_SIZE,
        'POST',
      );
      return res.data;
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.meta.page < lastPage.meta.totalPages
        ? lastPage.meta.page + 1
        : undefined,
    enabled: !!username && !!canView && !isBlocked && activeTab === 'posts',
  });
  const posts = postsPages?.pages.flatMap((page) => page.data) ?? [];

  const {
    data: framesPages,
    fetchNextPage: fetchNextFrames,
    hasNextPage: hasNextFrames,
    isFetchingNextPage: isFetchingNextFrames,
  } = useInfiniteQuery({
    queryKey: ['userFrames', username],
    queryFn: async ({ pageParam }) => {
      const res = await postsApi.getByUser(
        username!,
        pageParam as number,
        PROFILE_PAGE_SIZE,
        'FRAME',
      );
      return res.data;
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.meta.page < lastPage.meta.totalPages
        ? lastPage.meta.page + 1
        : undefined,
    enabled: !!username && !!canView && !isBlocked && activeTab === 'frames',
  });
  const frames = framesPages?.pages.flatMap((page) => page.data) ?? [];

  const {
    data: taggedPages,
    fetchNextPage: fetchNextTagged,
    hasNextPage: hasNextTagged,
    isFetchingNextPage: isFetchingNextTagged,
  } = useInfiniteQuery({
    queryKey: ['userTagged', username],
    queryFn: async ({ pageParam }) => {
      const res = await postsApi.getTagged(
        username!,
        pageParam as number,
        PROFILE_PAGE_SIZE,
      );
      return res.data;
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.meta.page < lastPage.meta.totalPages
        ? lastPage.meta.page + 1
        : undefined,
    enabled: !!username && !!canView && !isBlocked && activeTab === 'tagged',
  });
  const taggedPosts = taggedPages?.pages.flatMap((page) => page.data) ?? [];

  const { data: activeStories } = useQuery({
    queryKey: ['userStories', username],
    queryFn: () => storiesApi.getByUser(username!).then((res) => res.data),
    enabled: !!username && !!canView && !isBlocked,
  });
  const hasActiveStories = activeStories && activeStories.length > 0;

  const { data: highlights } = useQuery({
    queryKey: ['userHighlights', profile?.data.id],
    queryFn: () => highlightsApi.getProfileHighlights(profile!.data.id),
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

  const [isCreateCollectionModalOpen, setIsCreateCollectionModalOpen] =
    useState(false);

  const savedPostsEnabled =
    !!isMe &&
    activeTab === 'saved' &&
    (savedTab === 'all' || !!selectedCollection);

  const {
    data: savedPages,
    fetchNextPage: fetchNextSaved,
    hasNextPage: hasNextSaved,
    isFetchingNextPage: isFetchingNextSaved,
  } = useInfiniteQuery({
    queryKey: ['savedPosts', selectedCollection?.id],
    queryFn: async ({ pageParam }) => {
      const res = await bookmarksApi.getAll(
        pageParam as number,
        PROFILE_PAGE_SIZE,
        selectedCollection?.id,
      );
      return res.data;
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.meta.page < lastPage.meta.totalPages
        ? lastPage.meta.page + 1
        : undefined,
    enabled: savedPostsEnabled,
  });
  const savedPosts = savedPages?.pages.flatMap((page) => page.data) ?? [];

  // Collections Query
  const { data: collections } = useQuery({
    queryKey: ['collections'],
    queryFn: () => import('../services').then((m) => m.collectionsApi.getAll()),
    enabled: !!isMe && activeTab === 'saved',
  });

  if (isLoadingProfile || !profile) {
    return (
      <div className="min-h-dvh pt-8">
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

  if (isBlocked) {
    return (
      <div className="min-h-dvh pt-20 text-center">
        <div className="glass-panel inline-block p-8 rounded-lg">
          <h2 className="text-2xl font-bold text-white">
            {t('profile.blocked.title')}
          </h2>
          <p className="text-gray-300 mt-2">{t('profile.blocked.subtitle')}</p>
        </div>
      </div>
    );
  }

  // Helper to render saved tab content
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
            items={savedPosts}
            emptyMessage={t('profile.saved.no_posts_yet')}
            emptySubtext={t('profile.saved.save_to_see')}
            icon={<Bookmark size={32} className="text-white/40" />}
            onLoadMore={() => fetchNextSaved()}
            hasMore={!!hasNextSaved}
            isLoadingMore={isFetchingNextSaved}
          />
        </div>
      );
    }

    return (
      <div>
        <div className="flex justify-center gap-1.5 mb-6 p-1 bg-black/40 backdrop-blur-xl rounded-lg border border-white/5 w-fit mx-auto">
          <button
            type="button"
            onClick={() => {
              setSavedTab('all');
              setSelectedCollection(null);
            }}
            className={`px-3 md:px-5 py-1.5 md:py-2 rounded-xl text-xs font-black tracking-wide transition-all ${
              savedTab === 'all'
                ? 'text-white bg-white/10 border border-white/10'
                : 'text-zinc-400 hover:text-zinc-300'
            }`}
          >
            {t('profile.saved.all_posts')}
          </button>
          <button
            type="button"
            onClick={() => {
              setSavedTab('collections');
              setSelectedCollection(null);
            }}
            className={`px-3 md:px-5 py-1.5 md:py-2 rounded-xl text-xs font-black tracking-wide transition-all ${
              savedTab === 'collections'
                ? 'text-white bg-white/10 border border-white/10'
                : 'text-zinc-400 hover:text-zinc-300'
            }`}
          >
            {t('profile.saved.collections')}
          </button>
        </div>

        {savedTab === 'all' ? (
          <PostGrid
            items={savedPosts}
            emptyMessage={t('profile.saved.save')}
            emptySubtext={t('profile.saved.save_desc')}
            icon={<Bookmark size={32} className="text-white/40" />}
            onLoadMore={() => fetchNextSaved()}
            hasMore={!!hasNextSaved}
            isLoadingMore={isFetchingNextSaved}
          />
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-1">
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
                canManage={isMe}
                onClick={() =>
                  setSelectedCollection({
                    id: collection.id,
                    name: collection.name,
                  })
                }
                onRename={async (id, payload) => {
                  const { collectionsApi } = await import('../services');
                  await collectionsApi.update(id, {
                    name: payload.name,
                    description: payload.description ?? '',
                  });
                  queryClient.invalidateQueries({ queryKey: ['collections'] });
                }}
                onDelete={async (id) => {
                  const { collectionsApi } = await import('../services');
                  await collectionsApi.delete(id);
                  queryClient.invalidateQueries({ queryKey: ['collections'] });
                }}
              />
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-dvh pt-2 md:pt-4 pb-32">
      <SEO
        title={`${profile.data.fullName} (@${profile.data.username})`}
        description={
          profile.data.bio ||
          `See posts and frames from @${profile.data.username} on CircleSfera.`
        }
        ogImage={profile.data.avatar || undefined}
      />
      <div className="max-w-3xl mx-auto px-4 md:px-5">
        {/* Profile Card */}
        <ProfileHeader
          profile={profile}
          isMe={isMe}
          hasActiveStories={!!hasActiveStories}
          isCreatorModeActive={isCreatorModeActive}
          setCreatorMode={setCreatorMode}
          openCreateMenu={openCreateMenu}
          isCreatingChat={isCreatingChat}
          handleMessageClick={handleMessageClick}
          setShowFollowsModal={setShowFollowsModal}
          setShowReportModal={setShowReportModal}
          setShowBlockModal={setShowBlockModal}
          setShowTipModal={setShowTipModal}
          onOpenCloseFriends={
            isMe ? () => setShowCloseFriendsModal(true) : undefined
          }
          onOpenStories={() => {
            if (hasActiveStories && activeStories?.length) {
              openStories(activeStories, 0);
            }
          }}
          showMenu={showMenu}
          setShowMenu={setShowMenu}
        />

        {/* Story Highlights */}
        {((highlights?.data && highlights.data.length > 0) || isMe) && (
          <div className="px-2 md:px-4 mb-6">
            <div className="flex items-center gap-4 overflow-x-auto pb-4 pt-2 px-2 -mx-2 no-scrollbar scroll-smooth">
              {isMe && (
                <HighlightBubble
                  id="new"
                  title={t('profile.highlights.new', 'New')}
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
                users={(followList?.data as ProfileWithUser[]) || []}
                onClose={() => setShowFollowsModal(null)}
              />
            )}
          </Suspense>

          {/* Tabs */}
          <ProfileTabs
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            isMe={isMe}
            canView={!!canView}
          />
        </div>

        {/* Content Area Grid */}
        <div className="px-1 md:px-0">
          {canView ? (
            <>
              {activeTab === 'posts' && (
                <PostGrid
                  items={posts}
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
                  onLoadMore={() => fetchNextPosts()}
                  hasMore={!!hasNextPosts}
                  isLoadingMore={isFetchingNextPosts}
                />
              )}

              {activeTab === 'frames' && (
                <PostGrid
                  items={frames}
                  emptyMessage={t('profile.empty.frames')}
                  emptySubtext={t('profile.empty.frames_desc')}
                  icon={<Clapperboard size={32} className="text-white/40" />}
                  aspectRatio="3/4"
                  variant="frames"
                  onLoadMore={() => fetchNextFrames()}
                  hasMore={!!hasNextFrames}
                  isLoadingMore={isFetchingNextFrames}
                />
              )}

              {activeTab === 'saved' && renderSavedContent()}

              {activeTab === 'tagged' && (
                <PostGrid
                  items={taggedPosts}
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
                  onLoadMore={() => fetchNextTagged()}
                  hasMore={!!hasNextTagged}
                  isLoadingMore={isFetchingNextTagged}
                />
              )}
            </>
          ) : (
            // Private Account View
            <EmptyState
              icon="followers"
              title={t('profile.private.title')}
              message={t('profile.private.subtitle')}
            />
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

        {isMe && (
          <CloseFriendsModal
            isOpen={showCloseFriendsModal}
            onClose={() => setShowCloseFriendsModal(false)}
          />
        )}

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
