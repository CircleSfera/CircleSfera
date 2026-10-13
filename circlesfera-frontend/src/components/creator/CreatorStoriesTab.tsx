import { useQuery } from '@tanstack/react-query';
import { Clock, ImageOff } from 'lucide-react';
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { storiesApi } from '../../services';
import type { CreatorStory } from '../../services/creator.service';
import { creatorApi } from '../../services/creator.service';
import { useAuthStore } from '../../stores/authStore';
import { useStoryStore } from '../../stores/storyStore';
import type { PaginatedResponse, Story } from '../../types';
import { formatDateTime, formatNumber } from '../../utils/format';
import CreatorEmpty from './CreatorEmpty';
import { CreatorBadge, CreatorPager, CreatorRow } from './CreatorPieces';

export default function CreatorStoriesTab() {
  const { t, i18n } = useTranslation();
  const [page, setPage] = useState(1);
  const [now, setNow] = useState(() => Date.now());
  const [openingId, setOpeningId] = useState<string | null>(null);
  const profile = useAuthStore((state) => state.profile);
  const openStories = useStoryStore((state) => state.openStories);
  // A story whose picture is gone shows a mark, not a broken image.
  const [broken, setBroken] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);

  const { data, isLoading } = useQuery<PaginatedResponse<CreatorStory>>({
    queryKey: ['creator', 'stories', page],
    queryFn: () => creatorApi.getStories(page, 12).then((r) => r.data),
  });

  const isExpired = (expiresAt: string) => new Date(expiresAt).getTime() < now;

  // How long a story has left, said the way the reader's language says it.
  const timeLeft = (expiresAt: string) => {
    const minutes = Math.max(
      1,
      Math.round((new Date(expiresAt).getTime() - now) / 60000),
    );
    const relative = new Intl.RelativeTimeFormat(i18n.language, {
      numeric: 'always',
    });
    return minutes < 60
      ? relative.format(minutes, 'minute')
      : relative.format(Math.round(minutes / 60), 'hour');
  };

  const handleOpenStory = async (story: CreatorStory) => {
    if (openingId) return;
    setOpeningId(story.id);
    try {
      // Creator studio always views own stories — archive includes active + expired
      const archive = await storiesApi.getArchive();
      let stories = (archive.data ?? []) as Story[];
      let index = stories.findIndex((s) => s.id === story.id);

      if (index < 0 && profile) {
        stories = [
          {
            id: story.id,
            url: story.url,
            mediaType: story.mediaType,
            expiresAt: story.expiresAt,
            createdAt: story.createdAt,
            profileId: profile.id,
            profile,
          } as Story,
        ];
        index = 0;
      }

      if (index < 0 || stories.length === 0) {
        toast.error(t('creator.stories.open_error'));
        return;
      }

      openStories(stories, index);
    } catch {
      toast.error(t('creator.stories.open_error'));
    } finally {
      setOpeningId(null);
    }
  };

  const stories = data?.data ?? [];
  const count = (key: string, value: number) =>
    t(key, { count: value, formatted: formatNumber(value, i18n.language) });

  return (
    <div className="space-y-4 pb-8">
      {isLoading ? (
        <div className="space-y-2">
          {['s1', 's2', 's3', 's4', 's5', 's6'].map((id) => (
            <div
              key={id}
              className="h-20 md:h-15 rounded-xl bg-white/5 animate-pulse border border-white/5"
            />
          ))}
        </div>
      ) : stories.length === 0 ? (
        <CreatorEmpty
          icon={Clock}
          title={t('creator.stories.empty_title')}
          message={t('creator.stories.empty_desc')}
        />
      ) : (
        <div className="space-y-2">
          {stories.map((story) => {
            const expired = isExpired(story.expiresAt);
            const published = formatDateTime(story.createdAt, i18n.language);
            return (
              <CreatorRow
                key={story.id}
                media={
                  broken.has(story.id) ? (
                    <ImageOff size={20} aria-hidden />
                  ) : story.mediaType === 'video' ? (
                    <video
                      src={story.url}
                      className="w-full h-full object-cover"
                      muted
                      preload="metadata"
                      onError={() =>
                        setBroken((gone) => new Set(gone).add(story.id))
                      }
                    />
                  ) : (
                    <img
                      src={story.url}
                      alt=""
                      className="w-full h-full object-cover"
                      onError={() =>
                        setBroken((gone) => new Set(gone).add(story.id))
                      }
                    />
                  )
                }
                title={t('creator.stories.published', { date: published })}
                facts={[
                  [
                    count('creator.stories.views', story._count.views),
                    count('creator.stories.reactions', story._count.reactions),
                  ].join(' · '),
                  expired
                    ? t('creator.stories.expired_on', {
                        date: formatDateTime(story.expiresAt, i18n.language),
                      })
                    : t('creator.stories.expires', {
                        when: timeLeft(story.expiresAt),
                      }),
                ]}
                badge={
                  <CreatorBadge on={!expired}>
                    {expired
                      ? t('creator.stories.expired')
                      : t('creator.stories.active')}
                  </CreatorBadge>
                }
                onOpen={() => void handleOpenStory(story)}
                openLabel={t('creator.stories.open_this', { date: published })}
              />
            );
          })}
        </div>
      )}

      <CreatorPager
        page={page}
        totalPages={data?.meta?.totalPages ?? 1}
        onChange={setPage}
      />
    </div>
  );
}
