// Single source of truth for "is this profile the host/co-host of this
// stream" — used by both the REST live-stream flows (LiveService) and the
// Socket.IO realtime flows (LiveRealtimeService, app.gateway.ts) so the two
// never drift into independently-maintained copies of the same rule
// (AUTHZ-005).
export interface StreamHostRoles {
  hostId: string;
  coHostId: string | null;
}

export function isStreamHost(
  stream: Pick<StreamHostRoles, 'hostId'>,
  profileId: string,
): boolean {
  return stream.hostId === profileId;
}

export function isStreamCoHost(
  stream: Pick<StreamHostRoles, 'coHostId'>,
  profileId: string,
): boolean {
  return stream.coHostId === profileId;
}

export function isStreamHostOrCoHost(
  stream: StreamHostRoles,
  profileId: string,
): boolean {
  return isStreamHost(stream, profileId) || isStreamCoHost(stream, profileId);
}
