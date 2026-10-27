import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { Heart, Layers, MessageCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useInfiniteScroll } from '../../hooks/useInfiniteScroll';
import {
  type ArchivedPost,
  archiveApi,
  postsApi,
  storiesApi,
  usersApi,
} from '../../services';
import { useAuthStore } from '../../stores/authStore';
import type { Story } from '../../types';
import { EmptyState, ErrorState } from '../ErrorEmptyStates';
import { LoadingSpinner } from '../LoadingStates';
import ConfirmModal from '../modals/ConfirmModal';
import CreateHighlightModal from '../modals/CreateHighlightModal';
import { Button, Switch } from '../ui';
import { BUTTON_STACK } from '../ui/buttonWidth';
import { Dialog } from '../ui/Dialog';
import SettingsRow from './SettingsRow';

type Tab = 'STORY' | 'POST' | 'FRAME';

// What shows a post again once it is back on the profile or deleted: the
// author's grids, the feeds and Recently deleted.
const CONTENT_KEYS = [
  ['feed'],
  ['posts'],
  ['userPosts'],
  ['frames'],
  ['userFrames'],
  ['profile'],
  ['recentlyDeleted'],
];

// The one picture of an item, or its caption on a plain tile when it has
// none. A video shows its thumbnail, or its first frame.
interface Shown {
  url: string;
  standardUrl?: string | null;
  thumbnailUrl?: string | null;
  mediaType: string;
  caption?: string | null;
}

function Preview({ item, large }: { item: Shown; large?: boolean }) {
  const box = large
    ? 'w-full max-h-[55vh] rounded-xl bg-black object-contain'
    : 'w-full h-full object-cover';
  if (!item.url) {
    return large ? null : (
      <span className="flex h-full w-full items-center justify-center p-2 text-center text-xs text-white/70 line-clamp-4">
        {item.caption}
      </span>
    );
  }
  if (item.mediaType === 'video') {
    const src =
      large || item.thumbnailUrl || item.url.includes('#')
        ? item.url
        : `${item.url}#t=0.001`;
    return (
      <video
        src={src}
        poster={item.thumbnailUrl || undefined}
        className={box}
        muted={!large}
        controls={large}
        playsInline
        preload={large ? 'metadata' : item.thumbnailUrl ? 'none' : 'metadata'}
      >
        <track kind="captions" />
      </video>
    );
  }
  return (
    <img
      src={
        large
          ? item.standardUrl || item.url
          : item.thumbnailUrl || item.standardUrl || item.url
      }
      alt={large ? item.caption || '' : ''}
      className={box}
      loading="lazy"
    />
  );
}

function Tile({
  item,
  label,
  onOpen,
  children,
}: {
  item: Shown;
  label: string;
  onOpen: () => void;
  children?: React.ReactNode;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        aria-label={label}
        className="relative block w-full aspect-3/4 overflow-hidden rounded-lg bg-white/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60"
      >
        <Preview item={item} />
        {children}
      </button>
    </li>
  );
}

function SaveStoriesRow() {
  const { t } = useTranslation();
  const [saved, setSaved] = useState<boolean | null>(null);

  useEffect(() => {
    let live = true;
    usersApi
      .getSettings()
      .then((res) => {
        if (live) setSaved(res.data?.saveStoriesToArchive !== false);
      })
      .catch(() => {
        if (live) setSaved(true);
      });
    return () => {
      live = false;
    };
  }, []);

  const change = (next: boolean) => {
    setSaved(next);
    usersApi
      .updateSettings({ saveStoriesToArchive: next })
      .then(() => toast.success(t('settings.archive.saved')))
      .catch(() => {
        setSaved(!next);
        toast.error(t('settings.archive.save_error'));
      });
  };

  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.02]">
      <SettingsRow
        label={t('settings.archive.save_stories')}
        description={t('settings.archive.save_stories_desc')}
        control={
          <Switch
            checked={saved ?? true}
            disabled={saved === null}
            onChange={(e) => change(e.target.checked)}
            aria-label={t('settings.archive.save_stories')}
          />
        }
      />
    </div>
  );
}

