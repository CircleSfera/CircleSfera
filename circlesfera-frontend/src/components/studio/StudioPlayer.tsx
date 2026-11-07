import { type MouseEvent, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useStudioStore } from '../../stores/studioStore';
import type {
  AspectRatioType,
  EffectClip,
  MediaClip,
  StudioProject,
  TextClip,
} from '../../types/studio';
import { clipGainAt, isSoundTrack } from '../../utils/studioAudio';
import {
  drawEffect,
  drawTransition,
  keyPicture,
  liftPicture,
  scratchCanvas,
  sharpenPicture,
  warmPicture,
} from '../../utils/studioCanvasFx';
import {
  activeColor,
  colorAmounts,
  colorCssFilter,
  EFFECT_BASE_WIDTH,
  effectClipsOf,
} from '../../utils/studioEffects';
import {
  containRect,
  resolutionForAspect,
} from '../../utils/studioExportHelpers';
import { SOFTEN_PX } from '../../utils/studioKeyframeExport';
import { clipAt } from '../../utils/studioKeyframes';
import {
  chromaAmounts,
  compositeOf,
  DEFAULT_CHROMA_SOFTNESS,
  DEFAULT_CHROMA_STRENGTH,
  hexOf,
  needsOwnPicture,
  rgbOf,
  shapePath,
} from '../../utils/studioOverlay';
import { locateClip, mainTrackOf } from '../../utils/studioTimeline';
import {
  transitionOf,
  transitionProgress,
} from '../../utils/studioTransitions';

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
  const color = activeColor(clip.color);
  const colorCss = color ? colorCssFilter(color) : '';
  const share = Math.max(0, Math.min(100, clip.filterIntensity ?? 100)) / 100;
  const filtered = Boolean(clip.filter) && share > 0;
  const opacity = typeof clip.opacity === 'number' ? clip.opacity : 1;
  // A filter at part of its intensity is drawn over the plain picture.
  const full = filtered && share >= 1;
  const css = [colorCss, full ? clip.filter : ''].filter(Boolean).join(' ');
  if (css) ctx.filter = css;
  ctx.globalAlpha = opacity;

  const scale = clip.transform?.scale ?? 1;
  const rot = ((clip.transform?.rotation ?? 0) * Math.PI) / 180;
  const tx = clip.transform?.x ?? 0;
  const ty = clip.transform?.y ?? 0;

  ctx.translate(canvas.width / 2 + tx, canvas.height / 2 + ty);
  ctx.rotate(rot);
  // A shape cuts the clip as it is placed and turned, never mirrored.
  if (clip.shape && clip.shape !== 'none') {
    shapePath(ctx, clip.shape, fit.w * scale, fit.h * scale);
    ctx.clip();
  }
  ctx.scale((clip.flipX ? -1 : 1) * scale, (clip.flipY ? -1 : 1) * scale);
  ctx.drawImage(source, -fit.w / 2, -fit.h / 2, fit.w, fit.h);
  if (filtered && !full) {
    ctx.filter = [colorCss, clip.filter].filter(Boolean).join(' ');
    ctx.globalAlpha = opacity * share;
    ctx.drawImage(source, -fit.w / 2, -fit.h / 2, fit.w, fit.h);
  }
  // Softening: the picture blurred, laid over it by how soft it is, as the
  // export blends the two.
  const soften = color ? colorAmounts(color).soften : 0;
  if (soften > 0) {
    const blur = `blur(${(SOFTEN_PX * canvas.width) / EFFECT_BASE_WIDTH}px)`;
    ctx.filter = [colorCss, full ? clip.filter : '', blur]
      .filter(Boolean)
      .join(' ');
    ctx.globalAlpha = opacity * soften;
    ctx.drawImage(source, -fit.w / 2, -fit.h / 2, fit.w, fit.h);
  }
  ctx.restore();
}

type Scratch = { current: HTMLCanvasElement | null };

/**
 * Draws a clip as the export does: on a picture of its own, warmed and
 * sharpened there, then onto the canvas. Sharpening reads every pixel, so
 * it shows on a still frame only.
 */
