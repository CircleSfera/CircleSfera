import { getQueueToken } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { SocketModule } from '../socket/socket.module.js';
import { ObservabilityModule } from './observability.module.js';
import { OperationalMetricsService } from './operational-metrics.service.js';

// The queues OperationalMetricsService injects.
const OBSERVED_QUEUES = [
  'video-transcoding',
  'notifications-processing',
  'chat-processing',
  'feed-fanout',
  'users-processing',
  'analytics-processing',
  'ai-processing',
];

@Module({})
class NoSocketModule {}

describe('ObservabilityModule', () => {
  it('gives the metrics service every queue it watches, so ADR-0024 queue alerts can fire', async () => {
    let builder = Test.createTestingModule({ imports: [ObservabilityModule] })
      .overrideModule(SocketModule)
      .useModule(NoSocketModule);
    // Only the connection to Redis is replaced: a queue the module does not
    // register is not overridden here, and stays missing.
    for (const name of OBSERVED_QUEUES) {
      builder = builder
        .overrideProvider(getQueueToken(name))
        .useValue({ name, getJobCounts: async () => ({}) });
    }
    const moduleRef = await builder.compile();

    const service = moduleRef.get(OperationalMetricsService);
    const tracked = (
      service as unknown as { getTrackedQueues(): { name: string }[] }
    ).getTrackedQueues();

    expect(tracked.map((queue) => queue.name).sort()).toEqual(
      [...OBSERVED_QUEUES].sort(),
    );
    await moduleRef.close();
  });
});
