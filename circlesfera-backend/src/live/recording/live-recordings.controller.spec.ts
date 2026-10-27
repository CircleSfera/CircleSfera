import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CurrentUserData } from '../../auth/decorators/current-user.decorator.js';
import { LiveRecordingsController } from './live-recordings.controller.js';
import type { LiveRecordingsService } from './live-recordings.service.js';

describe('LiveRecordingsController', () => {
  const recordings = {
    listArchive: vi.fn(async () => []),
    listPublished: vi.fn(async () => ({ data: [], nextCursor: null })),
    getOwn: vi.fn(async () => ({})),
    publish: vi.fn(async () => ({ publishedAt: new Date() })),
    remove: vi.fn(async () => ({ success: true })),
  };
  const controller = new LiveRecordingsController(
    recordings as unknown as LiveRecordingsService,
  );
  const user = { userId: 'u1', profileId: 'p1' } as CurrentUserData;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("acts for the session's Profile only", async () => {
    await controller.listArchive(user);
    expect(recordings.listArchive).toHaveBeenCalledWith('p1');

    await controller.getOwn(user, 's1');
    expect(recordings.getOwn).toHaveBeenCalledWith('p1', 's1');

    await controller.publish(user, 's1');
    expect(recordings.publish).toHaveBeenCalledWith('p1', 's1');

    await controller.remove(user, 's1');
    expect(recordings.remove).toHaveBeenCalledWith('p1', 's1');
  });

  it("lists a Profile's published recordings as the viewer sees them", async () => {
    await controller.listPublished(user, 'host', { cursor: 'c', limit: 5 });
    expect(recordings.listPublished).toHaveBeenCalledWith('host', 'p1', 'c', 5);
  });
});
