import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useStudioStore } from '../../stores/studioStore';
import type { AspectRatioType, MediaClip, TextClip } from '../../types/studio';
import {
  containRect,
  resolutionForAspect,
} from '../../utils/studioExportHelpers';

function isVisualClip(clip: { type: string }): clip is MediaClip {
  return clip.type === 'video' || clip.type === 'image';
}

function drawMediaClip(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  clip: MediaClip,
  videoEl: HTMLVideoElement | undefined,
  imageEl: HTMLImageElement | undefined,
) {
  const source =
    clip.type === 'video' ? videoEl : clip.type === 'image' ? imageEl : null;
  if (!source) return;

  const srcW =
    source instanceof HTMLVideoElement
      ? source.videoWidth
      : source.naturalWidth;
  const srcH =
    source instanceof HTMLVideoElement
      ? source.videoHeight
      : source.naturalHeight;
  if (!srcW || !srcH) return;

  const fit = containRect(srcW, srcH, canvas.width, canvas.height);

  ctx.save();
  if (clip.filter) ctx.filter = clip.filter;
  if (typeof clip.opacity === 'number') ctx.globalAlpha = clip.opacity;

  const scale = clip.transform?.scale ?? 1;
  const rot = ((clip.transform?.rotation ?? 0) * Math.PI) / 180;
  const tx = clip.transform?.x ?? 0;
  const ty = clip.transform?.y ?? 0;

  ctx.translate(canvas.width / 2 + tx, canvas.height / 2 + ty);
  ctx.rotate(rot);
  ctx.scale((clip.flipX ? -1 : 1) * scale, (clip.flipY ? -1 : 1) * scale);
  ctx.drawImage(source, -fit.w / 2, -fit.h / 2, fit.w, fit.h);
  ctx.restore();
}

