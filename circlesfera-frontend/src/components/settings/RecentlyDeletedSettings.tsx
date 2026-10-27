import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Clapperboard, Clock, Layers } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import {
  type RecentlyDeletedItem,
  recentlyDeletedApi,
} from '../../services/recentlyDeleted.service';
import { useAuthStore } from '../../stores/authStore';
import { EmptyState, ErrorState } from '../ErrorEmptyStates';
import { LoadingSpinner } from '../LoadingStates';
import ConfirmModal from '../modals/ConfirmModal';
import { Button } from '../ui';
import { BUTTON_STACK } from '../ui/buttonWidth';
import { Dialog } from '../ui/Dialog';

// Each Profile has its own list: another account signing in on this device
// never sees the previous one's, even for the moment a refetch takes.
const LIST_KEY = ['recentlyDeleted'];

// What shows the content again once it is restored or gone for good: the
// author's grids, the feeds, the story tray and the story archive.
const CONTENT_KEYS = [
  ['feed'],
  ['posts'],
  ['userPosts'],
  ['frames'],
  ['userFrames'],
  ['profile'],
  ['stories'],
  ['my-stories'],
  ['my-archive'],
];

// A video shows nothing on phones until it plays: its thumbnail is the
// poster, and with none the time fragment paints the first frame.
function videoPreviewSrc(item: RecentlyDeletedItem): string {
  if (item.thumbnailUrl || item.url.includes('#')) return item.url;
  return `${item.url}#t=0.001`;
}

function useDaysLeft() {
  const { t } = useTranslation();
  return (daysLeft: number) =>
    daysLeft < 1
      ? t('settings.recently_deleted.days_left_none')
      : t('settings.recently_deleted.days_left', { count: daysLeft });
}

function Tile({
  item,
  onOpen,
}: {
  item: RecentlyDeletedItem;
  onOpen: () => void;
}) {
  const { t } = useTranslation();
  const daysLeft = useDaysLeft();
  const kind = t(`settings.recently_deleted.kind.${item.kind}`);
  const days = daysLeft(item.daysLeft);
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        aria-label={t('settings.recently_deleted.open', { kind, days })}
        className="relative block w-full aspect-3/4 overflow-hidden rounded-lg bg-white/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60"
      >
        {!item.url ? (
          <span className="flex h-full w-full items-center justify-center p-2 text-center text-xs text-white/70 line-clamp-4">
            {item.caption || kind}
          </span>
        ) : item.mediaType === 'video' ? (
          <video
            src={videoPreviewSrc(item)}
            poster={item.thumbnailUrl || undefined}
            className="w-full h-full object-cover"
            muted
            playsInline
            preload={item.thumbnailUrl ? 'none' : 'metadata'}
          >
            <track kind="captions" />
          </video>
        ) : (
          <img
            src={item.thumbnailUrl || item.standardUrl || item.url}
            alt=""
            className="w-full h-full object-cover"
            loading="lazy"
          />
        )}
        {item.kind !== 'POST' ? (
          <span className="absolute top-1.5 left-1.5 inline-flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-xs font-semibold text-white">
            {item.kind === 'FRAME' ? (
              <Clapperboard size={12} aria-hidden />
            ) : null}
            {kind}
          </span>
        ) : null}
        {item.mediaCount > 1 ? (
          <Layers
            size={14}
            className="absolute top-2 right-2 text-white drop-shadow-md"
            aria-hidden
          />
        ) : null}
        <span className="absolute inset-x-0 bottom-0 flex items-center gap-1 bg-linear-to-t from-black/80 to-transparent px-2 pt-6 pb-1.5 text-xs font-semibold text-white">
          <Clock size={12} aria-hidden className="shrink-0" />
          {/* The whole sentence is the button's name; a tile is too narrow. */}
          <span className="truncate" aria-hidden>
            {item.daysLeft < 1
              ? t('settings.recently_deleted.days_short_none')
              : t('settings.recently_deleted.days_short', {
                  count: item.daysLeft,
                })}
          </span>
        </span>
      </button>
    </li>
  );
}

