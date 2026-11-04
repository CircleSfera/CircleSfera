import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { liveApi, type ScheduledLive } from '../services/live';

// Lives scheduled ahead of time and the reminders of them. Every list of
// them is kept under one key per Profile, so a change anywhere refreshes it.

export const scheduledLivesKey = (profileId?: string) =>
  profileId ? (['scheduledLives', profileId] as const) : ['scheduledLives'];

/** The upcoming lives of a Profile that the viewer may see, soonest first. */
export function useScheduledLives(profileId?: string | null) {
  return useQuery({
    queryKey: scheduledLivesKey(profileId ?? undefined),
    queryFn: () => liveApi.listScheduled(profileId as string),
    enabled: !!profileId,
  });
}

/** The host schedules a live. */
export function useScheduleLive() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Parameters<typeof liveApi.schedule>[0]) =>
      liveApi.schedule(body),
    onSuccess: (live) =>
      queryClient.invalidateQueries({
        queryKey: scheduledLivesKey(live.hostId),
      }),
  });
}

/** The host cancels an upcoming live of theirs. */
export function useCancelScheduledLive() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (live: ScheduledLive) => liveApi.cancelScheduled(live.id),
    onSuccess: (_answer, live) =>
      queryClient.invalidateQueries({
        queryKey: scheduledLivesKey(live.hostId),
      }),
  });
}

/**
 * A viewer asks to be reminded of an upcoming live, or takes it back. The
 * card shows the choice at once and goes back if the server refuses it.
 */
export function useLiveReminder() {
  const queryClient = useQueryClient();
  const setReminded = (live: ScheduledLive, reminded: boolean) =>
    queryClient.setQueryData<ScheduledLive[]>(
      scheduledLivesKey(live.hostId),
      (lives) =>
        lives?.map((one) => (one.id === live.id ? { ...one, reminded } : one)),
    );
  return useMutation({
    mutationFn: (live: ScheduledLive) =>
      live.reminded ? liveApi.unremind(live.id) : liveApi.remind(live.id),
    onMutate: async (live) => {
      await queryClient.cancelQueries({
        queryKey: scheduledLivesKey(live.hostId),
      });
      setReminded(live, !live.reminded);
    },
    onSuccess: (answer, live) => setReminded(live, answer.reminded),
    onError: (_error, live) => setReminded(live, live.reminded),
    // A live no longer shown (cancelled, or no longer for the viewer) is
    // dropped from the list.
    onSettled: (_answer, error, live) => {
      if (error) {
        void queryClient.invalidateQueries({
          queryKey: scheduledLivesKey(live.hostId),
        });
      }
    },
  });
}
