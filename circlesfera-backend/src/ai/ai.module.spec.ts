import type { Queue } from 'bullmq';
import { describe, expect, it, vi } from 'vitest';
import { AIModule, POST_TOPICS_SWEEP_SCHEDULE } from './ai.module.js';
import { ASSIGN_POST_TOPICS_JOB } from './processors/ai.processor.js';

describe('AIModule', () => {
  it('schedules the sweep that gives a topic to the posts without one', async () => {
    const queue = {
      getJobSchedulers: vi.fn().mockResolvedValue([]),
      getJobScheduler: vi.fn().mockResolvedValue(undefined),
      removeJobScheduler: vi.fn(),
      upsertJobScheduler: vi.fn(),
    };

    await new AIModule(queue as unknown as Queue).onApplicationBootstrap();

    expect(queue.upsertJobScheduler).toHaveBeenCalledWith(
      'post_topics_sweep',
      { pattern: POST_TOPICS_SWEEP_SCHEDULE },
      { name: ASSIGN_POST_TOPICS_JOB, data: {} },
    );
  });
});
