import { LIVE_GUESTS_MAX } from '@circlesfera/shared';
import {
  type TrackReference,
  useTracks,
  VideoTrack,
} from '@livekit/components-react';
import { Track, TrackEvent } from 'livekit-client';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

/** The host and every guest on air, each in their own tile. */
const STAGE_MAX = 1 + LIVE_GUESTS_MAX;

/** Which way the camera behind a track looks, when the browser tells. */
function facingOf(trackRef: TrackReference): string | undefined {
  return trackRef.publication.track?.mediaStreamTrack?.getSettings?.()
    .facingMode;
}

/**
 * One person's video. A person sees their own camera as a mirror, the way
 * they expect to see themself, unless it is the back camera; what everyone
 * else sees, and what is recorded, is never mirrored.
 */
function StageVideo({ trackRef }: { trackRef: TrackReference }) {
  const track = trackRef.publication.track;
  const [facing, setFacing] = useState(() => facingOf(trackRef));
  useEffect(() => {
    if (!track) return;
    // Turning the camera restarts the track with the other one.
    const read = () => setFacing(facingOf(trackRef));
    read();
    track.on(TrackEvent.Restarted, read);
    return () => {
      track.off(TrackEvent.Restarted, read);
    };
  }, [track, trackRef]);
  const mirrored = trackRef.participant.isLocal && facing !== 'environment';
  return (
    <VideoTrack
      trackRef={trackRef}
      className={`w-full h-full object-cover ${mirrored ? '-scale-x-100' : ''}`}
    />
  );
}

/**
 * The video of a live, upright 9:16 on every screen: the host alone fills
 * it; with one guest the two are stacked; with two or three guests it is a
 * grid of two by two. Each tile shows the person's name, read from `names`
 * by the Profile id the video room knows them by.
 */
export default function CinematicStage({
  isBroadcaster = false,
  names = {},
}: {
  isBroadcaster?: boolean;
  names?: Record<string, string>;
}) {
  const { t } = useTranslation();
  const tracks = useTracks([Track.Source.Camera]).slice(0, STAGE_MAX);

  if (tracks.length === 0) {
    return (
      <div className="absolute inset-0 bg-surface-elevated flex items-center justify-center text-white/50 text-sm">
        {isBroadcaster ? t('live.starting_camera') : t('live.waiting_stream')}
      </div>
    );
  }

  if (tracks.length === 1) {
    return (
      <div className="absolute inset-0 w-full h-full bg-surface-base overflow-hidden">
        <StageVideo trackRef={tracks[0]} />
        <div className="absolute inset-0 bg-linear-to-b from-black/60 via-transparent to-black/80 pointer-events-none" />
      </div>
    );
  }

  const nameOf = (identity: string, name?: string) =>
    names[identity] || name || t('live.guests.fallback');

  return (
    <div
      data-testid="live-stage"
      className={`absolute inset-0 grid h-full w-full gap-2 overflow-hidden bg-surface-base p-2 ${
        tracks.length === 2
          ? 'grid-cols-1 grid-rows-2'
          : 'grid-cols-2 grid-rows-2'
      }`}
    >
      {tracks.map((trackRef) => (
        <div
          key={trackRef.participant.identity}
          className="relative h-full w-full overflow-hidden rounded-2xl border border-white/15 bg-surface-elevated shadow-2xl"
        >
          <StageVideo trackRef={trackRef} />
          <div className="absolute bottom-3 left-3 flex max-w-[calc(100%-1.5rem)] items-center gap-1.5 rounded-full border border-white/20 bg-black/70 px-3 py-1 text-xs font-bold text-white shadow-md backdrop-blur-md">
            <span className="h-2 w-2 shrink-0 rounded-full bg-brand-primary" />
            <span className="truncate">
              {nameOf(trackRef.participant.identity, trackRef.participant.name)}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
