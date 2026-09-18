import { UnrecoverableError } from 'bullmq';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SlackService } from '../slack.service.js';
import { SlackProcessor } from './slack.processor.js';

describe('SlackProcessor', () => {
  let processor: SlackProcessor;
  let mockSlackService: {
    sendDailyMorningBriefing: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockSlackService = {
      sendDailyMorningBriefing: vi.fn(),
    };
    processor = new SlackProcessor(mockSlackService as unknown as SlackService);
  });

  it('processes send-daily-morning-briefing job successfully', async () => {
    mockSlackService.sendDailyMorningBriefing.mockResolvedValue(undefined);

    const job = {
      name: 'send-daily-morning-briefing',
      id: 'job-1',
      data: {},
    } as any;

    await processor.process(job);

    expect(mockSlackService.sendDailyMorningBriefing).toHaveBeenCalled();
  });

  it('throws UnrecoverableError on unknown job name', async () => {
    const job = {
      name: 'unknown-slack-job',
      id: 'job-2',
      data: {},
    } as any;

    await expect(processor.process(job)).rejects.toThrow(UnrecoverableError);
  });
});
