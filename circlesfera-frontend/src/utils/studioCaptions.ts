import { editsService } from '../services/edits.service';

export async function pollCaptionsJob(
  projectId: string,
  jobId: string,
  signal: AbortSignal,
  maxAttempts = 60,
): Promise<{ start: number; end: number; text: string }[]> {
  for (let i = 0; i < maxAttempts; i++) {
    if (signal.aborted) {
      throw new Error('studio.captions.cancelled');
    }
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, 1500);
      const onAbort = () => {
        clearTimeout(timer);
        reject(new Error('studio.captions.cancelled'));
      };
      if (signal.aborted) {
        onAbort();
        return;
      }
      signal.addEventListener('abort', onAbort, { once: true });
    });
    if (signal.aborted) {
      throw new Error('studio.captions.cancelled');
    }
    const result = await editsService.getCaptionsJob(projectId, jobId);
    if (result.status === 'completed' && result.segments) {
      return result.segments;
    }
    if (result.status === 'failed') {
      throw new Error('studio.captions.error');
    }
  }
  throw new Error('studio.captions.timeout');
}