function StoriesTab() {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const profileId = useAuthStore((state) => state.profile?.id);
  const [selected, setSelected] = useState<Story | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [highlighting, setHighlighting] = useState<Story | null>(null);

  // The same list the highlight picker reads.
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['my-archive'],
    enabled: Boolean(profileId),
    queryFn: () => storiesApi.getArchive().then((res) => res.data),
  });
  const stories = data ?? [];

  const deleteMutation = useMutation({
    mutationFn: (story: Story) => storiesApi.delete(story.id),
    onSuccess: () => {
      for (const queryKey of [
        ['my-archive'],
        ['stories'],
        ['my-stories'],
        ['recentlyDeleted'],
      ]) {
        void queryClient.invalidateQueries({ queryKey });
      }
      setSelected(null);
      setConfirming(false);
      toast.success(t('settings.archive.deleted'));
    },
    onError: () => {
      setConfirming(false);
      toast.error(t('settings.archive.delete_error'));
    },
  });

  return (
    <div className="space-y-4">
      <SaveStoriesRow />
      {isLoading ? (
        <div className="flex justify-center py-12">
          <LoadingSpinner />
        </div>
      ) : isError ? (
        <ErrorState
          title={t('settings.archive.error_title')}
          message={t('settings.archive.error_message')}
          onRetry={() => void refetch()}
        />
      ) : stories.length === 0 ? (
        <EmptyState
          icon="stories"
          title={t('settings.archive.empty.STORY.title')}
          message={t('settings.archive.empty.STORY.message')}
        />
      ) : (
        <ul className="grid grid-cols-3 sm:grid-cols-4 gap-1">
          {stories.map((story) => (
            <Tile
              key={story.id}
              item={story}
              label={t('settings.archive.open', {
                kind: t('settings.archive.kind.STORY'),
              })}
              onOpen={() => setSelected(story)}
            >
              <span className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/80 to-transparent px-2 pt-6 pb-1.5 text-left text-xs font-semibold text-white">
                {new Date(story.createdAt).toLocaleDateString(i18n.language)}
              </span>
            </Tile>
          ))}
        </ul>
      )}

      <Dialog
        isOpen={!!selected && !confirming}
        onClose={() => !deleteMutation.isPending && setSelected(null)}
        ariaLabel={t('settings.archive.kind.STORY')}
        maxWidth="sm"
      >
        {selected ? (
          <div className="flex flex-col items-center gap-4 pt-12">
            <Preview item={selected} large />
            <div className={`mx-auto ${BUTTON_STACK}`}>
              <Button
                size="lg"
                className="w-full"
                onClick={() => {
                  setHighlighting(selected);
                  setSelected(null);
                }}
              >
                {t('settings.archive.add_to_highlight')}
              </Button>
              <Button
                size="lg"
                variant="danger"
                className="w-full"
                onClick={() => setConfirming(true)}
              >
                {t('settings.archive.delete')}
              </Button>
            </div>
          </div>
        ) : null}
      </Dialog>

      <ConfirmModal
        isOpen={!!selected && confirming}
        onClose={() => !deleteMutation.isPending && setConfirming(false)}
        onConfirm={() => selected && deleteMutation.mutate(selected)}
        title={t('settings.archive.confirm_title')}
        message={t('settings.archive.confirm_message')}
        confirmText={t('settings.archive.confirm_delete')}
        cancelText={t('settings.archive.cancel')}
        isDestructive
        isLoading={deleteMutation.isPending}
      />

      {highlighting ? (
        <CreateHighlightModal
          isOpen
          onClose={() => setHighlighting(null)}
          initialStoryIds={[highlighting.id]}
        />
      ) : null}
    </div>
  );
}

