import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { liveApi, storiesApi } from '../services';
import { useAuthStore } from '../stores/authStore';
import { useStoryStore } from '../stores/storyStore';
import type { Story } from '../types';
import UserAvatar from './UserAvatar';
import type { VerificationLevel } from './VerificationBadge';

interface GroupedStories {
  user: Story['user'];
  stories: Story[];
}

/**
 * StoryList — Layout Guidelines §20 & Design System §9.5
 * Story avatars: md (40px) inside a ring, total visual ~52px
 * Container: compact horizontal scroll strip
 * Spacing: gap-3 (12px) between items
 * Label: 11px (--text-badge)
 */
export default function StoryList() {
  const profile = useAuthStore((state) => state.profile);
  const openStories = useStoryStore((state) => state.openStories);

  const { data: storiesResponse } = useQuery({
    queryKey: ['stories'],
    queryFn: () => storiesApi.getAll(),
  });

  const { data: liveStreamsResponse } = useQuery({
    queryKey: ['live-streams'],
    queryFn: () => liveApi.getActiveStreams(),
  });

  const groupedStories = useMemo(() => {
    if (!storiesResponse?.data) return [];
    const groups: Map<string, GroupedStories> = new Map();
    (storiesResponse.data as Story[]).forEach((story: Story) => {
      const userId = story.user.id;
      if (groups.has(userId)) {
        groups.get(userId)!.stories.push(story);
      } else {
        groups.set(userId, { user: story.user, stories: [story] });
      }
    });
    const result = Array.from(groups.values());
    result.forEach((group) => {
      group.stories.reverse();
    });
    return result;
  }, [storiesResponse]);

  const allStories = useMemo(
    () => groupedStories.flatMap((group) => group.stories),
    [groupedStories],
  );

  const handleStoryClick = (userIndex: number) => {
    let storyIndex = 0;
    for (let i = 0; i < userIndex; i++) {
      storyIndex += groupedStories[i].stories.length;
    }
    openStories(allStories, storyIndex);
  };

  return (
    <div className="my-1.5 md:my-3 rounded-xl md:rounded-2xl p-2 md:p-3.5 border border-white/10 bg-white/3 backdrop-blur-xl overflow-hidden">
      <div className="flex items-center gap-2.5 md:gap-3 overflow-x-auto no-scrollbar">
        {/* Active Live Streams */}
        {liveStreamsResponse?.map((stream: any) => (
          <Link
            key={stream.id}
            to={`/live/${stream.id}`}
            className="flex flex-col items-center gap-1 shrink-0 group focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60 rounded-lg"
            style={{ width: 52 }}
          >
            {/* Ring 52px total, avatar 40px (md) inside */}
            <div
              className="w-13 h-13 p-[2.5px] rounded-full flex items-center justify-center animate-pulse"
              style={{ background: '#dc2626', width: 52, height: 52 }}
            >
              <div className="w-full h-full bg-black rounded-full p-0.5 flex items-center justify-center">
                <UserAvatar
                  src={stream.host.profile?.avatar}
                  alt={stream.host.profile?.username}
                  size="md"
                  hasStory={false}
                />
              </div>
            </div>
            <div className="text-center w-full">
              <span
                className="truncate block w-full text-gray-300 font-medium"
                style={{ fontSize: 'var(--text-badge, 11px)' }}
              >
                {stream.host.profile?.username}
              </span>
              <span
                className="uppercase font-bold text-red-500 block truncate w-full"
                style={{ fontSize: '9px', letterSpacing: '0.04em' }}
              >
                En vivo
              </span>
            </div>
          </Link>
        ))}

        {/* Your Story / Add Story */}
        {(() => {
          const myStoriesIndex = groupedStories.findIndex(
            (g) => g.user.id === profile?.id,
          );
          const hasStory = myStoriesIndex !== -1;

          const ringStyle = (
            viewed: boolean,
            closeFriend?: boolean,
          ): React.CSSProperties => ({
            width: 52,
            height: 52,
            padding: '2.5px',
            borderRadius: '9999px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: viewed
              ? 'rgba(60,60,70,1)'
              : closeFriend
                ? '#22c55e'
                : 'linear-gradient(135deg, #ff5757, #8c52ff)',
            border: viewed ? '1px solid rgba(255,255,255,0.12)' : 'none',
          });

          if (hasStory) {
            const myGroup = groupedStories[myStoriesIndex];
            const allViewed = myGroup.stories.every((s) => s.isViewed);
            return (
              <button
                type="button"
                onClick={() => handleStoryClick(myStoriesIndex)}
                className="flex flex-col items-center gap-1 shrink-0 group focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60 rounded-lg"
                style={{ width: 52 }}
              >
                <div
                  style={ringStyle(allViewed)}
                  className="transition-transform duration-200 group-hover:scale-105"
                >
                  <div className="w-full h-full bg-black rounded-full p-0.5 flex items-center justify-center">
                    <UserAvatar
                      src={profile?.avatar}
                      thumbnailUrl={profile?.thumbnailUrl}
                      standardUrl={profile?.standardUrl}
                      alt="Tu story"
                      size="md"
                      hasStory={false}
                      verificationLevel={
                        profile?.verificationLevel as VerificationLevel
                      }
                    />
                  </div>
                </div>
                <span
                  className={`truncate w-full text-center ${allViewed ? 'text-gray-500' : 'text-gray-300'}`}
                  style={{ fontSize: 'var(--text-badge, 11px)' }}
                >
                  Tú
                </span>
              </button>
            );
          }

          return (
            <Link
              to="/create?mode=story"
              className="flex flex-col items-center gap-1 shrink-0 group focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60 rounded-lg"
              style={{ width: 52 }}
            >
              <div
                className="relative transition-transform duration-200 group-hover:scale-105"
                style={{ width: 52, height: 52 }}
              >
                {profile?.avatar ? (
                  <>
                    <div className="w-full h-full rounded-full overflow-hidden">
                      <UserAvatar
                        src={profile.avatar}
                        thumbnailUrl={profile.thumbnailUrl}
                        standardUrl={profile.standardUrl}
                        alt="Tu story"
                        size="full"
                        hasStory={false}
                      />
                    </div>
                    <div
                      className="absolute bottom-0 right-0 w-4.5 h-4.5 rounded-full flex items-center justify-center z-10"
                      style={{
                        background: '#0095f6', // Instagram blue
                        border: '2px solid #000000', // Cutout effect
                      }}
                    >
                      <Plus
                        size={12}
                        className="text-white"
                        strokeWidth={3.5}
                      />
                    </div>
                  </>
                ) : (
                  <div
                    className="w-full h-full rounded-full flex items-center justify-center group-hover:border-brand-primary transition-colors"
                    style={{
                      border: '1.5px dashed rgba(100,100,120,0.6)',
                      background: 'rgba(30,30,40,0.6)',
                    }}
                  >
                    <Plus
                      size={20}
                      className="text-gray-500 group-hover:text-brand-primary transition-colors"
                    />
                  </div>
                )}
              </div>
              <span
                className="text-gray-400 group-hover:text-white transition-colors text-center w-full truncate"
                style={{ fontSize: 'var(--text-badge, 11px)' }}
              >
                Tu story
              </span>
            </Link>
          );
        })()}

        {/* Vertical Divider */}
        <div className="h-8 w-px mx-1 shrink-0 bg-white/10" />

        {/* Other users' stories */}
        {groupedStories
          .map((group, index) => ({ ...group, originalIndex: index }))
          .filter((group) => group.user.id !== profile?.id)
          .map((group) => {
            const allViewed = group.stories.every((s) => s.isViewed);
            const hasCloseFriendStory = group.stories.some(
              (s) => s.isCloseFriendsOnly,
            );

            return (
              <button
                type="button"
                key={group.user.id}
                onClick={() => handleStoryClick(group.originalIndex)}
                aria-label={`Ver historias de ${group.user.profile?.username || ''}`}
                className="flex flex-col items-center gap-1 shrink-0 group focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60 rounded-lg"
                style={{ width: 52 }}
              >
                <div
                  style={{
                    width: 52,
                    height: 52,
                    padding: '2.5px',
                    borderRadius: '9999px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: allViewed
                      ? 'rgba(60,60,70,1)'
                      : hasCloseFriendStory
                        ? '#22c55e'
                        : 'linear-gradient(135deg, #ff5757, #8c52ff)',
                    border: allViewed
                      ? '1px solid rgba(255,255,255,0.1)'
                      : 'none',
                    transition: 'transform 0.2s',
                  }}
                  className="group-hover:scale-105"
                >
                  <div className="w-full h-full bg-black rounded-full p-0.5 flex items-center justify-center">
                    <UserAvatar
                      src={group.user.profile?.avatar}
                      thumbnailUrl={group.user.profile?.thumbnailUrl}
                      standardUrl={group.user.profile?.standardUrl}
                      alt={group.user.profile?.username || ''}
                      size="md"
                      hasStory={false}
                      verificationLevel={
                        group.user.verificationLevel as VerificationLevel
                      }
                    />
                  </div>
                </div>
                <span
                  className={`truncate w-full text-center ${allViewed ? 'text-gray-600' : 'text-gray-300'}`}
                  style={{ fontSize: 'var(--text-badge, 11px)' }}
                >
                  {group.user.profile?.username}
                </span>
              </button>
            );
          })}

        {/* Dim placeholders if no extra stories */}
        {groupedStories.filter((g) => g.user.id !== profile?.id).length ===
          0 && (
          <div className="flex gap-3 items-center select-none">
            {[
              { id: 'sk-story-1', opacity: 0.22, width: 28 },
              { id: 'sk-story-2', opacity: 0.12, width: 34 },
              { id: 'sk-story-3', opacity: 0.06, width: 40 },
            ].map((item) => (
              <div
                key={item.id}
                className="flex flex-col items-center gap-1 shrink-0"
                style={{ opacity: item.opacity, width: 52 }}
              >
                <div
                  className="rounded-full flex items-center justify-center p-0.5"
                  style={{
                    width: 52,
                    height: 52,
                    border: '1px dashed rgba(255,255,255,0.3)',
                    background: 'rgba(30,30,40,0.4)',
                  }}
                >
                  <div className="w-full h-full rounded-full flex items-center justify-center bg-zinc-900/50">
                    <div className="w-3 h-3 rounded-full bg-white/20" />
                  </div>
                </div>
                <div
                  className="h-2 rounded-full bg-white/20"
                  style={{ width: item.width }}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
