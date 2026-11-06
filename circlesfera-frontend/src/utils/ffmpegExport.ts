import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import type { MediaClip, StudioProject, TextClip } from '../types/studio';
import {
  duckFilter,
  ducksUnderVoice,
  fadeFilters,
  voiceSpans,
} from './studioAudio';
import { vignetteMaskPng } from './studioCanvasFx';
import {
  activeColor,
  colorFilterAfter,
  colorFilterBefore,
  effectAmounts,
  effectClipsOf,
  effectFilter,
} from './studioEffects';
import {
  audioClipsOnTracks,
  cssColorToFfmpeg,
  cssFilterToFfmpeg,
  escapeDrawText,
  type FfmpegEncodePreset,
  isConstrainedDevice,
  resolveStudioFontFile,
  StudioExportError,
  scaleResolutionForExport,
  textClipsOnTracks,
  visualClipsOnVideoTracks,
} from './studioExportHelpers';
import { projectContentEnd } from './studioProject';
import { mainClips, mainTrackOf } from './studioTimeline';
import { transitionOf, withCutFades, XFADE_OF } from './studioTransitions';

// Same-origin core copied by vite plugin into public/ffmpeg
const FFMPEG_BASE = '/ffmpeg';

type PreparedVisual = {
  clip: MediaClip;
  inputIndex: number;
  isImage: boolean;
};

export type ExportStudioOptions = {
  onProgress?: (progress: number) => void;
  signal?: AbortSignal;
  preset?: FfmpegEncodePreset;
  // Force long-edge cap (default: 720 on constrained devices).
  maxLongEdge?: number;
};

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new StudioExportError('studio.export_errors.cancelled');
  }
}

/** Reject when `signal` aborts even if `promise` never settles (hung wasm fetch). */
function awaitUnlessAborted<T>(
  promise: Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  if (!signal) return promise;
  throwIfAborted(signal);
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      reject(new StudioExportError('studio.export_errors.cancelled'));
    };
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (err) => {
        signal.removeEventListener('abort', onAbort);
        reject(err);
      },
    );
  });
}

