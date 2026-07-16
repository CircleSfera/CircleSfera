/// <reference lib="webworker" />

// This Web Worker is prepared to handle heavy media processing tasks
// such as WebGL rendering, FFmpeg.wasm video transcoding, and large canvas manipulations
// off the main thread to ensure the UI remains fully responsive at 60fps.

self.addEventListener('message', async (e: MessageEvent) => {
  const { type, jobId, payload } = e.data;

  try {
    switch (type) {
      case 'APPLY_FILTER': {
        const { imageBitmap, filterString } = payload;

        if (!imageBitmap) {
          throw new Error('No imageBitmap provided');
        }

        const canvas = new OffscreenCanvas(
          imageBitmap.width,
          imageBitmap.height,
        );
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          throw new Error('Failed to get 2d context');
        }

        // Apply the CSS-like filter string (e.g. "brightness(110%) contrast(125%)")
        if (filterString) {
          ctx.filter = filterString;
        }

        ctx.drawImage(imageBitmap, 0, 0);

        // Convert back to blob or ImageBitmap
        const processedBlob = await canvas.convertToBlob({
          type: 'image/jpeg',
          quality: 0.95,
        });

        self.postMessage({ jobId, status: 'success', data: processedBlob });
        break;
      }

      case 'PROCESS_VIDEO': {
        const { file, options } = payload;

        if (!file) {
          throw new Error('No video file provided');
        }

        // Initialize FFmpeg
        const { FFmpeg } = await import('@ffmpeg/ffmpeg');
        const { fetchFile } = await import('@ffmpeg/util');

        const ffmpeg = new FFmpeg();

        // Listen to progress
        ffmpeg.on('progress', ({ progress }) => {
          self.postMessage({
            jobId,
            status: 'progress',
            progress: Math.round(progress * 100),
          });
        });

        // Load FFmpeg
        await ffmpeg.load({
          coreURL: '/ffmpeg/ffmpeg-core.js',
          wasmURL: '/ffmpeg/ffmpeg-core.wasm',
        });

        const inputName = 'input.mp4';
        const outputName = 'output.mp4';

        // Write file to memory
        await ffmpeg.writeFile(inputName, await fetchFile(file));

        // Construct arguments based on options (e.g. scale, trim)
        const args = ['-i', inputName];

        if (options?.scale) {
          args.push('-vf', `scale=${options.scale}`);
        }

        // Fast start for web playback and optimize
        args.push('-movflags', 'faststart');
        args.push('-vcodec', 'libx264');
        args.push('-crf', '28');
        args.push('-preset', 'superfast');

        args.push(outputName);

        // Execute command
        await ffmpeg.exec(args);

        // Read result
        const data = await ffmpeg.readFile(outputName);

        // Cleanup
        await ffmpeg.deleteFile(inputName);
        await ffmpeg.deleteFile(outputName);

        // Send back
        const processedBlob = new Blob([data as unknown as BlobPart], {
          type: 'video/mp4',
        });
        self.postMessage({ jobId, status: 'success', data: processedBlob });
        break;
      }

      default:
        throw new Error(`Unknown job type: ${type}`);
    }
  } catch (error: unknown) {
    self.postMessage({
      jobId,
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});