function PostsTab({ kind }: { kind: 'POST' | 'FRAME' }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const profileId = useAuthStore((state) => state.profile?.id);
  const [selected, setSelected] = useState<ArchivedPost | null>(null);
  const [confirming, setConfirming] = useState(false);

  // Each Profile has its own archive: another account signing in on this
  // device never sees the previous one's.
  const listKey = ['archive', kind, profileId];
  const query = useInfiniteQuery({
    queryKey: listKey,
    enabled: Boolean(profileId),
    queryFn: ({ pageParam }) =>
      archiveApi
        .listPosts(kind, pageParam || undefined)
        .then((res) => res.data),
    initialPageParam: '',
    getNextPageParam: (last) => last.nextCursor || undefined,
  });
  const loadMoreRef = useInfiniteScroll(
    query.fetchNextPage,
    query.hasNextPage,
    query.isFetchingNextPage,
  );
  const items = query.data?.pages.flatMap((page) => page.items ?? []) ?? [];

  // Takes the item off the list at once and refreshes what shows content.
  const settle = (id: string) => {
    queryClient.setQueryData<typeof query.data>(listKey, (old) =>
      old
        ? {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              items: page.items.filter((item) => item.id !== id),
            })),
          }
        : old,
    );
    for (const queryKey of CONTENT_KEYS) {
      void queryClient.invalidateQueries({ queryKey });
    }
    setSelected(null);
    setConfirming(false);
  };

  const showMutation = useMutation({
    mutationFn: (item: ArchivedPost) => archiveApi.unarchive(item.id),
    onSuccess: (_res, item) => {
      settle(item.id);
      toast.success(t('settings.archive.shown'));
    },
    onError: () => toast.error(t('settings.archive.show_error')),
  });

  const deleteMutation = useMutation({
    mutationFn: (item: ArchivedPost) => postsApi.delete(item.id),
    onSuccess: (_res, item) => {
      settle(item.id);
      toast.success(t('settings.archive.deleted'));
    },
    onError: () => {
      setConfirming(false);
      toast.error(t('settings.archive.delete_error'));
    },
  });

  const busy = showMutation.isPending || deleteMutation.isPending;
  const kindLabel = t(`settings.archive.kind.${kind}`);

  if (query.isLoading) {
    return (
      <div className="flex justify-center py-12">
        <LoadingSpinner />
      </div>
    );
  }
  if (query.isError && !query.data) {
    return (
      <ErrorState
        title={t('settings.archive.error_title')}
        message={t('settings.archive.error_message')}
        onRetry={() => void query.refetch()}
      />
    );
  }

  return (
    <div className="space-y-4">
      {items.length === 0 ? (
        <EmptyState
          icon="posts"
          title={t(`settings.archive.empty.${kind}.title`)}
          message={t(`settings.archive.empty.${kind}.message`)}
        />
      ) : (
        <ul className="grid grid-cols-3 sm:grid-cols-4 gap-1">
          {items.map((item) => (
            <Tile
              key={item.id}
              item={item}
              label={t('settings.archive.open', { kind: kindLabel })}
              onOpen={() => setSelected(item)}
            >
              {item.mediaCount > 1 ? (
                <Layers
                  size={14}
                  className="absolute top-2 right-2 text-white drop-shadow-md"
                  aria-hidden
                />
              ) : null}
              <span
                aria-hidden
                className="absolute inset-x-0 bottom-0 flex items-center gap-2 bg-linear-to-t from-black/80 to-transparent px-2 pt-6 pb-1.5 text-xs font-semibold text-white"
              >
                <span className="inline-flex items-center gap-1">
                  <Heart size={12} />
                  {item.likesCount}
                </span>
                <span className="inline-flex items-center gap-1">
                  <MessageCircle size={12} />
                  {item.commentsCount}
                </span>
              </span>
            </Tile>
          ))}
        </ul>
      )}
      {query.hasNextPage ? (
        <div ref={loadMoreRef} aria-hidden className="h-1" />
      ) : null}

      <Dialog
        isOpen={!!selected && !confirming}
        onClose={() => !busy && setSelected(null)}
        ariaLabel={kindLabel}
        maxWidth="sm"
      >
        {selected ? (
          <div className="flex flex-col items-center gap-4 pt-12">
            <Preview item={selected} large />
            <div className="w-full space-y-1 text-center">
              <p className="text-xs font-semibold text-white/60">
                {t('settings.archive.likes', { count: selected.likesCount })}
                {' · '}
                {t('settings.archive.comments', {
                  count: selected.commentsCount,
                })}
              </p>
              {selected.caption ? (
                <p className="text-sm text-white line-clamp-3 break-words">
                  {selected.caption}
                </p>
              ) : null}
            </div>
            <div className={`mx-auto ${BUTTON_STACK}`}>
              <Button
                size="lg"
                className="w-full"
                isLoading={showMutation.isPending}
                disabled={busy}
                onClick={() => showMutation.mutate(selected)}
              >
                {showMutation.isPending
                  ? t('settings.archive.showing')
                  : t('settings.archive.show_on_profile')}
              </Button>
              <Link
                to={`/p/${selected.id}`}
                className="inline-flex min-h-12 w-full items-center justify-center rounded-xl border border-white/15 px-4 text-sm font-semibold text-white hover:bg-white/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60"
              >
                {t('settings.archive.open_post')}
              </Link>
              <Button
                size="lg"
                variant="danger"
                className="w-full"
                disabled={busy}
                onClick={() => setConfirming(true)}
              >
                {t('settings.archive.delete')}
              </Button>
            </div>
          </div>
        ) : null}
      </Dialog>

      <ConfirmModal
        isOpen={!!selected && confirming}
        onClose={() => !deleteMutation.isPending && setConfirming(false)}
        onConfirm={() => selected && deleteMutation.mutate(selected)}
        title={t('settings.archive.confirm_title')}
        message={t('settings.archive.confirm_message')}
        confirmText={t('settings.archive.confirm_delete')}
        cancelText={t('settings.archive.cancel')}
        isDestructive
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
}

// The person's archive, shown to them only: their stories once their 24
// hours end, and the posts and frames they archived.
export default function ArchiveSettings() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('STORY');
  const tabs = [
    { value: 'STORY' as const, label: t('settings.archive.tabs.STORY') },
    { value: 'POST' as const, label: t('settings.archive.tabs.POST') },
    { value: 'FRAME' as const, label: t('settings.archive.tabs.FRAME') },
  ];

  return (
    <div className="max-w-xl space-y-4">
      <p className="text-sm text-white/60 leading-relaxed">
        {t('settings.archive.intro')}
      </p>
      {/* Each tab as wide as its word asks, the rest shared: the longest
          word fits at 390 px in both languages. */}
      <div
        role="tablist"
        aria-label={t('settings.archive.tabs_label')}
        className="flex gap-1 rounded-full border border-white/10 bg-white/[0.03] p-1"
      >
        {tabs.map((item) => {
          const active = item.value === tab;
          return (
            <button
              key={item.value}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(item.value)}
              className={`min-h-11 grow basis-auto whitespace-nowrap rounded-full px-3 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/50 ${
                active
                  ? 'bg-white/15 text-white'
                  : 'text-white/60 hover:text-white'
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </div>
      {tab === 'STORY' ? <StoriesTab /> : <PostsTab key={tab} kind={tab} />}
    </div>
  );
}
