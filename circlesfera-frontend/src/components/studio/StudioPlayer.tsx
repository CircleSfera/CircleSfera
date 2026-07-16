import { useEffect, useRef, useState } from 'react';
import { useStudioStore } from '../../stores/studioStore';
import type { MediaClip, TextClip } from '../../types/studio';

export default function StudioPlayer() {
  const { project, playhead, isPlaying, setPlayhead } = useStudioStore();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [activeVideo, setActiveVideo] = useState<HTMLVideoElement | null>(null);
  const audioElementsRef = useRef<Record<string, HTMLAudioElement>>({});

  useEffect(() => {
    if (!project) return;

    // Find active media clip at current playhead
    const activeTrack = project.tracks.find((t) => t.type === 'video');
    if (!activeTrack) return;

    const activeClip = activeTrack.clips.find(
      (c) =>
        c.type === 'video' &&
        playhead >= c.startAt &&
        playhead < c.startAt + c.duration,
    ) as MediaClip | undefined;

    // This is a naive implementation. In a real studio, we'd have a pool of video elements
    // or decode frames using WebCodecs.
    if (activeClip && activeClip.type === 'video') {
      // Find or create a video element for this clip
      let videoEl = document.getElementById(
        `studio-video-${activeClip.id}`,
      ) as HTMLVideoElement;
      if (!videoEl) {
        videoEl = document.createElement('video');
        videoEl.id = `studio-video-${activeClip.id}`;
        videoEl.src = activeClip.fileUrl;
        videoEl.muted = activeClip.muted;
        videoEl.style.display = 'none';
        document.body.appendChild(videoEl);
      }

      const targetTime =
        activeClip.mediaStart +
        (playhead - activeClip.startAt) * (activeClip.speed ?? 1);
      if (Math.abs(videoEl.currentTime - targetTime) > 0.1) {
        videoEl.currentTime = targetTime;
      }
      videoEl.volume = Math.max(0, Math.min(1, activeClip.volume ?? 1));

      setActiveVideo(videoEl);
    } else {
      setActiveVideo(null);
    }

    // Handle Audio Tracks
    const audioClips = project.tracks
      .filter((t) => t.type === 'audio')
      .flatMap((t) => t.clips) as MediaClip[];

    audioClips.forEach((clip) => {
      let audioEl = audioElementsRef.current[clip.id];
      if (!audioEl) {
        audioEl = document.createElement('audio');
        audioEl.src = clip.fileUrl;
        audioEl.volume = clip.volume;
        document.body.appendChild(audioEl);
        audioElementsRef.current[clip.id] = audioEl;
      }

      const isOverlapping =
        playhead >= clip.startAt && playhead < clip.startAt + clip.duration;

      if (isOverlapping) {
        const targetTime =
          clip.mediaStart + (playhead - clip.startAt) * (clip.speed ?? 1);
        if (Math.abs(audioEl.currentTime - targetTime) > 0.2) {
          audioEl.currentTime = targetTime;
        }
        audioEl.volume = Math.max(0, Math.min(1, clip.volume ?? 1));
        audioEl.playbackRate = clip.speed ?? 1;
        if (isPlaying && audioEl.paused) {
          audioEl.play().catch(() => {});
        } else if (!isPlaying && !audioEl.paused) {
          audioEl.pause();
        }
      } else {
        if (!audioEl.paused) {
          audioEl.pause();
        }
      }
    });
  }, [playhead, project, isPlaying]);

  // Render loop
  useEffect(() => {
    let animationId: number;
    const render = () => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (canvas && ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const { project, playhead } = useStudioStore.getState();

        if (activeVideo && project) {
          // Find the active video clip to get its filter
          const activeTrack = project.tracks.find((t) => t.type === 'video');
          const activeClip = activeTrack?.clips.find(
            (c) =>
              c.type === 'video' &&
              playhead >= c.startAt &&
              playhead < c.startAt + c.duration,
          ) as MediaClip | undefined;

          if (activeClip?.filter) {
            ctx.filter = activeClip.filter;
          } else {
            ctx.filter = 'none';
          }

          ctx.drawImage(activeVideo, 0, 0, canvas.width, canvas.height);
          ctx.filter = 'none'; // reset for text
        }

        // Render text overlays
        if (project) {
          project.tracks
            .filter((t) => t.type === 'text')
            .forEach((track) => {
              track.clips.forEach((clip) => {
                if (
                  playhead >= clip.startAt &&
                  playhead < clip.startAt + clip.duration
                ) {
                  const textClip = clip as TextClip;
                  ctx.font = `${textClip.style.fontSize}px ${textClip.style.fontFamily}`;
                  ctx.fillStyle = textClip.style.color;
                  ctx.textAlign = textClip.style.textAlign;
                  ctx.fillText(
                    textClip.content,
                    canvas.width / 2 + textClip.transform.x,
                    canvas.height / 2 + textClip.transform.y,
                  );
                }
              });
            });
        }
      }
      animationId = requestAnimationFrame(render);
    };
    render();
    return () => cancelAnimationFrame(animationId);
  }, [activeVideo]);

  // Playback timer
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (isPlaying) {
      let lastTime = performance.now();
      interval = setInterval(() => {
        const now = performance.now();
        const delta = (now - lastTime) / 1000; // in seconds
        lastTime = now;

        const currentPlayhead = useStudioStore.getState().playhead;
        const project = useStudioStore.getState().project;

        if (project && currentPlayhead + delta >= project.duration) {
          setPlayhead(0);
          useStudioStore.getState().setPlaying(false);
        } else {
          setPlayhead(currentPlayhead + delta);
        }
      }, 1000 / 60); // 60fps update
    }
    return () => clearInterval(interval);
  }, [isPlaying, setPlayhead]);

  if (!project) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-[#0a0a0c] text-white/40">
        <div className="w-16 h-16 mb-4 rounded-full bg-white/5 flex items-center justify-center">
          <svg
            className="w-8 h-8 opacity-50"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M12 4v16m8-8H4"
            />
          </svg>
        </div>
        <p className="text-sm font-medium">No hay proyecto cargado</p>
      </div>
    );
  }

  // Comprobar si hay clips en el proyecto
  const hasClips = project.tracks.some((track) => track.clips.length > 0);

  return (
    <div className="w-full h-full flex items-center justify-center bg-transparent relative p-4 md:p-8">
      {/* 9:16 Aspect Ratio Canvas for mobile video */}
      <div className="h-full w-auto aspect-9/16 rounded-xl overflow-hidden shadow-2xl ring-1 ring-white/10 bg-checkerboard relative flex items-center justify-center">
        {!hasClips && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-white/40 pointer-events-none z-10 bg-black/40 backdrop-blur-sm">
            <p className="text-sm font-medium">
              Arrastra contenido o usa [+ Agregar]
            </p>
          </div>
        )}
        <canvas
          ref={canvasRef}
          width={1080}
          height={1920}
          className="w-full h-full object-contain"
        />
      </div>
    </div>
  );
}