// Export a Studio project to MP4 honouring timeline placement, images,
// Mute/volume, basic transforms/filters, and text overlays.
export async function exportStudioProject(
  project: StudioProject,
  onProgressOrOptions?: ((progress: number) => void) | ExportStudioOptions,
): Promise<File> {
  const options: ExportStudioOptions =
    typeof onProgressOrOptions === 'function'
      ? { onProgress: onProgressOrOptions }
      : onProgressOrOptions || {};
  const { onProgress, signal, preset = 'ultrafast', maxLongEdge } = options;

  const visualClips = visualClipsOnVideoTracks(project);
  if (visualClips.length === 0) {
    throw new StudioExportError('studio.export_errors.no_clips');
  }

  throwIfAborted(signal);

  const ffmpeg = new FFmpeg();
  const onAbort = () => {
    try {
      ffmpeg.terminate();
    } catch {
      // Ignore
    }
  };
  if (signal) {
    if (signal.aborted) {
      throw new StudioExportError('studio.export_errors.cancelled');
    }
    signal.addEventListener('abort', onAbort, { once: true });
  }

  if (onProgress) {
    ffmpeg.on('progress', ({ progress }) => {
      onProgress(Math.min(100, Math.max(0, progress * 100)));
    });
  }

  try {
    try {
      const coreURL = await awaitUnlessAborted(
        toBlobURL(`${FFMPEG_BASE}/ffmpeg-core.js`, 'text/javascript'),
        signal,
      );
      const wasmURL = await awaitUnlessAborted(
        toBlobURL(`${FFMPEG_BASE}/ffmpeg-core.wasm`, 'application/wasm'),
        signal,
      );
      throwIfAborted(signal);
      await awaitUnlessAborted(ffmpeg.load({ coreURL, wasmURL }), signal);
    } catch (err) {
      if (err instanceof StudioExportError) throw err;
      if (signal?.aborted) {
        throw new StudioExportError('studio.export_errors.cancelled');
      }
      throw new StudioExportError('studio.export_errors.load_failed');
    }

    const fontFaces = [
      resolveStudioFontFile('Roboto', false),
      resolveStudioFontFile('Roboto', true),
    ];
    for (const face of fontFaces) {
      try {
        await ffmpeg.writeFile(
          face.ffmpegFileName,
          await fetchFile(face.publicPath),
        );
      } catch {
        // Drawtext may still work without custom font on some builds
      }
    }

    throwIfAborted(signal);

    const constrained = isConstrainedDevice();
    const edgeCap =
      maxLongEdge ??
      (constrained
        ? 720
        : Math.max(project.resolution.width, project.resolution.height));
    const scaled = scaleResolutionForExport(
      project.resolution.width,
      project.resolution.height,
      edgeCap,
    );
    const w = scaled.width;
    const h = scaled.height;
    // The video ends with its last clip. The length kept by the project is
    // the one of its timeline, which is never shorter than a few seconds.
    const contentEnd = projectContentEnd(project, { visibleOnly: true });
    const duration = Math.max(
      contentEnd > 0 ? contentEnd : project.duration,
      1,
    );
    const fps = project.fps || 30;

    const cliInputs: string[] = [];
    const prepared: PreparedVisual[] = [];
    let inputIndex = 0;

    for (const clip of visualClips) {
      throwIfAborted(signal);
      const isImage = clip.type === 'image';
      const fileName = `in_${inputIndex}.${isImage ? 'img' : 'mp4'}`;
      const fileData = clip.file
        ? await fetchFile(clip.file)
        : await fetchFile(clip.fileUrl);
      await ffmpeg.writeFile(fileName, fileData);
      if (isImage) {
        cliInputs.push(
          '-loop',
          '1',
          '-t',
          String(Math.max(clip.duration, 0.1)),
          '-i',
          fileName,
        );
      } else {
        cliInputs.push('-i', fileName);
      }
      prepared.push({ clip, inputIndex, isImage });
      inputIndex++;
    }

    const audioTrackClips = audioClipsOnTracks(project);
    const audioInputIndexes: { clip: MediaClip; inputIndex: number }[] = [];
    for (const clip of audioTrackClips) {
      throwIfAborted(signal);
      const fileName = `in_a_${inputIndex}.bin`;
      const fileData = clip.file
        ? await fetchFile(clip.file)
        : await fetchFile(clip.fileUrl);
      await ffmpeg.writeFile(fileName, fileData);
      cliInputs.push('-i', fileName);
      audioInputIndexes.push({ clip, inputIndex });
      inputIndex++;
    }

    // A vignette is laid over the picture as a mask drawn the way the
    // preview draws it.
    const effects = effectClipsOf(project);
    const maskInputs = new Map<string, number>();
    for (const fx of effects) {
      if (fx.effect !== 'vignette') continue;
      throwIfAborted(signal);
      const { dark } = effectAmounts('vignette', fx.intensity, w) as {
        dark: number;
      };
      const fileName = `fx_mask_${inputIndex}.png`;
      await ffmpeg.writeFile(fileName, await vignetteMaskPng(w, h, dark));
      cliInputs.push('-loop', '1', '-t', String(duration), '-i', fileName);
      maskInputs.set(fx.id, inputIndex);
      inputIndex++;
    }

    // The clips of the main track join one after another, through their
    // transitions, when any of them has one.
    const main = mainTrackOf(project);
    const ordered = main && !main.hidden ? mainClips(project) : [];
    const joined = ordered.some(
      (c, i) => i < ordered.length - 1 && transitionOf(c),
    );
    const mainIds = new Set(joined ? ordered.map((c) => c.id) : []);

    const buildFilter = (includeVideoAudio: boolean): string => {
      const parts: string[] = [];
      parts.push(`color=c=black:s=${w}x${h}:d=${duration}:r=${fps}[basev]`);
      parts.push(
        `anullsrc=r=44100:cl=stereo,atrim=0:${duration},asetpts=PTS-STARTPTS[basea]`,
      );

      let currentVideo = joined ? 'mainv' : 'basev';
      const mixLabels = ['[basea]'];
      let mixCount = 0;
      // Under a voice, the rest of the sound drops, unless the project
      // turns that off; voices themselves never drop.
      const duck = ducksUnderVoice(project)
        ? duckFilter(voiceSpans(project))
        : null;
      const voiceClipIds = new Set(
        project.tracks
          .filter((t) => t.type === 'voice')
          .flatMap((t) => t.clips.map((c) => c.id)),
      );

      for (const { clip, inputIndex: idx, isImage } of prepared) {
        const speed = clip.speed ?? 1;
        const opacity = clip.opacity ?? 1;
        const scale = clip.transform?.scale ?? 1;
        const rot = clip.transform?.rotation ?? 0;
        const tx = clip.transform?.x ?? 0;
        const ty = clip.transform?.y ?? 0;
        const cssFx = cssFilterToFfmpeg(clip.filter || '');
        const color = activeColor(clip.color);
        const filterShare =
          Math.max(0, Math.min(100, clip.filterIntensity ?? 100)) / 100;

        const vChain: string[] = [];
        if (isImage) {
          vChain.push(
            `fps=${fps}`,
            `trim=duration=${clip.duration}`,
            'setpts=PTS-STARTPTS',
          );
        } else {
          vChain.push(
            `trim=start=${clip.mediaStart}:duration=${clip.duration * speed}`,
            'setpts=PTS-STARTPTS',
          );
          if (speed !== 1) vChain.push(`setpts=${1 / speed}*PTS`);
        }
        vChain.push(
          `scale=${Math.round(w * scale)}:${Math.round(h * scale)}:force_original_aspect_ratio=decrease`,
        );
        if (clip.flipX) vChain.push('hflip');
        if (clip.flipY) vChain.push('vflip');
        if (rot !== 0) {
          vChain.push(`rotate=${rot}*PI/180:c=none:ow=rotw(iw):oh=roth(ih)`);
        }
        // The order the preview draws in: the adjustments its CSS filter
        // makes, the colour filter, then lift, warmth and sharpening.
        if (color) {
          const before = colorFilterBefore(color, w);
          if (before) vChain.push(before);
        }
        if (cssFx && filterShare >= 1) vChain.push(cssFx);
        else if (cssFx && filterShare > 0) {
          // Part of the filter: the filtered picture over the plain one.
          vChain.push(
            `format=rgba,split[f${idx}a][f${idx}b];[f${idx}b]${cssFx},format=rgba[f${idx}c];[f${idx}a][f${idx}c]blend=all_mode=normal:all_opacity=${filterShare}`,
          );
        }
        if (color) {
          const after = colorFilterAfter(color, `c${idx}`);
          if (after) vChain.push(after);
        }
        if (opacity < 1) {
          vChain.push('format=rgba', `colorchannelmixer=aa=${opacity}`);
        }
        vChain.push(`fps=${fps}`);
        // The clip's first frame belongs where it starts on the timeline:
        // the overlay matches frames by time, so a clip left at 0 would show
        // the wrong moment of itself, or its last frame held.
        if (clip.startAt > 0) vChain.push(`setpts=PTS+${clip.startAt}/TB`);

        const seg = `seg${idx}`;
        parts.push(`[${idx}:v]${vChain.join(',')}[${seg}]`);
        if (mainIds.has(clip.id)) {
          // Laid on black the size of the video, as long as the clip, to be
          // joined to the others.
          parts.push(
            `color=c=black:s=${w}x${h}:r=${fps}:d=${clip.duration}[bg${idx}]`,
            `[bg${idx}][${seg}]overlay=x=(W-w)/2+${tx}:y=(H-h)/2+${ty},format=yuv420p,setsar=1,fps=${fps},settb=AVTB[m${idx}]`,
          );
        } else {
          const next = `ov${idx}`;
          const enable = `between(t\\,${clip.startAt}\\,${clip.startAt + clip.duration})`;
          parts.push(
            `[${currentVideo}][${seg}]overlay=x=(W-w)/2+${tx}:y=(H-h)/2+${ty}:enable='${enable}'[${next}]`,
          );
          currentVideo = next;
        }

        if (
          includeVideoAudio &&
          !isImage &&
          !clip.muted &&
          (clip.volume ?? 1) > 0
        ) {
          const aLabel = `va${mixCount++}`;
          parts.push(
            `[${idx}:a]${buildAudioChain(withCutFades(ordered, clip), duck)}[${aLabel}]`,
          );
          mixLabels.push(`[${aLabel}]`);
        }
      }

      for (const { clip, inputIndex: idx } of audioInputIndexes) {
        const aLabel = `aa${mixCount++}`;
        const isVoice = voiceClipIds.has(clip.id);
        parts.push(
          `[${idx}:a]${buildAudioChain(clip, isVoice ? null : duck)}[${aLabel}]`,
        );
        mixLabels.push(`[${aLabel}]`);
      }

      if (joined) {
        const byId = new Map(prepared.map((p) => [p.clip.id, p.inputIndex]));
        let chain = `m${byId.get(ordered[0].id)}`;
        ordered.slice(1).forEach((clip, i) => {
          const before = transitionOf(ordered[i]);
          const next = `j${i}`;
          const into = `[${chain}][m${byId.get(clip.id)}]`;
          parts.push(
            before
              ? `${into}xfade=transition=${XFADE_OF[before.kind]}:duration=${before.duration}:offset=${clip.startAt}[${next}]`
              : `${into}concat=n=2:v=1:a=0[${next}]`,
          );
          chain = next;
        });
        // The joined clips go under the layers, from the start.
        parts.push(`[basev][${chain}]overlay=eof_action=pass[mainv]`);
      }

      // Effects change the picture for their stretch; the texts drawn after
      // them are never changed.
      effects.forEach((fx, i) => {
        const start = fx.startAt;
        const end = fx.startAt + fx.duration;
        const mask = maskInputs.get(fx.id);
        const next = `fx${i}`;
        parts.push(
          `[${currentVideo}]split[fx${i}a][fx${i}b]`,
          `[fx${i}b]trim=start=${start}:end=${end},setpts=PTS-STARTPTS,${effectFilter(fx, w, h, `e${i}`, mask === undefined ? undefined : `${mask}:v`, fps)},format=yuv420p,setpts=PTS+${start}/TB[fx${i}c]`,
          `[fx${i}a][fx${i}c]overlay=eof_action=pass:enable='between(t\\,${start}\\,${end})'[${next}]`,
        );
        currentVideo = next;
      });

      let videoOut = currentVideo;
      textClipsOnTracks(project).forEach((tClip, i) => {
        const prev = videoOut;
        videoOut = `txt${i}`;
        parts.push(buildDrawTextFilter(prev, videoOut, tClip, w));
      });

      if (mixLabels.length === 1) {
        parts.push('[basea]anull[outa]');
      } else {
        parts.push(
          `${mixLabels.join('')}amix=inputs=${mixLabels.length}:duration=longest:dropout_transition=0[outa]`,
        );
      }

      parts.push(`[${videoOut}]null[outv]`);
      return parts.join(';');
    };

    const outputFileName = 'output.mp4';
    const run = async (filter: string) => {
      throwIfAborted(signal);
      await ffmpeg.exec([
        ...cliInputs,
        '-filter_complex',
        filter,
        '-map',
        '[outv]',
        '-map',
        '[outa]',
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        '-preset',
        preset,
        '-c:a',
        'aac',
        '-t',
        String(duration),
        outputFileName,
      ]);
    };

    try {
      try {
        await run(buildFilter(true));
      } catch (err) {
        if (signal?.aborted || err instanceof StudioExportError) throw err;
        await run(buildFilter(false));
      }
    } catch (err) {
      if (err instanceof StudioExportError) throw err;
      if (signal?.aborted) {
        throw new StudioExportError('studio.export_errors.cancelled');
      }
      throw new StudioExportError('studio.export_errors.encode_failed');
    }

    throwIfAborted(signal);
    const fileData = await ffmpeg.readFile(outputFileName);
    const blob = new Blob([fileData as BlobPart], { type: 'video/mp4' });
    return new File([blob], 'exported_studio.mp4', { type: 'video/mp4' });
  } finally {
    signal?.removeEventListener('abort', onAbort);
  }
}