function drawPicture(
  target: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  clip: MediaClip,
  sources: {
    video: HTMLVideoElement | undefined;
    image: HTMLImageElement | undefined;
  },
  scratch: { picture: Scratch; copy: Scratch; sharp: SharpCache },
  still: boolean,
  at: number,
  picking = false,
) {
  const color = activeColor(clip.color);
  const amounts = color ? colorAmounts(color) : null;
  const own = needsOwnPicture(clip);
  if (
    !own &&
    (!amounts ||
      (amounts.lift === 0 &&
        amounts.warmth === 0 &&
        (amounts.sharpen === 0 || !still)))
  ) {
    drawMediaClip(target, canvas, clip, sources.video, sources.image);
    return;
  }
  // A green screen and a blend need the clip's own picture every frame.
  if (own) {
    const picture = scratchCanvas(scratch.picture, canvas.width, canvas.height);
    const pctx = picture.getContext('2d');
    if (!pctx) return;
    pctx.clearRect(0, 0, picture.width, picture.height);
    drawMediaClip(pctx, picture, clip, sources.video, sources.image);
    const copy = scratchCanvas(scratch.copy, canvas.width, canvas.height);
    if (amounts) {
      liftPicture(picture, copy, amounts.lift);
      warmPicture(picture, copy, amounts.warmth);
    }
    // While its colour is being picked, the clip shows with it.
    if (clip.chroma && !picking) {
      keyPicture(
        picture,
        clipBox(canvas, clip, sources),
        rgbOf(clip.chroma.color),
        chromaAmounts(clip.chroma),
      );
    }
    target.save();
    target.globalCompositeOperation = compositeOf(clip.blend);
    target.drawImage(picture, 0, 0);
    target.restore();
    return;
  }
  if (!amounts) return;
  // A still frame is sharpened once, not on every redraw while it stays,
  // and only once its picture is there: a video still seeking or a photo
  // still loading is drawn without it, and sharpened when it settles.
  const source = clip.type === 'video' ? sources.video : sources.image;
  const settled =
    source instanceof HTMLVideoElement
      ? !source.seeking && source.readyState >= 2
      : Boolean(source?.complete && source.naturalWidth > 0);
  const sharpen = still && settled && amounts.sharpen > 0;
  if (still && !settled && amounts.lift === 0 && amounts.warmth === 0) {
    drawMediaClip(target, canvas, clip, sources.video, sources.image);
    return;
  }
  const key = sharpen
    ? `${clip.id}|${at}|${JSON.stringify(clip)}|${canvas.width}`
    : '';
  const cached = scratch.sharp.get(key);
  if (cached) {
    target.drawImage(cached, 0, 0);
    return;
  }
  const picture = sharpen
    ? document.createElement('canvas')
    : scratchCanvas(scratch.picture, canvas.width, canvas.height);
  picture.width = canvas.width;
  picture.height = canvas.height;
  const pctx = picture.getContext('2d');
  if (!pctx) return;
  pctx.clearRect(0, 0, picture.width, picture.height);
  drawMediaClip(pctx, picture, clip, sources.video, sources.image);
  const copy = scratchCanvas(scratch.copy, canvas.width, canvas.height);
  liftPicture(picture, copy, amounts.lift);
  warmPicture(picture, copy, amounts.warmth);
  if (sharpen) {
    sharpenPicture(picture, amounts.sharpen);
    scratch.sharp.set(key, picture);
  }
  target.drawImage(picture, 0, 0);
}

/**
 * The stretch of the canvas a clip can cover, however it is turned: a
 * square around its centre as wide as its picture's diagonal.
 */
function clipBox(
  canvas: HTMLCanvasElement,
  clip: MediaClip,
  sources: {
    video: HTMLVideoElement | undefined;
    image: HTMLImageElement | undefined;
  },
) {
  const source = clip.type === 'video' ? sources.video : sources.image;
  const srcW =
    source instanceof HTMLVideoElement
      ? source.videoWidth
      : (source?.naturalWidth ?? 0);
  const srcH =
    source instanceof HTMLVideoElement
      ? source.videoHeight
      : (source?.naturalHeight ?? 0);
  const fit = containRect(srcW || 1, srcH || 1, canvas.width, canvas.height);
  const scale = clip.transform?.scale ?? 1;
  const half = (Math.hypot(fit.w, fit.h) * scale) / 2;
  const cx = canvas.width / 2 + (clip.transform?.x ?? 0);
  const cy = canvas.height / 2 + (clip.transform?.y ?? 0);
  return { x: cx - half, y: cy - half, w: half * 2, h: half * 2 };
}

/** The sharpened still frames, the last few kept. */
class SharpCache {
  private readonly frames = new Map<string, HTMLCanvasElement>();
  get(key: string) {
    return key ? this.frames.get(key) : undefined;
  }
  set(key: string, frame: HTMLCanvasElement) {
    this.frames.set(key, frame);
    // Two clips of a transition can be still at once; keep a few.
    while (this.frames.size > 4) {
      const oldest = this.frames.keys().next().value as string;
      this.frames.delete(oldest);
    }
  }
}

