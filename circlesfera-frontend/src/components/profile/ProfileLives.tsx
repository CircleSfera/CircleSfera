import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { Play, Radio } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import {
  type LiveRecording,
  liveRecordingsApi,
  recordingLength,
} from '../../services/liveRecordings';
import { CREATE_PRIMARY, CREATE_SECONDARY } from '../create-post/createStyles';
import { ErrorState } from '../ErrorEmptyStates';
import { LoadingSpinner } from '../LoadingStates';
import LiveReplayPlayer from '../live/LiveReplayPlayer';
import ConfirmModal from '../modals/ConfirmModal';

interface ProfileLivesProps {
  profileId: string;
  isMe: boolean;
}

/** One recording: its picture, upright, with its length over it. */
function RecordingTile({
  recording,
  onPlay,
}: {
  recording: LiveRecording;
  onPlay: (recording: LiveRecording) => void;
}) {
  const { t } = useTranslation();
  const ready = recording.recordingStatus === 'READY';
  return (
    <button
      type="button"
      onClick={() => onPlay(recording)}
      disabled={!ready}
      aria-label={t('live.recording.play', {
        title: recording.title || t('live.recording.untitled'),
      })}
      className="relative block aspect-9/16 w-full overflow-hidden rounded-2xl bg-surface-elevated outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/50 disabled:cursor-default"
    >
      {recording.thumbnailUrl ? (
        <img
          src={recording.thumbnailUrl}
          alt=""
          loading="lazy"
          className="h-full w-full object-cover"
        />
      ) : (
        <span className="flex h-full w-full items-center justify-center text-white/40">
          <Radio size={28} aria-hidden="true" />
        </span>
      )}
      <span className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-linear-to-t from-black/80 to-transparent px-3 pt-8 pb-2 text-xs font-semibold text-white">
        <span className="truncate">
          {recording.title || t('live.recording.untitled')}
        </span>
        {ready ? (
          <span className="inline-flex shrink-0 items-center gap-1 tabular-nums">
            <Play size={12} aria-hidden="true" />
            {recordingLength(recording.recordingDurationMs)}
          </span>
        ) : (
          <span className="shrink-0">
            {t('live.recording.preparing_short')}
          </span>
        )}
      </span>
    </button>
  );
}

/**
 * The "Lives" tab of a Profile: its published recordings. On one's own
 * Profile, first the archive of those not published, only for its owner,
 * each with the days left and the two choices.
 */
export default function ProfileLives({ profileId, isMe }: ProfileLivesProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [playing, setPlaying] = useState<LiveRecording | null>(null);
  const [toDelete, setToDelete] = useState<LiveRecording | null>(null);

  const archive = useQuery({
    queryKey: ['liveRecordings', 'mine'],
    queryFn: () => liveRecordingsApi.listMine(),
    enabled: isMe,
  });
  const published = useInfiniteQuery({
    queryKey: ['liveRecordings', 'profile', profileId],
    queryFn: ({ pageParam }) =>
      liveRecordingsApi.listPublished(profileId, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ['liveRecordings'] });
  const publish = useMutation({
    mutationFn: (id: string) => liveRecordingsApi.publish(id),
    onSuccess: () => {
      toast.success(t('live.recording.published'));
      refresh();
    },
    onError: () => toast.error(t('live.recording.publish_failed')),
  });
  const remove = useMutation({
    mutationFn: (id: string) => liveRecordingsApi.remove(id),
    onSuccess: () => {
      setToDelete(null);
      toast.success(t('live.recording.deleted'));
      refresh();
    },
    onError: () => toast.error(t('live.recording.delete_failed')),
  });

  const kept = archive.data ?? [];
  const lives = published.data?.pages.flatMap((page) => page.data) ?? [];

  return (
    <div className="flex flex-col gap-8 px-3 pb-8 md:px-0">
      {isMe && kept.length > 0 && (
        <section
          aria-labelledby="lives-archive"
          className="flex flex-col gap-3"
        >
          <div>
            <h2
              id="lives-archive"
              className="text-base font-semibold text-white"
            >
              {t('profile.lives.archive_title')}
            </h2>
            <p className="text-sm text-white/60">
              {t('profile.lives.archive_desc')}
            </p>
          </div>
          <ul className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {kept.map((recording) => (
              <li key={recording.id} className="flex flex-col gap-2">
                <RecordingTile recording={recording} onPlay={setPlaying} />
                {recording.daysLeft !== null && (
                  <p className="text-xs text-white/60">
                    {t('profile.lives.days_left', {
                      count: recording.daysLeft,
                    })}
                  </p>
                )}
                {recording.recordingStatus === 'READY' && (
                  <>
                    <button
                      type="button"
                      onClick={() => publish.mutate(recording.id)}
                      disabled={publish.isPending}
                      className={`${CREATE_PRIMARY} w-full px-3`}
                    >
                      {t('live.recording.publish_short')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setToDelete(recording)}
                      aria-label={t('live.recording.delete')}
                      className={`${CREATE_SECONDARY} w-full px-3`}
                    >
                      {t('live.recording.delete_short')}
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section
        aria-label={t('profile.tabs.lives')}
        className="flex flex-col gap-3"
      >
        {isMe && kept.length > 0 && (
          <h2 className="text-base font-semibold text-white">
            {t('profile.lives.published_title')}
          </h2>
        )}
        {published.isLoading ? (
          <div role="status" className="flex justify-center py-16">
            <LoadingSpinner />
            <span className="sr-only">{t('common.loading')}</span>
          </div>
        ) : lives.length === 0 && (published.isError || published.isPaused) ? (
          // Recordings already shown stay when a later page or a refresh
          // fails; with none shown yet, the tab says it could not load them.
          <ErrorState
            message={published.isPaused ? t('common.offline') : undefined}
            onRetry={() => void published.refetch()}
          />
        ) : lives.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-16 text-center">
            <Radio size={32} className="text-white/40" aria-hidden="true" />
            <p className="text-base font-semibold text-white">
              {t('profile.lives.empty')}
            </p>
            {isMe && (
              <p className="text-sm text-white/60">
                {t('profile.lives.empty_desc')}
              </p>
            )}
          </div>
        ) : (
          <ul className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {lives.map((recording) => (
              <li key={recording.id}>
                <RecordingTile recording={recording} onPlay={setPlaying} />
              </li>
            ))}
          </ul>
        )}
        {published.hasNextPage && (
          <button
            type="button"
            onClick={() => published.fetchNextPage()}
            disabled={published.isFetchingNextPage}
            className={`button-alone ${CREATE_SECONDARY} self-center`}
          >
            {t('profile.lives.more')}
          </button>
        )}
      </section>

      <LiveReplayPlayer recording={playing} onClose={() => setPlaying(null)} />
      <ConfirmModal
        isOpen={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={() => toDelete && remove.mutate(toDelete.id)}
        title={t('live.recording.delete_confirm_title')}
        message={t('live.recording.delete_confirm_message')}
        confirmText={t('live.recording.delete')}
        isLoading={remove.isPending}
      />
    </div>
  );
}