export default function RecentlyDeletedSettings() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const daysLeft = useDaysLeft();
  const [selected, setSelected] = useState<RecentlyDeletedItem | null>(null);
  const [confirming, setConfirming] = useState(false);

  const profileId = useAuthStore((state) => state.profile?.id);
  const listKey = [...LIST_KEY, profileId];
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: listKey,
    enabled: Boolean(profileId),
    queryFn: () => recentlyDeletedApi.list(),
  });
  const items = data?.data?.items ?? [];

  // Takes the item off the list at once and refreshes what shows content.
  const settle = (id: string) => {
    queryClient.setQueryData<typeof data>(listKey, (old) =>
      old?.data
        ? {
            ...old,
            data: { items: old.data.items.filter((item) => item.id !== id) },
          }
        : old,
    );
    for (const queryKey of CONTENT_KEYS) {
      void queryClient.invalidateQueries({ queryKey });
    }
    setSelected(null);
    setConfirming(false);
  };

  const restoreMutation = useMutation({
    mutationFn: async (item: RecentlyDeletedItem) => {
      if (item.kind === 'STORY') {
        const res = await recentlyDeletedApi.restoreStory(item.id);
        return { archived: !!res.data?.archived };
      }
      await recentlyDeletedApi.restorePost(item.id);
      return { archived: false };
    },
    onSuccess: ({ archived }, item) => {
      settle(item.id);
      toast.success(
        archived
          ? t('settings.recently_deleted.restored_archive')
          : t('settings.recently_deleted.restored'),
      );
    },
    onError: () => {
      toast.error(t('settings.recently_deleted.restore_error'));
      void queryClient.invalidateQueries({ queryKey: LIST_KEY });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (item: RecentlyDeletedItem) =>
      item.kind === 'STORY'
        ? recentlyDeletedApi.deleteStoryForGood(item.id)
        : recentlyDeletedApi.deletePostForGood(item.id),
    onSuccess: (_res, item) => {
      settle(item.id);
      toast.success(t('settings.recently_deleted.deleted'));
    },
    onError: () => {
      setConfirming(false);
      toast.error(t('settings.recently_deleted.delete_error'));
      void queryClient.invalidateQueries({ queryKey: LIST_KEY });
    },
  });

  const busy = restoreMutation.isPending || deleteMutation.isPending;

  return (
    <div className="max-w-xl space-y-4">
      <p className="text-sm text-white/60 leading-relaxed">
        {t('settings.recently_deleted.intro')}
      </p>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <LoadingSpinner />
        </div>
      ) : isError ? (
        <ErrorState
          title={t('settings.recently_deleted.error_title')}
          message={t('settings.recently_deleted.error_message')}
          onRetry={() => void refetch()}
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon="posts"
          title={t('settings.recently_deleted.empty_title')}
          message={t('settings.recently_deleted.empty_message')}
        />
      ) : (
        <ul className="grid grid-cols-3 sm:grid-cols-4 gap-1">
          {items.map((item) => (
            <Tile
              key={`${item.kind}-${item.id}`}
              item={item}
              onOpen={() => setSelected(item)}
            />
          ))}
        </ul>
      )}

      <Dialog
        isOpen={!!selected && !confirming}
        onClose={() => !busy && setSelected(null)}
        ariaLabel={
          selected
            ? t(`settings.recently_deleted.kind.${selected.kind}`)
            : undefined
        }
        maxWidth="sm"
      >
        {selected ? (
          <div className="flex flex-col items-center gap-4 pt-12">
            {!selected.url ? null : selected.mediaType === 'video' ? (
              <video
                src={selected.url}
                poster={selected.thumbnailUrl || undefined}
                className="w-full max-h-[55vh] rounded-xl bg-black object-contain"
                controls
                playsInline
              >
                <track kind="captions" />
              </video>
            ) : (
              <img
                src={selected.standardUrl || selected.url}
                alt={selected.caption || ''}
                className="w-full max-h-[55vh] rounded-xl bg-black object-contain"
              />
            )}
            <div className="w-full space-y-1 text-center">
              <p className="text-xs font-semibold text-white/60">
                {t(`settings.recently_deleted.kind.${selected.kind}`)} ·{' '}
                {daysLeft(selected.daysLeft)}
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
                isLoading={restoreMutation.isPending}
                disabled={busy}
                onClick={() => restoreMutation.mutate(selected)}
              >
                {restoreMutation.isPending
                  ? t('settings.recently_deleted.restoring')
                  : t('settings.recently_deleted.restore')}
              </Button>
              <Button
                size="lg"
                variant="danger"
                className="w-full"
                disabled={busy}
                onClick={() => setConfirming(true)}
              >
                {t('settings.recently_deleted.delete')}
              </Button>
            </div>
          </div>
        ) : null}
      </Dialog>

      <ConfirmModal
        isOpen={!!selected && confirming}
        onClose={() => !deleteMutation.isPending && setConfirming(false)}
        onConfirm={() => selected && deleteMutation.mutate(selected)}
        title={t('settings.recently_deleted.confirm_title')}
        message={t('settings.recently_deleted.confirm_message')}
        confirmText={t('settings.recently_deleted.confirm_delete')}
        cancelText={t('settings.recently_deleted.cancel')}
        isDestructive
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
}
