import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import type { MediaClip, StudioProject } from '../types/studio';

const getFFmpegFilter = (cssFilter: string) => {
  if (cssFilter.includes('grayscale')) {
    return 'colorchannelmixer=.3:.4:.3:0:.3:.4:.3:0:.3:.4:.3';
  }
  if (cssFilter.includes('sepia')) {
    return 'colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131';
  }
  if (cssFilter.includes('invert')) {
    return 'negate';
  }
  return '';
};

export async function exportStudioProject(
  project: StudioProject,
  onProgress?: (progress: number) => void,
): Promise<File> {
  const ffmpeg = new FFmpeg();

  if (onProgress) {
    ffmpeg.on('progress', ({ progress }) => {
      onProgress(progress * 100);
    });
  }

  const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
  await ffmpeg.load({
    coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
    wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
  });

  const inputs: string[] = [];
  const filterStrings: string[] = [];
  let inputIndex = 0;

  const videoTrack = project.tracks.find((t) => t.type === 'video');
  if (!videoTrack || videoTrack.clips.length === 0) {
    throw new Error('No video clips to export.');
  }

  // 1. Process Video Clips sequentially
  for (const c of videoTrack.clips) {
    if (c.type === 'video') {
      const clip = c as MediaClip;
      const fileName = `input_v_${inputIndex}.mp4`;
      const fileData = clip.file
        ? await fetchFile(clip.file)
        : await fetchFile(clip.fileUrl);
      await ffmpeg.writeFile(fileName, fileData);
      inputs.push(`-i`, fileName);

      const speed = clip.speed ?? 1;
      const vol = clip.volume ?? 1;
      const cssFilter = clip.filter || '';

      const vTrim = `trim=start=${clip.mediaStart}:duration=${clip.duration}`;
      const vSpeed = `setpts=${1 / speed}*(PTS-STARTPTS)`;
      const vScale = `scale=${project.resolution.width}:${project.resolution.height}:force_original_aspect_ratio=decrease,pad=${project.resolution.width}:${project.resolution.height}:(ow-iw)/2:(oh-ih)/2`;
      const vFx = getFFmpegFilter(cssFilter);
      const vFilterChain = [vTrim, vSpeed, vScale, vFx, `fps=${project.fps}`]
        .filter(Boolean)
        .join(',');

      filterStrings.push(`[${inputIndex}:v]${vFilterChain}[v${inputIndex}];`);

      const aTrim = `atrim=start=${clip.mediaStart}:duration=${clip.duration},asetpts=PTS-STARTPTS`;
      const aSpeed = speed !== 1 ? `atempo=${speed}` : '';
      const aVol = vol !== 1 ? `volume=${vol}` : '';
      const aFilterChain = [aTrim, aSpeed, aVol].filter(Boolean).join(',');

      filterStrings.push(`[${inputIndex}:a]${aFilterChain}[a${inputIndex}];`);

      inputIndex++;
    }
  }

  // Concat all video segments
  const concatInputs = Array.from(
    { length: inputIndex },
    (_, i) => `[v${i}][a${i}]`,
  ).join('');
  filterStrings.push(
    `${concatInputs}concat=n=${inputIndex}:v=1:a=1[basev][basea];`,
  );

  // 2. Process Audio Tracks
  const audioTracks = project.tracks.filter((t) => t.type === 'audio');
  const audioClips = audioTracks.flatMap((t) => t.clips) as MediaClip[];

  const amixInputs = ['[basea]'];

  for (const clip of audioClips) {
    const fileName = `input_a_${inputIndex}.mp3`;
    const fileData = clip.file
      ? await fetchFile(clip.file)
      : await fetchFile(clip.fileUrl);
    await ffmpeg.writeFile(fileName, fileData);
    inputs.push(`-i`, fileName);

    const speed = clip.speed ?? 1;
    const vol = clip.volume ?? 1;

    // Trim, speed, volume, and delay
    const aTrim = `atrim=start=${clip.mediaStart}:duration=${clip.duration},asetpts=PTS-STARTPTS`;
    const aSpeed = speed !== 1 ? `atempo=${speed}` : '';
    const aVol = vol !== 1 ? `volume=${vol}` : '';
    const aDelay = `adelay=${clip.startAt * 1000}|${clip.startAt * 1000}`;

    const aFilterChain = [aTrim, aSpeed, aVol, aDelay]
      .filter(Boolean)
      .join(',');
    filterStrings.push(`[${inputIndex}:a]${aFilterChain}[a${inputIndex}];`);

    amixInputs.push(`[a${inputIndex}]`);
    inputIndex++;
  }

  if (amixInputs.length > 1) {
    filterStrings.push(
      `${amixInputs.join('')}amix=inputs=${amixInputs.length}:duration=first:dropout_transition=2[outa]`,
    );
  } else {
    filterStrings.push(`[basea]anull[outa]`); // Just copy basea to outa
  }

  const complexFilter = filterStrings.join('');
  const outputFileName = 'output.mp4';

  const args = [
    ...inputs,
    '-filter_complex',
    complexFilter,
    '-map',
    '[basev]',
    '-map',
    '[outa]',
    '-c:v',
    'libx264',
    '-preset',
    'ultrafast',
    '-c:a',
    'aac',
    outputFileName,
  ];

  await ffmpeg.exec(args);
  const fileData = await ffmpeg.readFile(outputFileName);
  const blob = new Blob([fileData as any], { type: 'video/mp4' });

  return new File([blob], 'exported_studio.mp4', { type: 'video/mp4' });
}
