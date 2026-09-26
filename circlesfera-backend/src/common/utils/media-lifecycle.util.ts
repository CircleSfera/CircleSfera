import type { MediaKind, MediaStatus } from '@prisma/client';

export interface MediaCreateInput {
  kind: MediaKind;
  status: MediaStatus;
  url: string;
  standardUrl: string | null;
  thumbnailUrl: string | null;
}

// Images and audio are always synchronous uploads (no transcode step), so
// they're READY the instant the owning row is created. A video is PENDING
// until video.processor.ts's HLS transcode job fills in standardUrl/
// thumbnailUrl.
export function buildMediaCreateInput(params: {
  type: string;
  url: string;
  standardUrl?: string | null;
  thumbnailUrl?: string | null;
}): MediaCreateInput {
  const kind: MediaKind =
    (params.type || '').toLowerCase() === 'video' ? 'VIDEO' : 'IMAGE';
  const standardUrl = params.standardUrl ?? null;
  const thumbnailUrl = params.thumbnailUrl ?? null;
  const status: MediaStatus =
    kind === 'VIDEO' && !standardUrl ? 'PENDING' : 'READY';

  return {
    kind,
    status,
    url: params.url,
    standardUrl,
    thumbnailUrl,
  };
}

interface MediaSourceFields {
  url: string | null;
  standardUrl: string | null;
  thumbnailUrl: string | null;
  status: MediaStatus;
}

export interface ResolvableMediaItem {
  url: string;
  standardUrl?: string | null;
  thumbnailUrl?: string | null;
  media?: MediaSourceFields | null;
}

// Prefers the linked Media row's fields (the single source of lifecycle
// truth going forward) over the legacy inline columns, falling back to the
// inline values for rows that predate this migration or whose Media row
// hasn't linked yet. Drops the nested `media` object from the output — API
// consumers get the resolved fields flattened onto the item itself, not the
// internal relation shape.
export function resolveMediaFields<T extends ResolvableMediaItem>(
  item: T,
): Omit<T, 'media'> & { status: MediaStatus } {
  const { media, ...rest } = item;
  return {
    ...rest,
    url: media?.url ?? item.url,
    standardUrl: media?.standardUrl ?? item.standardUrl ?? null,
    thumbnailUrl: media?.thumbnailUrl ?? item.thumbnailUrl ?? null,
    status: media?.status ?? 'READY',
  };
}