export default function StudioPlayer() {
  const { t } = useTranslation();
  const { project, playhead, isPlaying, setPlayhead, isRecordingVoice } =
    useStudioStore();
  const pickingColor = useStudioStore((s) => s.pickingColor);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioElementsRef = useRef<Record<string, HTMLAudioElement>>({});
  const videoElementsRef = useRef<Record<string, HTMLVideoElement>>({});
  const imageCacheRef = useRef<Record<string, HTMLImageElement>>({});
  // Canvases kept to draw transitions, adjustments and effects on.
  const scratchRef = useRef({
    picture: { current: null } as Scratch,
    copy: { current: null } as Scratch,
    from: { current: null } as Scratch,
    to: { current: null } as Scratch,
    effect: { current: null } as Scratch,
    sharp: new SharpCache(),
  });

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
          // Read like the thumbnails are, so the preview can work on its
          // pixels (sharpening) without the canvas being shut to it.
          videoEl.crossOrigin = 'anonymous';
          videoEl.src = clip.fileUrl;
          videoEl.style.display = 'none';
          document.body.appendChild(videoEl);
          videoElementsRef.current[clip.id] = videoEl;
        }

        const parentTrack = videoTracks.find((tr) =>
          tr.clips.some((c) => c.id === clip.id),
        );
        // Silent while a voice is recorded, so the microphone hears only it.
        videoEl.muted =
          Boolean(clip.muted) ||
          Boolean(parentTrack?.muted) ||
          isRecordingVoice;
        // Its volume, its fades and the drop under a voice, as exported.
        videoEl.volume = Math.max(
          0,
          Math.min(1, clipGainAt(project, clip, playhead, false)),
        );
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
          img.crossOrigin = 'anonymous';
          img.src = clip.fileUrl;
          imageCacheRef.current[clip.fileUrl] = img;
        }
      }
    }

    Object.entries(videoElementsRef.current).forEach(([id, el]) => {
      if (!activeVideoIds.has(id) && !el.paused) el.pause();
    });

    const soundTracks = project.tracks.filter(
      (tr) => isSoundTrack(tr) && !tr.muted,
    );
    const audioClips = soundTracks.flatMap((tr) => tr.clips) as MediaClip[];
    const voiceIds = new Set(
      soundTracks
        .filter((tr) => tr.type === 'voice')
        .flatMap((tr) => tr.clips.map((c) => c.id)),
    );

    const soundingAudioIds = new Set<string>();

    audioClips.forEach((clip) => {
      soundingAudioIds.add(clip.id);
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

      if (overlappingAudio && !clip.muted && !isRecordingVoice) {
        const targetTime =
          clip.mediaStart + (playhead - clip.startAt) * (clip.speed ?? 1);
        if (Math.abs(audioEl.currentTime - targetTime) > 0.2) {
          audioEl.currentTime = targetTime;
        }
        audioEl.volume = Math.max(
          0,
          Math.min(
            1,
            clipGainAt(project, clip, playhead, voiceIds.has(clip.id)),
          ),
        );
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

    // A clip whose track was muted, or that is no longer in the project,
    // is not in the pass above: its sound is stopped here.
    Object.entries(audioElementsRef.current).forEach(([id, el]) => {
      if (!soundingAudioIds.has(id) && !el.paused) el.pause();
    });
  }, [playhead, project, isPlaying, isRecordingVoice]);

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
          const scratch = scratchRef.current;
          const { isPlaying: playingNow, pickingColor } =
            useStudioStore.getState();
          const still = !playingNow;
          const sourcesOf = (clip: MediaClip) => ({
            video: videoElementsRef.current[clip.id],
            image: imageCacheRef.current[clip.fileUrl],
          });
          const main = mainTrackOf(proj);

          for (const track of videoTracks) {
            const layers = track.clips
              .filter(
                (c): c is MediaClip =>
                  isVisualClip(c) &&
                  ph >= c.startAt &&
                  ph < c.startAt + c.duration,
              )
              .slice()
              .sort((a, b) => a.startAt - b.startAt)
              // Each as it is at this moment of itself, keyframes and all.
              .map((c) => clipAt(c, ph - c.startAt));

            // Two clips of the main track at once: a transition between them.
            const [from, to] = layers;
            const transition = track === main ? transitionOf(from) : undefined;
            if (to && transition) {
              const pictures = [from, to].map((clip, i) => {
                const pic = scratchCanvas(
                  i === 0 ? scratch.from : scratch.to,
                  canvas.width,
                  canvas.height,
                );
                const pctx = pic.getContext('2d');
                if (pctx) {
                  pctx.fillStyle = '#000';
                  pctx.fillRect(0, 0, pic.width, pic.height);
                  drawPicture(
                    pctx,
                    pic,
                    clip,
                    sourcesOf(clip),
                    scratch,
                    still,
                    ph,
                    pickingColor,
                  );
                }
                return pic;
              });
              drawTransition(
                ctx,
                pictures[0],
                pictures[1],
                transition.kind,
                transitionProgress(transition, to.startAt, ph),
                canvas.width,
                canvas.height,
              );
              continue;
            }

            for (const clip of layers) {
              drawPicture(
                ctx,
                canvas,
                clip,
                sourcesOf(clip),
                scratch,
                still,
                ph,
                pickingColor,
              );
            }
          }

          // Effects change the picture, never the texts drawn after them.
          const copy = scratchCanvas(
            scratch.effect,
            canvas.width,
            canvas.height,
          );
          for (const fx of effectClipsOf(proj) as EffectClip[]) {
            if (ph < fx.startAt || ph >= fx.startAt + fx.duration) continue;
            drawEffect(canvas, copy, fx, ph - fx.startAt);
          }

          proj.tracks
            .filter((tr) => tr.type === 'text' && !tr.hidden)
            .forEach((track) => {
              track.clips.forEach((clip) => {
                if (ph < clip.startAt || ph >= clip.startAt + clip.duration) {
                  return;
                }
                const textClip = clipAt(clip as TextClip, ph - clip.startAt);
                const style = textClip.style;
                // Its size grows every part of it, as the export does.
                const size = textClip.transform?.scale ?? 1;
                const fontSize = (style.fontSize || 40) * size;
                const fontFamily = style.fontFamily || 'Roboto';

                ctx.save();
                ctx.globalAlpha = style.opacity ?? 1;
                ctx.font = `bold ${fontSize}px ${fontFamily}, sans-serif`;
                ctx.textAlign = style.textAlign || 'center';

                const textMetrics = ctx.measureText(textClip.content);
                const textWidth = textMetrics.width;
                const padding = (style.padding ?? 12) * size;
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
                  ctx.lineWidth = style.strokeWidth * size;
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
        // Stopped at the end a moment ago: the playhead stays at the start.
        if (!useStudioStore.getState().isPlaying) return;
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

  // The eyedropper: the colour under a tap becomes the chosen clip's green
  // screen colour.
  const pickColor = (e: MouseEvent<HTMLCanvasElement>) => {
    const canvas = e.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor(((e.clientX - rect.left) / rect.width) * canvas.width);
    const y = Math.floor(
      ((e.clientY - rect.top) / rect.height) * canvas.height,
    );
    const state = useStudioStore.getState();
    const clip = state.selectedClipId
      ? locateClip(state.project as StudioProject, state.selectedClipId)?.clip
      : null;
    state.setPickingColor(false);
    if (!clip || (clip.type !== 'video' && clip.type !== 'image')) return;
    let pixel: Uint8ClampedArray;
    try {
      pixel =
        canvas.getContext('2d')?.getImageData(x, y, 1, 1).data ??
        new Uint8ClampedArray();
    } catch {
      return;
    }
    if (pixel.length < 3) return;
    const media = clip as MediaClip;
    state.updateClip(
      clip.id,
      {
        chroma: {
          strength: media.chroma?.strength ?? DEFAULT_CHROMA_STRENGTH,
          softness: media.chroma?.softness ?? DEFAULT_CHROMA_SOFTNESS,
          color: hexOf(pixel[0], pixel[1], pixel[2]),
        },
      } as Partial<MediaClip>,
      { history: true },
    );
  };

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
          </div>
        )}
        <canvas
          ref={canvasRef}
          width={dims.width}
          height={dims.height}
          onClick={pickingColor ? pickColor : undefined}
          className={`w-full h-full object-contain ${pickingColor ? 'cursor-crosshair' : ''}`}
        />
        {pickingColor && (
          <p className="pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 rounded-full bg-black/70 px-3 py-1.5 text-xs font-semibold text-white">
            {t('studio.chroma.pick_hint')}
          </p>
        )}
      </div>
    </div>
  );
}
