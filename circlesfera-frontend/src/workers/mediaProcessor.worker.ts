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

        const canvas = new OffscreenCanvas(imageBitmap.width, imageBitmap.height);
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
        const processedBlob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.95 });
        
        self.postMessage({ jobId, status: 'success', data: processedBlob });
        break;
      }

      case 'PROCESS_VIDEO':
        // TODO: Implement FFmpeg.wasm calls
        self.postMessage({ jobId, status: 'success', data: null });
        break;

      default:
        throw new Error(`Unknown job type: ${type}`);
    }
  } catch (error: any) {
    self.postMessage({ jobId, status: 'error', error: error.message });
  }
});
