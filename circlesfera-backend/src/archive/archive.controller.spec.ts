import { ValidationPipe } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { CurrentUserData } from '../auth/decorators/current-user.decorator.js';
import { ArchiveController, ArchivePageDto } from './archive.controller.js';
import type { ArchiveService } from './archive.service.js';

describe('ArchiveController', () => {
  const service = {
    list: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
    archive: vi.fn().mockResolvedValue({ id: 'p-1', archivedAt: new Date() }),
    unarchive: vi.fn().mockResolvedValue({ id: 'p-1' }),
  };
  const controller = new ArchiveController(
    service as unknown as ArchiveService,
  );
  const user = { userId: 'u-1', profileId: 'me' } as CurrentUserData;

  it('acts for the Profile of the session only', async () => {
    await expect(
      controller.list(user, { type: 'FRAME', cursor: 'c', limit: 10 }),
    ).resolves.toEqual({ items: [], nextCursor: null });
    expect(service.list).toHaveBeenCalledWith('me', 'FRAME', 'c', 10);

    await controller.archivePost(user, 'p-1');
    expect(service.archive).toHaveBeenCalledWith('me', 'p-1');

    await expect(controller.unarchivePost(user, 'p-1')).resolves.toEqual({
      id: 'p-1',
    });
    expect(service.unarchive).toHaveBeenCalledWith('me', 'p-1');
  });

  it('takes posts or frames only, and a page of up to 60', async () => {
    const pipe = new ValidationPipe({ transform: true, whitelist: true });
    const check = (value: Record<string, unknown>) =>
      pipe.transform(value, { type: 'query', metatype: ArchivePageDto });

    await expect(check({ type: 'POST', limit: '24' })).resolves.toMatchObject({
      type: 'POST',
      limit: 24,
    });
    for (const bad of [
      {},
      { type: 'STORY' },
      { type: 'POST', limit: '61' },
      { type: 'POST', limit: '0' },
      { type: 'POST', cursor: 'x'.repeat(201) },
    ]) {
      await expect(check(bad)).rejects.toThrow();
    }
  });
});
