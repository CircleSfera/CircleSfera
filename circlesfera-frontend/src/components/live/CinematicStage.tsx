import { useTracks, VideoTrack } from '@livekit/components-react';
import { Track } from 'livekit-client';
import { useTranslation } from 'react-i18next';

export default function CinematicStage({
  isBroadcaster = false,
}: {
  isBroadcaster?: boolean;
}) {
  const { t } = useTranslation();
  const tracks = useTracks([Track.Source.Camera]);

  if (tracks.length === 0) {
    return (
      <div className="absolute inset-0 bg-surface-elevated flex items-center justify-center text-white/50 text-sm">
        {isBroadcaster ? t('live.starting_camera') : t('live.waiting_stream')}
      </div>
    );
  }

  // Dynamic multi-host layout (1 to 4 streams)
  const trackCount = tracks.length;

  return (
    <div className="absolute inset-0 w-full h-full bg-surface-base overflow-hidden">
      {/* 1 Stream: Full Bleed with subtle vignette overlay */}
      {trackCount === 1 && (
        <div className="absolute inset-0 w-full h-full">
          <VideoTrack
            trackRef={tracks[0]}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-linear-to-b from-black/60 via-transparent to-black/80 pointer-events-none" />
        </div>
      )}

      {/* 2 Streams: Split Screen (50 / 50) */}
      {trackCount === 2 && (
        <div className="absolute inset-0 w-full h-full flex flex-col md:flex-row gap-2 p-2 bg-surface-base">
          <div className="flex-1 relative overflow-hidden rounded-2xl border border-white/10 shadow-2xl">
            <VideoTrack
              trackRef={tracks[0]}
              className="w-full h-full object-cover"
            />
            <div className="absolute bottom-3 left-3 px-3 py-1 bg-black/60 backdrop-blur-md rounded-full border border-white/15 text-xs font-bold text-white shadow-lg flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>
                {tracks[0].participant.identity || t('live.host_n', { n: 1 })}
              </span>
            </div>
          </div>
          <div className="flex-1 relative overflow-hidden rounded-2xl border border-white/10 shadow-2xl">
            <VideoTrack
              trackRef={tracks[1]}
              className="w-full h-full object-cover"
            />
            <div className="absolute bottom-3 left-3 px-3 py-1 bg-black/60 backdrop-blur-md rounded-full border border-white/15 text-xs font-bold text-white shadow-lg flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
              <span>
                {tracks[1].participant.identity || t('live.cohost_fallback')}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* 3 or 4 Streams: 2x2 Grid Layout */}
      {trackCount >= 3 && (
        <div className="absolute inset-0 w-full h-full grid grid-cols-2 grid-rows-2 gap-2 bg-surface-base p-2">
          {tracks.slice(0, 4).map((trackRef, idx) => (
            <div
              key={trackRef.participant.sid || idx}
              className="relative w-full h-full overflow-hidden rounded-2xl border border-white/15 shadow-2xl bg-surface-elevated"
            >
              <VideoTrack
                trackRef={trackRef}
                className="w-full h-full object-cover"
              />
              <div className="absolute bottom-3 left-3 px-3 py-1 bg-black/70 backdrop-blur-md rounded-full border border-white/20 text-xs font-bold text-white shadow-md flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-brand-primary animate-pulse" />
                <span>
                  {trackRef.participant.identity ||
                    t('live.host_n', { n: idx + 1 })}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
