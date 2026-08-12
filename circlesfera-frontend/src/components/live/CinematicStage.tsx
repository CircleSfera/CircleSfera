import { TrackToggle, useTracks, VideoTrack } from '@livekit/components-react';
import { Track } from 'livekit-client';

export default function CinematicStage({
  isBroadcaster = false,
}: {
  isBroadcaster?: boolean;
}) {
  const tracks = useTracks([Track.Source.Camera]);

  if (tracks.length === 0) {
    return (
      <div className="absolute inset-0 bg-zinc-900 flex items-center justify-center text-white/50 text-sm">
        {isBroadcaster ? 'Iniciando cámara...' : 'Esperando transmisión...'}
      </div>
    );
  }

  // Dynamic multi-host layout (1 to 4 streams)
  const trackCount = tracks.length;

  return (
    <div className="absolute inset-0 w-full h-full bg-neutral-950 overflow-hidden">
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
        <div className="absolute inset-0 w-full h-full flex flex-col md:flex-row gap-2 p-2 bg-neutral-950">
          <div className="flex-1 relative overflow-hidden rounded-2xl border border-white/10 shadow-2xl">
            <VideoTrack
              trackRef={tracks[0]}
              className="w-full h-full object-cover"
            />
            <div className="absolute top-3 left-3 px-3 py-1 bg-black/60 backdrop-blur-md rounded-full border border-white/15 text-xs font-bold text-white shadow-lg flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>{tracks[0].participant.identity || 'Host 1'}</span>
            </div>
          </div>
          <div className="flex-1 relative overflow-hidden rounded-2xl border border-white/10 shadow-2xl">
            <VideoTrack
              trackRef={tracks[1]}
              className="w-full h-full object-cover"
            />
            <div className="absolute top-3 left-3 px-3 py-1 bg-black/60 backdrop-blur-md rounded-full border border-white/15 text-xs font-bold text-white shadow-lg flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
              <span>{tracks[1].participant.identity || 'Co-Host'}</span>
            </div>
          </div>
        </div>
      )}

      {/* 3 or 4 Streams: 2x2 Grid Layout */}
      {trackCount >= 3 && (
        <div className="absolute inset-0 w-full h-full grid grid-cols-2 grid-rows-2 gap-2 bg-neutral-950 p-2">
          {tracks.slice(0, 4).map((trackRef, idx) => (
            <div
              key={trackRef.participant.sid || idx}
              className="relative w-full h-full overflow-hidden rounded-2xl border border-white/15 shadow-2xl bg-neutral-900"
            >
              <VideoTrack
                trackRef={trackRef}
                className="w-full h-full object-cover"
              />
              <div className="absolute bottom-3 left-3 px-3 py-1 bg-black/70 backdrop-blur-md rounded-full border border-white/20 text-xs font-bold text-white shadow-md flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-purple-400 animate-pulse" />
                <span>
                  {trackRef.participant.identity || `Host ${idx + 1}`}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Broadcaster Controls — Sleek & Compact */}
      {isBroadcaster && (
        <div className="absolute bottom-20 right-4 flex flex-col gap-2.5 z-50">
          <TrackToggle
            source={Track.Source.Camera}
            className="w-10 h-10 flex items-center justify-center rounded-full bg-neutral-900/80 hover:bg-neutral-800 text-white backdrop-blur-xl border border-white/20 shadow-xl transition-all hover:scale-105 active:scale-95 [&>svg]:w-4 [&>svg]:h-4"
          />

          <TrackToggle
            source={Track.Source.Microphone}
            className="w-10 h-10 flex items-center justify-center rounded-full bg-neutral-900/80 hover:bg-neutral-800 text-white backdrop-blur-xl border border-white/20 shadow-xl transition-all hover:scale-105 active:scale-95 [&>svg]:w-4 [&>svg]:h-4"
          />
        </div>
      )}
    </div>
  );
}
