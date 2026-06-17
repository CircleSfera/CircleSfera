import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';
import type { VideoData } from '../components/PhotoEditor';

let ffmpeg: FFmpeg | null = null;

export async function initFFmpeg(): Promise<FFmpeg> {
  if (ffmpeg) return ffmpeg;
  ffmpeg = new FFmpeg();

  // By default it uses unpkg CDN for core and wasm, which is fine for modern browsers.
  // If we wanted to self-host, we would pass coreURL and wasmURL here.
  await ffmpeg.load({
    coreURL: 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.js',
    wasmURL: 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.wasm',
  });

  return ffmpeg;
}

export async function exportEditedVideo(
  file: File,
  filterString: string,
  videoData?: VideoData,
  overlayDataUrl?: string,
): Promise<File> {
  const ff = await initFFmpeg();

  // 1. Write the input file
  await ff.writeFile('input.mp4', await fetchFile(file));

  // 2. Parse tailwind filters to FFmpeg eq filters
  // Format is like "filter-class:Gingham__style:brightness(105%) contrast(90%)__temp:120__vignette:50__noise:20"
  let inlineStyle = '';
  let temperature = 100;
  let vignette = 0;
  let noise = 0;

  const parts = filterString.split('__style:');
  if (parts.length > 1) {
    const subparts = parts[1].split('__temp:');
    inlineStyle = subparts[0];
    if (subparts.length > 1) {
      const tempParts = subparts[1].split('__vignette:');
      temperature = Number(tempParts[0]);
      if (tempParts.length > 1) {
        const vigParts = tempParts[1].split('__noise:');
        vignette = Number(vigParts[0]);
        if (vigParts.length > 1) noise = Number(vigParts[1]);
      }
    }
  }

  const vfFilters: string[] = [];

  // Extract values using regex
  const getVal = (name: string, def: number) => {
    const match = new RegExp(`${name}\\((\\d+)%\\)`).exec(inlineStyle);
    return match ? Number(match[1]) : def;
  };

  const brightness = getVal('brightness', 100);
  const contrast = getVal('contrast', 100);
  const saturation = getVal('saturate', 100);
  const grayscale = getVal('grayscale', 0);

  // FFmpeg eq filter values:
  // brightness: -1.0 to 1.0 (default 0)
  // contrast: -2.0 to 2.0 (default 1)
  // saturation: 0.0 to 3.0 (default 1)
  const ffBrightness = (brightness - 100) / 100;
  const ffContrast = contrast / 100;
  let ffSaturation = saturation / 100;

  if (grayscale > 50) ffSaturation = 0;

  if (ffBrightness !== 0 || ffContrast !== 1 || ffSaturation !== 1) {
    vfFilters.push(
      `eq=brightness=${ffBrightness}:contrast=${ffContrast}:saturation=${ffSaturation}`,
    );
  }

  // Temperature
  if (temperature !== 100) {
    const tempOffset = (temperature - 100) / 100; // -1 to 1
    // Warm: more red, less blue. Cool: less red, more blue.
    vfFilters.push(`colorbalance=rm=${tempOffset}:bm=${-tempOffset}`);
  }

  // Vignette
  if (vignette > 0) {
    vfFilters.push(`vignette=PI/4`);
  }

  // Noise
  if (noise > 0) {
    vfFilters.push(`noise=c0s=${Math.floor(noise / 2)}:allf=t`);
  }

  const args: string[] = [];

  // Trimming
  if (videoData && videoData.startTime !== undefined) {
    args.push('-ss', videoData.startTime.toString());
  }
  if (videoData && videoData.endTime !== undefined && videoData.endTime > 0) {
    args.push('-to', videoData.endTime.toString());
  }

  args.push('-i', 'input.mp4');

  let hasOverlay = false;
  if (overlayDataUrl) {
    hasOverlay = true;
    await ff.writeFile('overlay.png', await fetchFile(overlayDataUrl));
    args.push('-i', 'overlay.png');
  }

  // Audio handling
  if (videoData?.muted) {
    args.push('-an');
  } else {
    args.push('-c:a', 'aac'); // re-encode audio to be safe
  }

  // Filter complex
  if (hasOverlay) {
    const baseFilter = vfFilters.length > 0 ? vfFilters.join(',') : 'copy';
    if (baseFilter === 'copy') {
      args.push('-filter_complex', '[0:v][1:v]overlay=0:0[outv]');
    } else {
      args.push(
        '-filter_complex',
        `[0:v]${baseFilter}[bg];[bg][1:v]overlay=0:0[outv]`,
      );
    }
    args.push('-map', '[outv]');
    if (!videoData?.muted) {
      args.push('-map', '0:a?');
    }
  } else {
    if (vfFilters.length > 0) {
      args.push('-vf', vfFilters.join(','));
    }
  }

  // Codec
  args.push('-c:v', 'libx264');
  args.push('-preset', 'fast');
  args.push('output.mp4');

  await ff.exec(args);

  const data = await ff.readFile('output.mp4');
  return new File(
    [data as any],
    `edited_${file.name.replace(/\.[^/.]+$/, '')}.mp4`,
    {
      type: 'video/mp4',
      lastModified: Date.now(),
    },
  );
}