export default function StudioPlayer() {
  const { t } = useTranslation();
  const { project, playhead, isPlaying, setPlayhead } = useStudioStore();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioElementsRef = useRef<Record<string, HTMLAudioElement>>({});
  const videoElementsRef = useRef<Record<string, HTMLVideoElement>>({});
  const imageCacheRef = useRef<Record<string, HTMLImageElement>>({});

  const aspect: AspectRatioType = project?.aspectRatio || '9:16';
  const dims = resolutionForAspect(aspect);
  const aspectClass =
    aspect === '16:9'
      ? 'aspect-[16/9]'
      : aspect === '1:1'
        ? 'aspect-square'
        : aspect === '4:5'
          ? 'aspect-[4/5]'
          : 'aspect-[9/16]';

  // Sync all overlapping visual + audio layers to the playhead
  useEffect(() => {
    if (!project) return;

    const videoTracks = project.tracks.filter(
      (tr) => tr.type === 'video' && !tr.hidden,
    );
    const overlapping: MediaClip[] = [];
    for (const track of videoTracks) {
      for (const clip of track.clips) {
        if (
          isVisualClip(clip) &&
          playhead >= clip.startAt &&
          playhead < clip.startAt + clip.duration
        ) {
          overlapping.push(clip);
        }
      }
    }

    const activeVideoIds = new Set<string>();

    for (const clip of overlapping) {
      if (clip.type === 'video') {
        activeVideoIds.add(clip.id);
        let videoEl = videoElementsRef.current[clip.id];
        if (!videoEl) {
          videoEl = document.createElement('video');
          videoEl.playsInline = true;
          videoEl.preload = 'auto';
          videoEl.src = clip.fileUrl;
          videoEl.style.display = 'none';
          document.body.appendChild(videoEl);
          videoElementsRef.current[clip.id] = videoEl;
        }

        const parentTrack = videoTracks.find((tr) =>
          tr.clips.some((c) => c.id === clip.id),
        );
        videoEl.muted = Boolean(clip.muted) || Boolean(parentTrack?.muted);
        videoEl.volume = Math.max(0, Math.min(1, clip.volume ?? 1));
        videoEl.playbackRate = clip.speed ?? 1;

        const targetTime =
          clip.mediaStart + (playhead - clip.startAt) * (clip.speed ?? 1);
        if (Math.abs(videoEl.currentTime - targetTime) > 0.15) {
          videoEl.currentTime = targetTime;
        }

        if (isPlaying && videoEl.paused) {
          videoEl.play().catch(() => {});
        } else if (!isPlaying && !videoEl.paused) {
          videoEl.pause();
        }
      } else if (clip.type === 'image') {
        if (!imageCacheRef.current[clip.fileUrl]) {
          const img = new Image();
          img.src = clip.fileUrl;
          imageCacheRef.current[clip.fileUrl] = img;
        }
      }
    }

    Object.entries(videoElementsRef.current).forEach(([id, el]) => {
      if (!activeVideoIds.has(id) && !el.paused) el.pause();
    });

    const audioClips = project.tracks
      .filter((tr) => tr.type === 'audio' && !tr.muted)
      .flatMap((tr) => tr.clips) as MediaClip[];

    audioClips.forEach((clip) => {
      let audioEl = audioElementsRef.current[clip.id];
      if (!audioEl) {
        audioEl = document.createElement('audio');
        audioEl.preload = 'auto';
        audioEl.src = clip.fileUrl;
        document.body.appendChild(audioEl);
        audioElementsRef.current[clip.id] = audioEl;
      }

      const overlappingAudio =
        playhead >= clip.startAt && playhead < clip.startAt + clip.duration;

      if (overlappingAudio && !clip.muted) {
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
      } else if (!audioEl.paused) {
        audioEl.pause();
      }
    });
  }, [playhead, project, isPlaying]);

  useEffect(() => {
    const videos = videoElementsRef.current;
    const audios = audioElementsRef.current;
    return () => {
      Object.values(videos).forEach((el) => {
        el.pause();
        el.removeAttribute('src');
        el.load();
        el.remove();
      });
      Object.values(audios).forEach((el) => {
        el.pause();
        el.removeAttribute('src');
        el.load();
        el.remove();
      });
    };
  }, []);

  // Canvas render loop — composites all overlapping visual layers (track order)
  useEffect(() => {
    let animationId: number;
    const render = () => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (canvas && ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const { project: proj, playhead: ph } = useStudioStore.getState();

        if (proj) {
          const videoTracks = proj.tracks.filter(
            (tr) => tr.type === 'video' && !tr.hidden,
          );

          for (const track of videoTracks) {
            const layers = track.clips
              .filter(
                (c): c is MediaClip =>
                  isVisualClip(c) &&
                  ph >= c.startAt &&
                  ph < c.startAt + c.duration,
              )
              .slice()
              .sort((a, b) => a.startAt - b.startAt);

            for (const clip of layers) {
              drawMediaClip(
                ctx,
                canvas,
                clip,
                videoElementsRef.current[clip.id],
                imageCacheRef.current[clip.fileUrl],
              );
            }
          }

          proj.tracks
            .filter((tr) => tr.type === 'text' && !tr.hidden)
            .forEach((track) => {
              track.clips.forEach((clip) => {
                if (ph < clip.startAt || ph >= clip.startAt + clip.duration) {
                  return;
                }
                const textClip = clip as TextClip;
                const style = textClip.style;
                const fontSize = style.fontSize || 40;
                const fontFamily = style.fontFamily || 'Roboto';

                ctx.save();
                ctx.font = `bold ${fontSize}px ${fontFamily}, sans-serif`;
                ctx.textAlign = style.textAlign || 'center';

                const textMetrics = ctx.measureText(textClip.content);
                const textWidth = textMetrics.width;
                const padding = style.padding ?? 12;
                const textHeight = fontSize * 1.2;
                const x = canvas.width / 2 + (textClip.transform?.x ?? 0);
                const y = canvas.height / 2 + (textClip.transform?.y ?? 0);

                if (
                  style.backgroundColor &&
                  style.backgroundColor !== 'transparent'
                ) {
                  ctx.fillStyle = style.backgroundColor;
                  const boxX = x - textWidth / 2 - padding;
                  const boxY = y - fontSize + padding / 2;
                  const radius = style.borderRadius ?? 8;
                  ctx.beginPath();
                  ctx.roundRect(
                    boxX,
                    boxY,
                    textWidth + padding * 2,
                    textHeight + padding,
                    radius,
                  );
                  ctx.fill();
                }

                if (style.shadowColor) {
                  ctx.shadowColor = style.shadowColor;
                  ctx.shadowBlur = style.shadowBlur ?? 10;
                }
                if (style.strokeColor && style.strokeWidth) {
                  ctx.strokeStyle = style.strokeColor;
                  ctx.lineWidth = style.strokeWidth;
                  ctx.strokeText(textClip.content, x, y);
                }
                ctx.fillStyle = style.color || '#ffffff';
                ctx.fillText(textClip.content, x, y);
                ctx.restore();
              });
            });
        }
      }
      animationId = requestAnimationFrame(render);
    };
    render();
    return () => cancelAnimationFrame(animationId);
  }, []);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (isPlaying) {
      let lastTime = performance.now();
      interval = setInterval(() => {
        const now = performance.now();
        const delta = (now - lastTime) / 1000;
        lastTime = now;
        const currentPlayhead = useStudioStore.getState().playhead;
        const proj = useStudioStore.getState().project;
        if (proj && currentPlayhead + delta >= proj.duration) {
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
        data-studio-preview
        className={`h-full max-h-full w-auto ${aspectClass} rounded-2xl overflow-hidden shadow-2xl ring-1 ring-white/10 bg-surface-base relative flex items-center justify-center`}
      >
        {!hasClips && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-white/40 pointer-events-none z-10 bg-black/60 p-4 text-center">
            <p className="text-sm font-semibold text-white/80">
              {t('studio.timeline.empty')}
            </p>
            <p className="text-xs text-white/40 mt-1">
              {t('studio.select_clip_hint')}
            </p>
          </div>
        )}
        <canvas
          ref={canvasRef}
          width={dims.width}
          height={dims.height}
          className="w-full h-full object-contain"
        />
      </div>
    </div>
  );
}
