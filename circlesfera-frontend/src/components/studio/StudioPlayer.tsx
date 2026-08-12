import { useEffect, useRef, useState } from 'react';
import { useStudioStore } from '../../stores/studioStore';
import type { AspectRatioType, MediaClip, TextClip } from '../../types/studio';

export default function StudioPlayer() {
  const { project, playhead, isPlaying, setPlayhead } = useStudioStore();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [activeVideo, setActiveVideo] = useState<HTMLVideoElement | null>(null);
  const [activeImage, setActiveImage] = useState<HTMLImageElement | null>(null);
  const audioElementsRef = useRef<Record<string, HTMLAudioElement>>({});
  const imageCacheRef = useRef<Record<string, HTMLImageElement>>({});

  const aspect: AspectRatioType = project?.aspectRatio || '9:16';

  const getCanvasDimensions = () => {
    switch (aspect) {
      case '16:9':
        return { width: 1920, height: 1080, aspectClass: 'aspect-[16/9]' };
      case '1:1':
        return { width: 1080, height: 1080, aspectClass: 'aspect-square' };
      case '4:5':
        return { width: 1080, height: 1350, aspectClass: 'aspect-[4/5]' };
      case '9:16':
        return { width: 1080, height: 1920, aspectClass: 'aspect-[9/16]' };
      default:
        return { width: 1080, height: 1920, aspectClass: 'aspect-[9/16]' };
    }
  };

  const {
    width: canvasWidth,
    height: canvasHeight,
    aspectClass,
  } = getCanvasDimensions();

  useEffect(() => {
    if (!project) return;

    const videoTrack = project.tracks.find((t) => t.type === 'video');
    if (!videoTrack) return;

    const activeClip = videoTrack.clips.find(
      (c) => playhead >= c.startAt && playhead < c.startAt + c.duration,
    ) as MediaClip | undefined;

    if (activeClip && activeClip.type === 'video') {
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
      setActiveImage(null);
    } else if (activeClip && activeClip.type === 'image') {
      setActiveVideo(null);
      let img = imageCacheRef.current[activeClip.fileUrl];
      if (!img) {
        img = new Image();
        img.src = activeClip.fileUrl;
        imageCacheRef.current[activeClip.fileUrl] = img;
      }
      setActiveImage(img);
    } else {
      setActiveVideo(null);
      setActiveImage(null);
    }

    // Audio elements handling
    const audioClips = project.tracks
      .filter((t) => t.type === 'audio' && !t.muted)
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

  // Main Canvas Render Loop
  useEffect(() => {
    let animationId: number;
    const render = () => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (canvas && ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const { project, playhead } = useStudioStore.getState();

        // Render Media (Video or Image)
        if (project) {
          const videoTrack = project.tracks.find((t) => t.type === 'video');
          const activeClip = videoTrack?.clips.find(
            (c) => playhead >= c.startAt && playhead < c.startAt + c.duration,
          ) as MediaClip | undefined;

          if (activeClip && !videoTrack?.hidden) {
            ctx.save();

            // Set filter & opacity
            if (activeClip.filter) ctx.filter = activeClip.filter;
            if (typeof activeClip.opacity === 'number')
              ctx.globalAlpha = activeClip.opacity;

            // Transform
            const scale = activeClip.transform?.scale ?? 1;
            const rot = ((activeClip.transform?.rotation ?? 0) * Math.PI) / 180;
            const tx = activeClip.transform?.x ?? 0;
            const ty = activeClip.transform?.y ?? 0;

            ctx.translate(canvas.width / 2 + tx, canvas.height / 2 + ty);
            ctx.rotate(rot);
            ctx.scale(
              (activeClip.flipX ? -1 : 1) * scale,
              (activeClip.flipY ? -1 : 1) * scale,
            );

            if (activeClip.type === 'video' && activeVideo) {
              ctx.drawImage(
                activeVideo,
                -canvas.width / 2,
                -canvas.height / 2,
                canvas.width,
                canvas.height,
              );
            } else if (activeClip.type === 'image' && activeImage) {
              ctx.drawImage(
                activeImage,
                -canvas.width / 2,
                -canvas.height / 2,
                canvas.width,
                canvas.height,
              );
            }

            ctx.restore();
          }

          // Render Text Clips Overlays
          project.tracks
            .filter((t) => t.type === 'text' && !t.hidden)
            .forEach((track) => {
              track.clips.forEach((clip) => {
                if (
                  playhead >= clip.startAt &&
                  playhead < clip.startAt + clip.duration
                ) {
                  const textClip = clip as TextClip;
                  const style = textClip.style;
                  const fontSize = style.fontSize || 40;
                  const fontFamily = style.fontFamily || 'Inter';

                  ctx.save();
                  ctx.font = `bold ${fontSize}px ${fontFamily}, sans-serif`;
                  ctx.textAlign = style.textAlign || 'center';

                  const textMetrics = ctx.measureText(textClip.content);
                  const textWidth = textMetrics.width;
                  const padding = style.padding ?? 12;
                  const textHeight = fontSize * 1.2;

                  const x = canvas.width / 2 + (textClip.transform?.x ?? 0);
                  const y = canvas.height / 2 + (textClip.transform?.y ?? 0);

                  // Background Box
                  if (
                    style.backgroundColor &&
                    style.backgroundColor !== 'transparent'
                  ) {
                    ctx.fillStyle = style.backgroundColor;
                    const boxX = x - textWidth / 2 - padding;
                    const boxY = y - fontSize + padding / 2;
                    const boxW = textWidth + padding * 2;
                    const boxH = textHeight + padding;
                    const radius = style.borderRadius ?? 8;

                    ctx.beginPath();
                    ctx.roundRect(boxX, boxY, boxW, boxH, radius);
                    ctx.fill();
                  }

                  // Shadow
                  if (style.shadowColor) {
                    ctx.shadowColor = style.shadowColor;
                    ctx.shadowBlur = style.shadowBlur ?? 10;
                  }

                  // Stroke / Outline
                  if (style.strokeColor && style.strokeWidth) {
                    ctx.strokeStyle = style.strokeColor;
                    ctx.lineWidth = style.strokeWidth;
                    ctx.strokeText(textClip.content, x, y);
                  }

                  // Text Fill
                  ctx.fillStyle = style.color || '#ffffff';
                  ctx.fillText(textClip.content, x, y);
                  ctx.restore();
                }
              });
            });
        }
      }
      animationId = requestAnimationFrame(render);
    };
    render();
    return () => cancelAnimationFrame(animationId);
  }, [activeVideo, activeImage]);

  // Playhead step loop during playback
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (isPlaying) {
      let lastTime = performance.now();
      interval = setInterval(() => {
        const now = performance.now();
        const delta = (now - lastTime) / 1000;
        lastTime = now;

        const currentPlayhead = useStudioStore.getState().playhead;
        const project = useStudioStore.getState().project;

        if (project && currentPlayhead + delta >= project.duration) {
          setPlayhead(0);
          useStudioStore.getState().setPlaying(false);
        } else {
          setPlayhead(currentPlayhead + delta);
        }
      }, 1000 / 60);
    }
    return () => clearInterval(interval);
  }, [isPlaying, setPlayhead]);

  if (!project) return null;

  const hasClips = project.tracks.some((track) => track.clips.length > 0);

  return (
    <div className="w-full h-full flex items-center justify-center bg-transparent relative p-2 sm:p-6 overflow-hidden">
      <div
        className={`h-full max-h-full w-auto ${aspectClass} rounded-2xl overflow-hidden shadow-2xl ring-1 ring-white/10 bg-[#000000] relative flex items-center justify-center`}
      >
        {!hasClips && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-white/40 pointer-events-none z-10 bg-black/60 backdrop-blur-sm p-4 text-center">
            <p className="text-sm font-semibold text-white/80">
              Proyecto vacío
            </p>
            <p className="text-xs text-white/40 mt-1">
              Añade vídeos, imágenes o texto desde el panel lateral
            </p>
          </div>
        )}

        <canvas
          ref={canvasRef}
          width={canvasWidth}
          height={canvasHeight}
          className="w-full h-full object-contain"
        />
      </div>
    </div>
  );
}
