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

  // Si hay más de 1 track (ej. co-host), mostramos el primero en grande y el segundo en PiP
  const mainTrack = tracks[0];
  const pipTrack = tracks.length > 1 ? tracks[1] : null;

  return (
    <div className="absolute inset-0 w-full h-full bg-black">
      {/* Main Track - Full Bleed */}
      <div className="absolute inset-0 w-full h-full">
        <VideoTrack
          trackRef={mainTrack}
          className="w-full h-full object-cover"
        />
      </div>

      {/* PiP Track */}
      {pipTrack && (
        <div className="absolute top-20 right-4 w-32 h-48 md:w-48 md:h-72 bg-black rounded-xl overflow-hidden shadow-2xl border-2 border-white/20 z-40">
          <VideoTrack
            trackRef={pipTrack}
            className="w-full h-full object-cover"
          />
        </div>
      )}

      {/* Broadcaster Controls */}
      {isBroadcaster && (
        <div className="absolute bottom-32 right-4 flex flex-col gap-3 z-50">
          <TrackToggle
            source={Track.Source.Camera}
            className="w-12 h-12 flex items-center justify-center rounded-full bg-black/60 hover:bg-black/80 text-white backdrop-blur-md border border-white/10 transition-colors [&>svg]:w-5 [&>svg]:h-5"
          />

          <TrackToggle
            source={Track.Source.Microphone}
            className="w-12 h-12 flex items-center justify-center rounded-full bg-black/60 hover:bg-black/80 text-white backdrop-blur-md border border-white/10 transition-colors [&>svg]:w-5 [&>svg]:h-5"
          />
        </div>
      )}
    </div>
  );
}
