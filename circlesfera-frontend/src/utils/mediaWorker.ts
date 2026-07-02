/**
 * Utility to instantiate the media processor Web Worker.
 * Safely guards against non-browser and test environments (like jsdom).
 */
export function createMediaProcessorWorker(): Worker | null {
  if (
    typeof window !== 'undefined' &&
    typeof Worker !== 'undefined' &&
    // Guard against JSDOM environment in Vitest
    !navigator.userAgent.includes('jsdom')
  ) {
    try {
      return new Worker(
        new URL('../workers/mediaProcessor.worker.ts', import.meta.url),
        { type: 'module' },
      );
    } catch (e) {
      console.warn('Failed to initialize media processor web worker:', e);
      return null;
    }
  }
  return null;
}
