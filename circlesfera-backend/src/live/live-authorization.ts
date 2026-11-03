import type { LiveGuestStatus } from '@prisma/client';

// Single source of truth for "is this profile the host, or a guest on air,
// of this stream" — used by both the REST live-stream flows (LiveService)
// and the Socket.IO realtime flows (LiveRealtimeService, app.gateway.ts) so
// the two never drift into independently-maintained copies of the same rule.
export function isStreamHost(
  stream: { hostId: string },
  profileId: string,
): boolean {
  return stream.hostId === profileId;
}

/**
 * The host, or a guest on air with them: who may pin a comment, highlight a
 * question or set the goal. A guest only invited may not yet.
 */
export function isStreamHostOrOnAirGuest(
  stream: { hostId: string },
  profileId: string,
  guestStatus: LiveGuestStatus | null | undefined,
): boolean {
  return isStreamHost(stream, profileId) || guestStatus === 'ON_AIR';
}