/**
 * The sound of one clip, on the project's timeline: its stretch of the
 * file, its speed, volume and fades, moved to where it starts, and lowered
 * under the voices when it is not a voice itself.
 */
export function buildAudioChain(
  clip: MediaClip,
  duck: string | null = null,
): string {
  const speed = clip.speed ?? 1;
  const parts = [
    `atrim=start=${clip.mediaStart}:duration=${clip.duration * speed}`,
    'asetpts=PTS-STARTPTS',
  ];
  if (speed !== 1) {
    parts.push(`atempo=${Math.min(2, Math.max(0.5, speed))}`);
  }
  const vol = clip.muted ? 0 : (clip.volume ?? 1);
  if (vol !== 1) parts.push(`volume=${vol}`);
  parts.push(...fadeFilters(clip));
  const delayMs = Math.round(clip.startAt * 1000);
  parts.push(`adelay=${delayMs}|${delayMs}`);
  if (duck) parts.push(duck);
  return parts.join(',');
}

export function buildDrawTextFilter(
  prevNode: string,
  outNode: string,
  tClip: TextClip,
  canvasWidth: number,
): string {
  const textStr = escapeDrawText(tClip.content);
  const fontSize = tClip.style.fontSize || 32;
  const color = cssColorToFfmpeg(tClip.style.color || '#ffffff');
  const tx = tClip.transform?.x ?? 0;
  const ty = tClip.transform?.y ?? 0;
  const align = tClip.style.textAlign || 'center';
  const font = resolveStudioFontFile(tClip.style.fontFamily, true);

  let xExpr = `(w-text_w)/2+${tx}`;
  if (align === 'left') xExpr = `${Math.round(canvasWidth / 2)}+${tx}`;
  if (align === 'right') xExpr = `(w-text_w)/2+${tx}`;

  const yExpr = `(h-text_h)/2+${ty}`;
  const enable = `between(t\\,${tClip.startAt}\\,${tClip.startAt + tClip.duration})`;

  const hasBox =
    tClip.style.backgroundColor &&
    tClip.style.backgroundColor !== 'transparent' &&
    tClip.style.backgroundColor !== 'rgba(0,0,0,0)';
  const box = hasBox
    ? `:box=1:boxcolor=${cssColorToFfmpeg(tClip.style.backgroundColor!)}:boxborderw=${tClip.style.padding ?? 8}`
    : '';

  const stroke =
    tClip.style.strokeColor && tClip.style.strokeWidth
      ? `:borderw=${tClip.style.strokeWidth}:bordercolor=${cssColorToFfmpeg(tClip.style.strokeColor)}`
      : '';

  const shadow = tClip.style.shadowColor
    ? `:shadowx=2:shadowy=2:shadowcolor=${cssColorToFfmpeg(tClip.style.shadowColor)}`
    : '';

  return `[${prevNode}]drawtext=fontfile=${font.ffmpegFileName}:text='${textStr}':fontsize=${fontSize}:fontcolor=${color}:x=${xExpr}:y=${yExpr}${box}${stroke}${shadow}:enable='${enable}'[${outNode}]`;
}
