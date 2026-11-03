import { LIVE_GUESTS_MAX } from '@circlesfera/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { type LiveGuest, liveApi } from '../services/live';
import { profileApi } from '../services/profile.service';
import { useSocketStore } from '../stores/socketStore';

/** Why inviting someone did not go through. */
export type GuestInviteError = 'not_found' | 'full' | 'already' | 'failed';

/** A Profile chosen in the setup, invited once the live starts. */
export interface QueuedGuest {
  profileId: string;
  username: string;
  avatar?: string | null;
}

/**
 * The guests of the host's live: invited or on air, at most
 * `LIVE_GUESTS_MAX`. Before the live starts the people chosen wait in a
 * list and are invited the moment it starts; once on air the list is the
 * server's, kept up to date by what the server tells the host alone.
 */
export function useLiveGuests(streamId: string | null) {
  const [guests, setGuests] = useState<LiveGuest[]>([]);
  const [queued, setQueued] = useState<QueuedGuest[]>([]);
  const queuedRef = useRef(queued);
  queuedRef.current = queued;

  // Everyone with a place: on air, invited, or waiting for the start.
  const taken = streamId ? guests.length : queued.length;
  const full = taken >= LIVE_GUESTS_MAX;

  useEffect(() => {
    if (!streamId) return;
    let cancelled = false;
    // The people chosen in the setup are invited now that the live is on.
    const waiting = queuedRef.current;
    setQueued([]);
    void Promise.allSettled(
      waiting.map((guest) => liveApi.inviteGuest(streamId, guest.profileId)),
    ).then(() =>
      liveApi
        .getStream(streamId)
        .then((stream: { guests?: LiveGuest[] }) => {
          if (!cancelled) setGuests(stream.guests ?? []);
        })
        .catch(() => {}),
    );
    // Only the host is told who is invited; the room hears who is on air.
    const socket = useSocketStore.getState().socket;
    const changed = (data: { guests?: LiveGuest[] }) =>
      setGuests(data.guests ?? []);
    socket?.on('live:guest_invites', changed);
    return () => {
      cancelled = true;
      socket?.off('live:guest_invites', changed);
    };
  }, [streamId]);

  /** Invites a Profile by its username; answers why not, if it did not. */
  const invite = useCallback(
    async (rawUsername: string): Promise<GuestInviteError | null> => {
      const username = rawUsername.trim().replace(/^@/, '');
      if (!username) return 'not_found';
      if (full) return 'full';
      let found: QueuedGuest | null = null;
      try {
        const { data } = await profileApi.getProfile(username);
        if (data?.id) {
          found = {
            profileId: data.id,
            username: data.username ?? username,
            avatar: data.avatar,
          };
        }
      } catch {
        found = null;
      }
      if (!found) return 'not_found';
      const chosen = found;
      const already = (streamId ? guests : queued).some(
        (guest) => guest.profileId === chosen.profileId,
      );
      if (already) return 'already';
      if (!streamId) {
        setQueued((list) => [...list, chosen]);
        return null;
      }
      try {
        await liveApi.inviteGuest(streamId, chosen.profileId);
        setGuests((list) =>
          list.some((guest) => guest.profileId === chosen.profileId)
            ? list
            : [...list, { ...chosen, status: 'INVITED' }],
        );
        return null;
      } catch {
        return 'failed';
      }
    },
    [full, guests, queued, streamId],
  );

  /** Takes a guest off: from the list before the start, from the live after. */
  const remove = useCallback(
    async (profileId: string): Promise<boolean> => {
      if (!streamId) {
        setQueued((list) => list.filter((g) => g.profileId !== profileId));
        return true;
      }
      try {
        await liveApi.removeGuest(streamId, profileId);
        setGuests((list) => list.filter((g) => g.profileId !== profileId));
        return true;
      } catch {
        return false;
      }
    },
    [streamId],
  );

  return { guests, queued, full, invite, remove };
}
