import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import {
  type LiveRecording,
  liveRecordingsApi,
} from '../../services/liveRecordings';
import { CREATE_PRIMARY, CREATE_SECONDARY } from '../create-post/createStyles';
import ConfirmModal from '../modals/ConfirmModal';

// How often the summary asks whether the recording is ready.
const POLL_MS = 5000;

interface LiveRecordingChoiceProps {
  streamId: string;
}

/**
 * On the summary of a live that ended: what became of its recording, and
 * the host's two choices once it is ready, publish it on the Profile or
 * delete it. Left alone, it stays in the host's archive for 30 days.
 */
export default function LiveRecordingChoice({
  streamId,
}: LiveRecordingChoiceProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [outcome, setOutcome] = useState<'published' | 'deleted' | null>(null);

  const { data: recording } = useQuery<LiveRecording>({
    queryKey: ['liveRecording', streamId],
    queryFn: () => liveRecordingsApi.get(streamId),
    refetchInterval: (query) => {
      const status = query.state.data?.recordingStatus;
      return status === 'RECORDING' || status === 'PROCESSING'
        ? POLL_MS
        : false;
    },
  });

  const settled = () => {
    queryClient.invalidateQueries({ queryKey: ['liveRecordings'] });
  };
  const publish = useMutation({
    mutationFn: () => liveRecordingsApi.publish(streamId),
    onSuccess: () => {
      setOutcome('published');
      settled();
    },
    onError: () => toast.error(t('live.recording.publish_failed')),
  });
  const remove = useMutation({
    mutationFn: () => liveRecordingsApi.remove(streamId),
    onSuccess: () => {
      setConfirmDelete(false);
      setOutcome('deleted');
      settled();
    },
    onError: () => toast.error(t('live.recording.delete_failed')),
  });

  if (!recording || recording.recordingStatus === 'NONE') return null;

  let line: string;
  if (outcome === 'published') line = t('live.recording.published');
  else if (outcome === 'deleted') line = t('live.recording.deleted');
  else if (recording.recordingStatus === 'SKIPPED_LIMIT')
    line = t('live.recording.not_recorded_limit');
  else if (recording.recordingStatus === 'FAILED')
    line = t('live.recording.not_recorded_failed');
  else if (recording.recordingStatus === 'READY')
    line = t('live.recording.ready', { count: recording.daysLeft ?? 30 });
  else line = t('live.recording.preparing');

  const canChoose = recording.recordingStatus === 'READY' && !outcome;

  return (
    <section
      aria-label={t('live.recording.title')}
      className="flex w-full flex-col gap-3"
    >
      <p className="text-center text-sm text-white/70" aria-live="polite">
        {line}
      </p>
      {canChoose && (
        <div className="flex w-full flex-col gap-2">
          <button
            type="button"
            onClick={() => publish.mutate()}
            disabled={publish.isPending}
            className={CREATE_PRIMARY}
          >
            {t('live.recording.publish')}
          </button>
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className={CREATE_SECONDARY}
          >
            {t('live.recording.delete')}
          </button>
        </div>
      )}
      <ConfirmModal
        isOpen={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => remove.mutate()}
        title={t('live.recording.delete_confirm_title')}
        message={t('live.recording.delete_confirm_message')}
        confirmText={t('live.recording.delete')}
        isLoading={remove.isPending}
      />
    </section>
  );
}
