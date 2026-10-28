import { apiClient as api } from './api';

/** Where the recording of a broadcast is. */
export type LiveRecordingStatus =
  | 'NONE'
  | 'RECORDING'
  | 'PROCESSING'
  | 'READY'
  | 'FAILED'
  | 'SKIPPED_LIMIT';

export interface LiveRecording {
  id: string;
  title: string | null;
  startedAt: string;
  endedAt: string | null;
  recordingStatus: LiveRecordingStatus;
  recordingDurationMs: number | null;
  replayUrl: string | null;
  thumbnailUrl: string | null;
  publishedAt: string | null;
  // Days before a recording not published is deleted; null once published.
  daysLeft: number | null;
}

export interface LiveRecordingsPage {
  data: LiveRecording[];
  nextCursor: string | null;
}

export const liveRecordingsApi = {
  /** The recording of one of the host's own broadcasts. */
  get: async (streamId: string) =>
    (await api.get<LiveRecording>(`/live-recordings/${streamId}`)).data,

  /** The host's archive: recordings not published, with the days left. */
  listMine: async () =>
    (await api.get<LiveRecording[]>('/live-recordings/mine')).data,

  /** A Profile's published recordings, a page at a time. */
  listPublished: async (profileId: string, cursor?: string) =>
    (
      await api.get<LiveRecordingsPage>(
        `/live-recordings/profile/${profileId}`,
        { params: cursor ? { cursor } : {} },
      )
    ).data,

  publish: async (streamId: string) =>
    (
      await api.post<{ publishedAt: string }>(
        `/live-recordings/${streamId}/publish`,
      )
    ).data,

  remove: async (streamId: string) =>
    (await api.delete<{ success: boolean }>(`/live-recordings/${streamId}`))
      .data,
};

/** A length as m:ss or h:mm:ss. */
export function recordingLength(ms: number | null): string {
  if (!ms || ms < 0) return '0:00';
  const total = Math.round(ms / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = String(total % 60).padStart(2, '0');
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${seconds}`
    : `${minutes}:${seconds}`;
}
