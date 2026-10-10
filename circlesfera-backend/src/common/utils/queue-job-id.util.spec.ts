import { Job, type MinimalQueue } from 'bullmq';
import { describe, expect, it } from 'vitest';
import { queueJobId } from './queue-job-id.util.js';

// The rule of the queue library itself, not a copy of it: what it does with
// an id when a job is queued.
const libraryAccepts = (jobId: string) => {
  const queue = {
    toKey: (type: string) => `bull:test:${type}`,
    opts: {},
  } as unknown as MinimalQueue;
  try {
    const job = new Job(queue, 'work', {}, { jobId });
    (
      job as unknown as { validateOptions(data: unknown): void }
    ).validateOptions({});
    return true;
  } catch (error) {
    return (error as Error).message;
  }
};

describe('queueJobId', () => {
  const uuid = 'f3b0c1d2-4e5f-4a6b-8c7d-9e0f1a2b3c4d';

  it('joins its parts with a hyphen', () => {
    expect(queueJobId('transcode', uuid)).toBe(`transcode-${uuid}`);
  });

  it('leaves no colon, also when a part brings one', () => {
    expect(queueJobId('export:req-1')).toBe('export-req-1');
    expect(queueJobId('outbox', 'a:b')).toBe('outbox-a-b');
  });

  it.each([
    ['a video to process', queueJobId('transcode', uuid)],
    ['a data export', queueJobId('export', uuid)],
    ['an outbox event', queueJobId('outbox', uuid)],
    ['an id stored with a colon', queueJobId(`export:${uuid}`)],
  ])('is accepted by the queue library for %s', (_what, jobId) => {
    expect(libraryAccepts(jobId)).toBe(true);
  });

  it('replaces what the queue library refuses', () => {
    // The ids these jobs had before: each made its request fail.
    expect(libraryAccepts(`transcode:${uuid}`)).toBe(
      'Custom Id cannot contain :',
    );
    expect(libraryAccepts(`outbox:${uuid}`)).toBe('Custom Id cannot contain :');
  });
});
